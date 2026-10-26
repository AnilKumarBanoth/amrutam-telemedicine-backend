import { UserRole, SlotStatus, ConsultationStatus, PaymentStatus } from '../config/constants';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  mfa_enabled: boolean;
  mfa_secret?: string;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  emergency_contact?: string;
  address_city?: string;
  address_state?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Doctor {
  id: string;
  user_id: string;
  registration_number: string;
  specialization: string;
  sub_specialization?: string;
  experience_years: number;
  consultation_fee: number;
  languages: string[];
  bio?: string;
  rating_avg: number;
  rating_count: number;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  profile?: Profile;
}

export interface AvailabilitySlot {
  id: string;
  doctor_id: string;
  start_time: Date;
  end_time: Date;
  status: SlotStatus;
  held_by_user_id?: string;
  held_at?: Date;
  hold_expires_at?: Date;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface Consultation {
  id: string;
  reference_no: string;
  patient_id: string;
  doctor_id: string;
  slot_id: string;
  status: ConsultationStatus;
  symptoms?: string;
  clinical_notes_encrypted?: string;
  diagnosis_encrypted?: string;
  room_url?: string;
  cancelled_reason?: string;
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PrescriptionMedication {
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration_days: number;
  instructions: string;
}

export interface Prescription {
  id: string;
  consultation_id: string;
  doctor_id: string;
  patient_id: string;
  medications_encrypted: string;
  instructions_encrypted?: string;
  digital_signature: string;
  key_version: string;
  issued_at: Date;
  created_at: Date;
}

export interface Payment {
  id: string;
  idempotency_key: string;
  consultation_id: string;
  patient_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider_name: string;
  provider_transaction_id?: string;
  failure_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_role?: string;
  action: string;
  resource: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, any>;
  previous_hash: string;
  block_hash: string;
  created_at: Date;
}

export interface IdempotencyRecord {
  key: string;
  user_id?: string;
  request_hash: string;
  response_code: number;
  response_body: any;
  expires_at: Date;
  created_at: Date;
}

export interface AuthenticatedUserPayload {
  userId: string;
  email: string;
  role: UserRole;
  mfaVerified?: boolean;
}
