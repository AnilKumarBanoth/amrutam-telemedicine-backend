import {
  User,
  Profile,
  Doctor,
  AvailabilitySlot,
  Consultation,
  Prescription,
  Payment,
  AuditLog,
  IdempotencyRecord
} from '../types';
import { SlotStatus, ConsultationStatus } from '../config/constants';

export interface DoctorSearchParams {
  specialization?: string;
  language?: string;
  minRating?: number;
  maxFee?: number;
  availableDate?: string;
  limit?: number;
  offset?: number;
}

export interface IDatabaseRepository {
  // Users
  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Profiles
  createProfile(profile: Omit<Profile, 'id' | 'created_at' | 'updated_at'>): Promise<Profile>;
  getProfileByUserId(userId: string): Promise<Profile | null>;
  updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile>;

  // Doctors
  createDoctor(doctor: Omit<Doctor, 'id' | 'created_at' | 'updated_at' | 'rating_avg' | 'rating_count' | 'is_verified'>): Promise<Doctor>;
  getDoctorById(id: string): Promise<Doctor | null>;
  getDoctorByUserId(userId: string): Promise<Doctor | null>;
  searchDoctors(params: DoctorSearchParams): Promise<{ doctors: Doctor[]; total: number }>;
  
  // Availability Slots
  createSlots(slots: Array<Omit<AvailabilitySlot, 'id' | 'status' | 'version' | 'created_at' | 'updated_at'>>): Promise<AvailabilitySlot[]>;
  getSlotById(id: string): Promise<AvailabilitySlot | null>;
  getSlotsByDoctor(doctorId: string, startDate?: Date, endDate?: Date): Promise<AvailabilitySlot[]>;
  
  /**
   * Concurrency-safe slot reservation with optimistic locking (version increment)
   */
  holdSlot(slotId: string, userId: string, holdExpiresAt: Date, expectedVersion: number): Promise<AvailabilitySlot | null>;
  
  /**
   * Confirm booked slot or release back to AVAILABLE
   */
  updateSlotStatus(slotId: string, status: SlotStatus, heldByUserId?: string | null): Promise<AvailabilitySlot>;

  // Consultations
  createConsultation(consultation: Omit<Consultation, 'id' | 'reference_no' | 'created_at' | 'updated_at'>): Promise<Consultation>;
  getConsultationById(id: string): Promise<Consultation | null>;
  getConsultationsByPatient(patientId: string): Promise<Consultation[]>;
  getConsultationsByDoctor(doctorId: string): Promise<Consultation[]>;
  updateConsultationStatus(id: string, status: ConsultationStatus, extra?: {
    symptoms?: string;
    clinicalNotesEncrypted?: string;
    diagnosisEncrypted?: string;
    roomUrl?: string;
    cancelledReason?: string;
    completedAt?: Date;
  }): Promise<Consultation>;

  // Prescriptions
  createPrescription(prescription: Omit<Prescription, 'id' | 'created_at' | 'issued_at'>): Promise<Prescription>;
  getPrescriptionByConsultationId(consultationId: string): Promise<Prescription | null>;
  getPrescriptionById(id: string): Promise<Prescription | null>;

  // Payments
  createPayment(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment>;
  getPaymentByIdempotencyKey(key: string): Promise<Payment | null>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment>;

  // Audit Logs (Cryptographically Hash-Chained)
  createAuditLog(log: Omit<AuditLog, 'id' | 'created_at' | 'previous_hash' | 'block_hash'>): Promise<AuditLog>;
  getLastAuditLog(): Promise<AuditLog | null>;
  getAuditLogs(limit?: number, offset?: number): Promise<AuditLog[]>;

  // Idempotency Keys
  getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null>;
  saveIdempotencyRecord(record: IdempotencyRecord): Promise<void>;

  // Analytics
  getAnalyticsSummary(): Promise<{
    totalConsultations: number;
    completedConsultations: number;
    cancelledConsultations: number;
    totalRevenue: number;
    activeDoctors: number;
    activePatients: number;
  }>;
}
