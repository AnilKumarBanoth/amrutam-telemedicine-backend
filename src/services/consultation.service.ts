import { IDatabaseRepository } from '../storage/database.interface';
import { FieldEncryptionService } from '../security/encryption';
import { NotFoundError, ForbiddenError, ValidationError } from '../domain/errors';
import { AuthenticatedUserPayload, Consultation } from '../types';
import { AUDIT_ACTIONS, CONSULTATION_STATUS, ConsultationStatus } from '../config/constants';
import { activeConsultationsGauge, consultationTotalCounter } from '../observability/metrics';

export class ConsultationService {
  constructor(
    private db: IDatabaseRepository,
    private encryptionService: FieldEncryptionService
  ) {}

  public async getConsultationById(id: string, requester: AuthenticatedUserPayload): Promise<any> {
    const consultation = await this.db.getConsultationById(id);
    if (!consultation) {
      throw new NotFoundError('Consultation', id);
    }

    // Authorization check
    const isDoctor = requester.role === 'DOCTOR';
    const isPatient = requester.role === 'PATIENT';
    const isAdminOrAuditor = requester.role === 'ADMIN' || requester.role === 'AUDITOR';

    const doctorRecord = isDoctor ? await this.db.getDoctorByUserId(requester.userId) : null;
    const isAssignedDoctor = doctorRecord && doctorRecord.id === consultation.doctor_id;
    const isAssignedPatient = consultation.patient_id === requester.userId;

    if (!isAdminOrAuditor && !isAssignedDoctor && !isAssignedPatient) {
      throw new ForbiddenError('You are not authorized to access this consultation record.');
    }

    // Log PHI access audit event for regulatory compliance (HIPAA / DISHA)
    await this.db.createAuditLog({
      actor_id: requester.userId,
      actor_role: requester.role,
      action: AUDIT_ACTIONS.PHI_READ,
      resource: 'Consultation',
      resource_id: consultation.id,
      details: { referenceNo: consultation.reference_no }
    });

    // Decrypt clinical notes and diagnosis if present
    let decryptedNotes = null;
    let decryptedDiagnosis = null;

    if (consultation.clinical_notes_encrypted) {
      try {
        decryptedNotes = this.encryptionService.decrypt(consultation.clinical_notes_encrypted);
      } catch {
        decryptedNotes = '[ENCRYPTION_ERROR]';
      }
    }

    if (consultation.diagnosis_encrypted) {
      try {
        decryptedDiagnosis = this.encryptionService.decrypt(consultation.diagnosis_encrypted);
      } catch {
        decryptedDiagnosis = '[ENCRYPTION_ERROR]';
      }
    }

    return {
      ...consultation,
      clinical_notes: decryptedNotes,
      diagnosis: decryptedDiagnosis
    };
  }

  public async listUserConsultations(requester: AuthenticatedUserPayload): Promise<Consultation[]> {
    if (requester.role === 'PATIENT') {
      return this.db.getConsultationsByPatient(requester.userId);
    } else if (requester.role === 'DOCTOR') {
      const doctor = await this.db.getDoctorByUserId(requester.userId);
      if (!doctor) return [];
      return this.db.getConsultationsByDoctor(doctor.id);
    } else {
      // Admin/Auditor - default to patient queries
      return this.db.getConsultationsByPatient(requester.userId);
    }
  }

  public async updateStatus(
    id: string,
    newStatus: ConsultationStatus,
    requester: AuthenticatedUserPayload,
    extra?: { cancelledReason?: string }
  ): Promise<Consultation> {
    const consultation = await this.db.getConsultationById(id);
    if (!consultation) throw new NotFoundError('Consultation', id);

    const doctor = await this.db.getDoctorByUserId(requester.userId);
    const isAssignedDoctor = doctor && doctor.id === consultation.doctor_id;
    const isAdmin = requester.role === 'ADMIN';

    // State machine transitions:
    // CONFIRMED -> IN_PROGRESS
    // IN_PROGRESS -> COMPLETED
    // ANY -> CANCELLED
    if (newStatus === CONSULTATION_STATUS.IN_PROGRESS) {
      if (!isAssignedDoctor && !isAdmin) {
        throw new ForbiddenError('Only the assigned doctor can begin the consultation.');
      }
      activeConsultationsGauge.inc();
    } else if (newStatus === CONSULTATION_STATUS.COMPLETED) {
      if (!isAssignedDoctor && !isAdmin) {
        throw new ForbiddenError('Only the assigned doctor can complete the consultation.');
      }
      activeConsultationsGauge.dec();
      consultationTotalCounter.inc({ status: 'COMPLETED' });
    } else if (newStatus === CONSULTATION_STATUS.CANCELLED) {
      consultationTotalCounter.inc({ status: 'CANCELLED' });
    }

    const updated = await this.db.updateConsultationStatus(id, newStatus, {
      cancelledReason: extra?.cancelledReason,
      completedAt: newStatus === CONSULTATION_STATUS.COMPLETED ? new Date() : undefined
    });

    await this.db.createAuditLog({
      actor_id: requester.userId,
      actor_role: requester.role,
      action: AUDIT_ACTIONS.CONSULTATION_STATUS_CHANGE,
      resource: 'Consultation',
      resource_id: id,
      details: { fromStatus: consultation.status, toStatus: newStatus }
    });

    return updated;
  }

  public async updateClinicalNotes(
    id: string,
    requester: AuthenticatedUserPayload,
    notes: string,
    diagnosis: string
  ): Promise<void> {
    const consultation = await this.db.getConsultationById(id);
    if (!consultation) throw new NotFoundError('Consultation', id);

    const doctor = await this.db.getDoctorByUserId(requester.userId);
    if (!doctor || doctor.id !== consultation.doctor_id) {
      throw new ForbiddenError('Only the assigned consulting doctor can record clinical notes.');
    }

    // Encrypt sensitive Protected Health Information (PHI) with AES-256-GCM
    const encryptedNotes = this.encryptionService.encrypt(notes);
    const encryptedDiagnosis = this.encryptionService.encrypt(diagnosis);

    await this.db.updateConsultationStatus(id, consultation.status, {
      clinicalNotesEncrypted: encryptedNotes,
      diagnosisEncrypted: encryptedDiagnosis
    });

    await this.db.createAuditLog({
      actor_id: requester.userId,
      actor_role: requester.role,
      action: 'UPDATE_CLINICAL_NOTES',
      resource: 'Consultation',
      resource_id: id,
      details: { encrypted: true, algorithm: 'AES-256-GCM' }
    });
  }
}
