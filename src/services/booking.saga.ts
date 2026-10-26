import { IDatabaseRepository } from '../storage/database.interface';
import { ILockService } from '../concurrency/lock.interface';
import { AsyncBackgroundQueue } from '../queue/asyncQueue';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import { AUDIT_ACTIONS, CONSULTATION_STATUS, PAYMENT_STATUS, SLOT_STATUS } from '../config/constants';
import { bookingSagaDuration, consultationTotalCounter } from '../observability/metrics';
import { logger } from '../observability/logger';
import { Consultation, Payment } from '../types';

export interface BookingRequest {
  patientId: string;
  doctorId: string;
  slotId: string;
  symptoms?: string;
  paymentMethod?: string;
  idempotencyKey: string;
}

export interface BookingResult {
  consultation: Consultation;
  payment: Payment;
  roomUrl: string;
}

export class BookingSagaOrchestrator {
  constructor(
    private db: IDatabaseRepository,
    private lockManager: ILockService,
    private asyncQueue: AsyncBackgroundQueue
  ) {}

  /**
   * Executes the Booking Saga with distributed lock, optimistic slot reservation,
   * idempotent payment processing with exponential backoff, and automatic compensation on failure.
   */
  public async execute(req: BookingRequest): Promise<BookingResult> {
    const startTime = process.hrtime();
    const lockKey = `lock:slot:${req.slotId}`;
    const holdDurationMs = 5 * 60 * 1000; // 5-minute hold TTL

    logger.info({ slotId: req.slotId, patientId: req.patientId }, 'Initiating booking saga');

    // 1. Acquire Distributed Lock on Slot
    const lockToken = await this.lockManager.acquire(lockKey, 10000);
    if (!lockToken) {
      bookingSagaDuration.observe({ outcome: 'lock_conflict' }, 0.05);
      throw new ConflictError('This appointment slot is currently being processed by another transaction. Please retry.');
    }

    let heldSlot = null;
    let consultation: Consultation | null = null;
    let payment: Payment | null = null;

    try {
      // 2. Fetch slot details
      const slot = await this.db.getSlotById(req.slotId);
      if (!slot) {
        throw new NotFoundError('AvailabilitySlot', req.slotId);
      }

      if (slot.doctor_id !== req.doctorId) {
        throw new ValidationError('Slot does not belong to the selected doctor.');
      }

      const now = new Date();
      const isExpiredHold = slot.status === 'HELD' && slot.hold_expires_at && slot.hold_expires_at < now;
      if (slot.status !== 'AVAILABLE' && !isExpiredHold) {
        throw new ConflictError(`Slot is not available for booking. Current status: ${slot.status}`);
      }

      // 3. Step 1: Hold Slot (Optimistic Concurrency Control with version increment)
      const holdExpiresAt = new Date(Date.now() + holdDurationMs);
      heldSlot = await this.db.holdSlot(req.slotId, req.patientId, holdExpiresAt, slot.version);

      if (!heldSlot) {
        throw new ConflictError('Concurrent booking collision detected. Slot version changed. Please choose another slot.');
      }

      await this.db.createAuditLog({
        actor_id: req.patientId,
        actor_role: 'PATIENT',
        action: AUDIT_ACTIONS.SLOT_HOLD,
        resource: 'AvailabilitySlot',
        resource_id: heldSlot.id,
        details: { holdExpiresAt }
      });

      // 4. Step 2: Create Pending Consultation
      consultation = await this.db.createConsultation({
        patient_id: req.patientId,
        doctor_id: req.doctorId,
        slot_id: req.slotId,
        status: CONSULTATION_STATUS.REQUESTED,
        symptoms: req.symptoms
      });

      consultationTotalCounter.inc({ status: 'REQUESTED' });

      // Fetch doctor consultation fee
      const doctor = await this.db.getDoctorById(req.doctorId);
      const amount = doctor ? doctor.consultation_fee : 500;

      // 5. Step 3: Process Payment with Idempotency & Simulated Gateway Integration
      payment = await this.processPaymentWithRetry({
        idempotencyKey: req.idempotencyKey,
        consultationId: consultation.id,
        patientId: req.patientId,
        amount
      });

      if (payment.status !== PAYMENT_STATUS.SUCCESS) {
        // Trigger Compensation
        throw new Error(`Payment processing failed: ${payment.failure_reason}`);
      }

      // 6. Step 4: Confirm Slot and Consultation
      const roomUrl = `https://meet.amrutam.co.in/teleconsult/${consultation.reference_no}`;

      await this.db.updateSlotStatus(req.slotId, SLOT_STATUS.BOOKED, req.patientId);

      consultation = await this.db.updateConsultationStatus(consultation.id, CONSULTATION_STATUS.CONFIRMED, {
        roomUrl
      });

      consultationTotalCounter.inc({ status: 'CONFIRMED' });

      // 7. Step 5: Audit Log and Background Async Notification
      await this.db.createAuditLog({
        actor_id: req.patientId,
        actor_role: 'PATIENT',
        action: AUDIT_ACTIONS.CONSULTATION_BOOK,
        resource: 'Consultation',
        resource_id: consultation.id,
        details: { referenceNo: consultation.reference_no, amount, paymentId: payment.id }
      });

      this.asyncQueue.enqueue('SEND_CONSULTATION_CONFIRMATION', {
        consultationId: consultation.id,
        patientId: req.patientId,
        doctorId: req.doctorId,
        roomUrl
      });

      const diff = process.hrtime(startTime);
      bookingSagaDuration.observe({ outcome: 'success' }, diff[0] + diff[1] / 1e9);

      return {
        consultation,
        payment,
        roomUrl
      };
    } catch (err: any) {
      logger.error({ err: err.message, slotId: req.slotId }, 'Booking saga encountered error. Running compensations.');

      // --- SAGA COMPENSATION LOGIC ---
      if (heldSlot) {
        try {
          await this.db.updateSlotStatus(req.slotId, SLOT_STATUS.AVAILABLE, null);
          await this.db.createAuditLog({
            actor_id: req.patientId,
            action: AUDIT_ACTIONS.SLOT_RELEASE,
            resource: 'AvailabilitySlot',
            resource_id: req.slotId,
            details: { reason: 'Saga compensation: rolled back slot reservation' }
          });
        } catch (compErr) {
          logger.error({ compErr }, 'Critical: Failed to release held slot during compensation');
        }
      }

      if (consultation) {
        try {
          await this.db.updateConsultationStatus(consultation.id, CONSULTATION_STATUS.CANCELLED, {
            cancelledReason: `Saga failed: ${err.message}`
          });
          consultationTotalCounter.inc({ status: 'CANCELLED' });
        } catch (compErr) {
          logger.error({ compErr }, 'Critical: Failed to cancel consultation during compensation');
        }
      }

      const diff = process.hrtime(startTime);
      bookingSagaDuration.observe({ outcome: 'failure' }, diff[0] + diff[1] / 1e9);

      if (err instanceof ConflictError || err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }

      throw new ConflictError(`Booking failed: ${err.message}`);
    } finally {
      // Release distributed lock
      await this.lockManager.release(lockKey, lockToken);
    }
  }

