import { IDatabaseRepository } from '../storage/database.interface';
import { FieldEncryptionService } from '../security/encryption';
import { NotFoundError, ForbiddenError, ValidationError } from '../domain/errors';
import { AuthenticatedUserPayload, PrescriptionMedication } from '../types';
import { AUDIT_ACTIONS } from '../config/constants';

export class PrescriptionService {
  constructor(
    private db: IDatabaseRepository,
    private encryptionService: FieldEncryptionService
  ) {}

  public async issuePrescription(
    consultationId: string,
    doctorUser: AuthenticatedUserPayload,
    medications: PrescriptionMedication[],
    instructions?: string
  ) {
    if (!medications || medications.length === 0) {
      throw new ValidationError('A prescription must contain at least one medication item.');
    }

    const consultation = await this.db.getConsultationById(consultationId);
    if (!consultation) {
      throw new NotFoundError('Consultation', consultationId);
    }

    const doctor = await this.db.getDoctorByUserId(doctorUser.userId);
    if (!doctor || doctor.id !== consultation.doctor_id) {
      throw new ForbiddenError('Only the assigned doctor can issue a prescription for this consultation.');
    }

    // Check if prescription already issued
    const existing = await this.db.getPrescriptionByConsultationId(consultationId);
    if (existing) {
      throw new ValidationError('A digital prescription has already been issued for this consultation.');
    }

    // Generate cryptographic digital signature
    const signaturePayload = {
      consultationId,
      doctorId: doctor.id,
      patientId: consultation.patient_id,
      medications,
      issuedAt: new Date().toISOString()
    };
    const digitalSignature = this.encryptionService.signPrescription(signaturePayload);

    // Encrypt sensitive medication details with AES-256-GCM
    const encryptedMedications = this.encryptionService.encrypt(medications);
    const encryptedInstructions = instructions ? this.encryptionService.encrypt(instructions) : undefined;

    const prescription = await this.db.createPrescription({
      consultation_id: consultationId,
      doctor_id: doctor.id,
      patient_id: consultation.patient_id,
      medications_encrypted: encryptedMedications,
      instructions_encrypted: encryptedInstructions,
      digital_signature: digitalSignature,
      key_version: 'v1'
    });

    await this.db.createAuditLog({
      actor_id: doctorUser.userId,
      actor_role: doctorUser.role,
      action: AUDIT_ACTIONS.PRESCRIPTION_ISSUE,
      resource: 'Prescription',
      resource_id: prescription.id,
      details: {
        consultationId,
        digitalSignature: digitalSignature.substring(0, 16) + '...'
      }
    });

    return {
      id: prescription.id,
      consultationId: prescription.consultation_id,
      digitalSignature: prescription.digital_signature,
      issuedAt: prescription.issued_at,
      medications,
      instructions
    };
  }

  public async getPrescriptionByConsultation(
    consultationId: string,
    requester: AuthenticatedUserPayload
  ) {
    const consultation = await this.db.getConsultationById(consultationId);
    if (!consultation) throw new NotFoundError('Consultation', consultationId);

    const prescription = await this.db.getPrescriptionByConsultationId(consultationId);
    if (!prescription) {
      throw new NotFoundError('Prescription for consultation', consultationId);
    }

    // Access control
    const isDoctor = requester.role === 'DOCTOR';
    const doctorRecord = isDoctor ? await this.db.getDoctorByUserId(requester.userId) : null;
    const isAssignedDoctor = doctorRecord && doctorRecord.id === prescription.doctor_id;
    const isAssignedPatient = consultation.patient_id === requester.userId;
    const isAdminOrAuditor = requester.role === 'ADMIN' || requester.role === 'AUDITOR';

    if (!isAdminOrAuditor && !isAssignedDoctor && !isAssignedPatient) {
      throw new ForbiddenError('You are not authorized to view this prescription.');
    }

    // Decrypt medications
    const medications = this.encryptionService.decrypt<PrescriptionMedication[]>(prescription.medications_encrypted);
    const instructions = prescription.instructions_encrypted
      ? this.encryptionService.decrypt<string>(prescription.instructions_encrypted)
      : undefined;

    return {
      id: prescription.id,
      consultationId: prescription.consultation_id,
      doctorId: prescription.doctor_id,
      patientId: prescription.patient_id,
      digitalSignature: prescription.digital_signature,
      issuedAt: prescription.issued_at,
      medications,
      instructions
    };
  }
}