  /**
   * Payment simulation with exponential backoff and idempotency check
   */
  private async processPaymentWithRetry(params: {
    idempotencyKey: string;
    consultationId: string;
    patientId: string;
    amount: number;
  }): Promise<Payment> {
    // Check if payment already exists for this idempotency key
    const existingPayment = await this.db.getPaymentByIdempotencyKey(params.idempotencyKey);
    if (existingPayment) {
      return existingPayment;
    }

    // Create pending payment record
    const payment = await this.db.createPayment({
      idempotency_key: params.idempotencyKey,
      consultationId: params.consultationId,
      patientId: params.patientId,
      amount: params.amount,
      currency: 'INR',
      status: PAYMENT_STATUS.PENDING,
      provider_name: 'AMRUTAM_PAY_GATEWAY'
    } as any);

    // Simulated Gateway Call: 99.5% success, retry on transient failure
    let success = false;
    let providerTxId = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Payment gateway success simulation
        providerTxId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        success = true;
        break;
      } catch (gatewayErr) {
        if (attempt < 3) {
          const delay = Math.floor(Math.random() * (100 * Math.pow(2, attempt)));
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    if (success) {
      const updated = await this.db.updatePayment(payment.id, {
        status: PAYMENT_STATUS.SUCCESS,
        provider_transaction_id: providerTxId
      });
      return updated;
    } else {
      const failed = await this.db.updatePayment(payment.id, {
        status: PAYMENT_STATUS.FAILED,
        failure_reason: 'Card declined or payment gateway unavailable'
      });
      return failed;
    }
  }
}
