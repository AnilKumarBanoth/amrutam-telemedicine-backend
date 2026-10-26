import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
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
import { IDatabaseRepository, DoctorSearchParams } from './database.interface';
import { SLOT_STATUS, CONSULTATION_STATUS, PAYMENT_STATUS, UserRole, SlotStatus, ConsultationStatus } from '../config/constants';
import { auditHashChainService, GENESIS_HASH } from '../security/hashChain';

export class MemoryDatabaseAdapter implements IDatabaseRepository {
  private users = new Map<string, User>();
  private profiles = new Map<string, Profile>();
  private doctors = new Map<string, Doctor>();
  private slots = new Map<string, AvailabilitySlot>();
  private consultations = new Map<string, Consultation>();
  private prescriptions = new Map<string, Prescription>();
  private payments = new Map<string, Payment>();
  private auditLogs: AuditLog[] = [];
  private idempotencyRecords = new Map<string, IdempotencyRecord>();

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData() {
    const passwordHash = bcrypt.hashSync('Password123!', 10);
    const now = new Date();

    // 1. Seed Admin
    const adminUser: User = {
      id: 'a0000000-0000-0000-0000-000000000001',
      email: 'admin@amrutam.co.in',
      password_hash: passwordHash,
      role: 'ADMIN',
      is_active: true,
      mfa_enabled: false,
      created_at: now,
      updated_at: now
    };
    this.users.set(adminUser.id, adminUser);

    // 2. Seed Auditor
    const auditorUser: User = {
      id: 'a0000000-0000-0000-0000-000000000002',
      email: 'compliance@amrutam.co.in',
      password_hash: passwordHash,
      role: 'AUDITOR',
      is_active: true,
      mfa_enabled: false,
      created_at: now,
      updated_at: now
    };
    this.users.set(auditorUser.id, auditorUser);

    // 3. Seed Doctor 1 (Dr. Priya Sharma)
    const doc1User: User = {
      id: 'd0000000-0000-0000-0000-000000000001',
      email: 'dr.priya@amrutam.co.in',
      password_hash: passwordHash,
      role: 'DOCTOR',
      is_active: true,
      mfa_enabled: false,
      created_at: now,
      updated_at: now
    };
    this.users.set(doc1User.id, doc1User);

    const doc1Profile: Profile = {
      id: uuidv4(),
      user_id: doc1User.id,
      first_name: 'Priya',
      last_name: 'Sharma',
      phone_number: '+919876543210',
      gender: 'FEMALE',
      address_city: 'Varanasi',
      address_state: 'Uttar Pradesh',
      created_at: now,
      updated_at: now
    };
    this.profiles.set(doc1User.id, doc1Profile);

    const doc1: Doctor = {
      id: 'b0000000-0000-0000-0000-000000000001',
      user_id: doc1User.id,
      registration_number: 'AYUSH-IN-2015-8891',
      specialization: 'Kayachikitsa (Internal Medicine)',
      sub_specialization: 'Digestive & Gut Health',
      experience_years: 12,
      consultation_fee: 750,
      languages: ['English', 'Hindi', 'Sanskrit'],
      bio: 'Senior Ayurvedic physician specializing in holistic healing, gut microbiome balance, and lifestyle harmony.',
      rating_avg: 4.92,
      rating_count: 215,
      is_verified: true,
      created_at: now,
      updated_at: now,
      profile: doc1Profile
    };
    this.doctors.set(doc1.id, doc1);

    // 4. Seed Doctor 2 (Dr. Arjun Nair)
    const doc2User: User = {
      id: 'd0000000-0000-0000-0000-000000000002',
      email: 'dr.arjun@amrutam.co.in',
      password_hash: passwordHash,
      role: 'DOCTOR',
      is_active: true,
      mfa_enabled: false,
      created_at: now,
      updated_at: now
    };
    this.users.set(doc2User.id, doc2User);

    const doc2Profile: Profile = {
      id: uuidv4(),
      user_id: doc2User.id,
      first_name: 'Arjun',
      last_name: 'Nair',
      phone_number: '+919876543211',
      gender: 'MALE',
      address_city: 'Kochi',
      address_state: 'Kerala',
      created_at: now,
      updated_at: now
    };
    this.profiles.set(doc2User.id, doc2Profile);

    const doc2: Doctor = {
      id: 'b0000000-0000-0000-0000-000000000002',
      user_id: doc2User.id,
      registration_number: 'AYUSH-KL-2018-4421',
      specialization: 'Twak Roga (Ayurvedic Dermatology)',
      sub_specialization: 'Psoriasis & Skin Detox',
      experience_years: 8,
      consultation_fee: 600,
      languages: ['English', 'Malayalam', 'Hindi'],
      bio: 'Kerala tradition trained Ayurvedic doctor focusing on chronic skin ailments and detox therapies.',
      rating_avg: 4.85,
      rating_count: 148,
      is_verified: true,
      created_at: now,
      updated_at: now,
      profile: doc2Profile
    };
    this.doctors.set(doc2.id, doc2);

    // 5. Seed Patient (Rahul Verma)
    const patientUser: User = {
      id: 'c0000000-0000-0000-0000-000000000001',
      email: 'patient.rahul@example.com',
      password_hash: passwordHash,
      role: 'PATIENT',
      is_active: true,
      mfa_enabled: false,
      created_at: now,
      updated_at: now
    };
    this.users.set(patientUser.id, patientUser);

    const patientProfile: Profile = {
      id: uuidv4(),
      user_id: patientUser.id,
      first_name: 'Rahul',
      last_name: 'Verma',
      phone_number: '+919988776655',
      date_of_birth: '1992-06-15',
      gender: 'MALE',
      blood_group: 'O+',
      emergency_contact: '+919988776600',
      address_city: 'Bengaluru',
      address_state: 'Karnataka',
      created_at: now,
      updated_at: now
    };
    this.profiles.set(patientUser.id, patientProfile);

    // 6. Generate Initial Slots for Doctors (Next 7 days)
    for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
      for (let hour = 10; hour <= 14; hour += 2) {
        const slotStart = new Date(now);
        slotStart.setDate(slotStart.getDate() + dayOffset);
        slotStart.setHours(hour, 0, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setHours(slotStart.getHours() + 1);

        const slot1: AvailabilitySlot = {
          id: uuidv4(),
          doctor_id: doc1.id,
          start_time: slotStart,
          end_time: slotEnd,
          status: 'AVAILABLE',
          version: 1,
          created_at: now,
          updated_at: now
        };
        this.slots.set(slot1.id, slot1);

        const slot2: AvailabilitySlot = {
          id: uuidv4(),
          doctor_id: doc2.id,
          start_time: slotStart,
          end_time: slotEnd,
          status: 'AVAILABLE',
          version: 1,
          created_at: now,
          updated_at: now
        };
        this.slots.set(slot2.id, slot2);
      }
    }
  }

  // --- Users ---
  public async createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const now = new Date();
    const newUser: User = {
      ...user,
      id: uuidv4(),
      created_at: now,
      updated_at: now
    };
    this.users.set(newUser.id, newUser);
    return { ...newUser };
  }

  public async getUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase().trim() === normalized) {
        return { ...user };
      }
    }
    return null;
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User ${id} not found`);
    const updated: User = {
      ...user,
      ...updates,
      updated_at: new Date()
    };
    this.users.set(id, updated);
    return { ...updated };
  }

  // --- Profiles ---
  public async createProfile(profile: Omit<Profile, 'id' | 'created_at' | 'updated_at'>): Promise<Profile> {
    const now = new Date();
    const newProfile: Profile = {
      ...profile,
      id: uuidv4(),
      created_at: now,
      updated_at: now
    };
    this.profiles.set(profile.user_id, newProfile);
    return { ...newProfile };
  }

  public async getProfileByUserId(userId: string): Promise<Profile | null> {
    const profile = this.profiles.get(userId);
    return profile ? { ...profile } : null;
  }

  public async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
    const profile = this.profiles.get(userId);
    if (!profile) {
      return this.createProfile({
        user_id: userId,
        first_name: updates.first_name || 'User',
        last_name: updates.last_name || '',
        ...updates
      });
    }
    const updated: Profile = {
      ...profile,
      ...updates,
      updated_at: new Date()
    };
    this.profiles.set(userId, updated);
    return { ...updated };
  }

  // --- Doctors ---
  public async createDoctor(doctor: Omit<Doctor, 'id' | 'created_at' | 'updated_at' | 'rating_avg' | 'rating_count' | 'is_verified'>): Promise<Doctor> {
    const now = new Date();
    const newDoc: Doctor = {
      ...doctor,
      id: uuidv4(),
      rating_avg: 5.0,
      rating_count: 0,
      is_verified: false,
      created_at: now,
      updated_at: now
    };
    this.doctors.set(newDoc.id, newDoc);
    return { ...newDoc };
  }

  public async getDoctorById(id: string): Promise<Doctor | null> {
    const doc = this.doctors.get(id);
    if (!doc) return null;
    const profile = this.profiles.get(doc.user_id);
    return { ...doc, profile };
  }

  public async getDoctorByUserId(userId: string): Promise<Doctor | null> {
    for (const doc of this.doctors.values()) {
      if (doc.user_id === userId) {
        const profile = this.profiles.get(userId);
        return { ...doc, profile };
      }
    }
    return null;
  }

  public async searchDoctors(params: DoctorSearchParams): Promise<{ doctors: Doctor[]; total: number }> {
    let result = Array.from(this.doctors.values());

    if (params.specialization) {
      const q = params.specialization.toLowerCase();
      result = result.filter(d => 
        d.specialization.toLowerCase().includes(q) || 
        (d.sub_specialization && d.sub_specialization.toLowerCase().includes(q))
      );
    }

    if (params.language) {
      const lang = params.language.toLowerCase();
      result = result.filter(d => d.languages.some(l => l.toLowerCase() === lang));
    }

    if (params.minRating !== undefined) {
      result = result.filter(d => d.rating_avg >= params.minRating!);
    }

    if (params.maxFee !== undefined) {
      result = result.filter(d => d.consultation_fee <= params.maxFee!);
    }

    const total = result.length;
    const offset = params.offset || 0;
    const limit = params.limit || 20;

    const paged = result.slice(offset, offset + limit).map(doc => ({
      ...doc,
      profile: this.profiles.get(doc.user_id)
    }));

    return { doctors: paged, total };
  }

  // --- Availability Slots ---
  public async createSlots(newSlots: Array<Omit<AvailabilitySlot, 'id' | 'status' | 'version' | 'created_at' | 'updated_at'>>): Promise<AvailabilitySlot[]> {
    const now = new Date();
    const created: AvailabilitySlot[] = [];

    for (const s of newSlots) {
      const slot: AvailabilitySlot = {
        ...s,
        id: uuidv4(),
        status: 'AVAILABLE',
        version: 1,
        created_at: now,
        updated_at: now
      };
      this.slots.set(slot.id, slot);
      created.push({ ...slot });
    }

    return created;
  }

  public async getSlotById(id: string): Promise<AvailabilitySlot | null> {
    const slot = this.slots.get(id);
    return slot ? { ...slot } : null;
  }

  public async getSlotsByDoctor(doctorId: string, startDate?: Date, endDate?: Date): Promise<AvailabilitySlot[]> {
    const results: AvailabilitySlot[] = [];
    for (const slot of this.slots.values()) {
      if (slot.doctor_id === doctorId) {
        if (startDate && new Date(slot.start_time) < startDate) continue;
        if (endDate && new Date(slot.end_time) > endDate) continue;
        results.push({ ...slot });
      }
    }
    return results.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }

  public async holdSlot(slotId: string, userId: string, holdExpiresAt: Date, expectedVersion: number): Promise<AvailabilitySlot | null> {
    const slot = this.slots.get(slotId);
    if (!slot) return null;

    const now = new Date();

    // Check if slot is available OR held but expired
    const isExpiredHold = slot.status === 'HELD' && slot.hold_expires_at && slot.hold_expires_at < now;
    const isAvailable = slot.status === 'AVAILABLE' || isExpiredHold;

    if (!isAvailable) {
      return null; // Slot already locked or booked
    }

    // Optimistic concurrency check: version must match
    if (slot.version !== expectedVersion) {
      return null;
    }

    // Update with version increment
    const updated: AvailabilitySlot = {
      ...slot,
      status: 'HELD',
      held_by_user_id: userId,
      held_at: now,
      hold_expires_at: holdExpiresAt,
      version: slot.version + 1,
      updated_at: now
    };

    this.slots.set(slotId, updated);
    return { ...updated };
  }

  public async updateSlotStatus(slotId: string, status: SlotStatus, heldByUserId?: string | null): Promise<AvailabilitySlot> {
    const slot = this.slots.get(slotId);
    if (!slot) throw new Error(`Slot ${slotId} not found`);

    const updated: AvailabilitySlot = {
      ...slot,
      status,
      held_by_user_id: heldByUserId === null ? undefined : (heldByUserId ?? slot.held_by_user_id),
      version: slot.version + 1,
      updated_at: new Date()
    };
    this.slots.set(slotId, updated);
    return { ...updated };
  }

  // --- Consultations ---
  public async createConsultation(consultation: Omit<Consultation, 'id' | 'reference_no' | 'created_at' | 'updated_at'>): Promise<Consultation> {
    const now = new Date();
    const referenceNo = `AMRU-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newConsultation: Consultation = {
      ...consultation,
      id: uuidv4(),
      reference_no: referenceNo,
      created_at: now,
      updated_at: now
    };
    this.consultations.set(newConsultation.id, newConsultation);
    return { ...newConsultation };
  }

  public async getConsultationById(id: string): Promise<Consultation | null> {
    const c = this.consultations.get(id);
    return c ? { ...c } : null;
  }

  public async getConsultationsByPatient(patientId: string): Promise<Consultation[]> {
    const results: Consultation[] = [];
    for (const c of this.consultations.values()) {
      if (c.patient_id === patientId) results.push({ ...c });
    }
    return results.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async getConsultationsByDoctor(doctorId: string): Promise<Consultation[]> {
    const results: Consultation[] = [];
    for (const c of this.consultations.values()) {
      if (c.doctor_id === doctorId) results.push({ ...c });
    }
    return results.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async updateConsultationStatus(
    id: string,
    status: ConsultationStatus,
    extra?: {
      symptoms?: string;
      clinicalNotesEncrypted?: string;
      diagnosisEncrypted?: string;
      roomUrl?: string;
      cancelledReason?: string;
      completedAt?: Date;
    }
  ): Promise<Consultation> {
    const c = this.consultations.get(id);
    if (!c) throw new Error(`Consultation ${id} not found`);

    const now = new Date();
    const updated: Consultation = {
      ...c,
      status,
      symptoms: extra?.symptoms ?? c.symptoms,
      clinical_notes_encrypted: extra?.clinicalNotesEncrypted ?? c.clinical_notes_encrypted,
      diagnosis_encrypted: extra?.diagnosisEncrypted ?? c.diagnosis_encrypted,
      room_url: extra?.roomUrl ?? c.room_url,
      cancelled_reason: extra?.cancelledReason ?? c.cancelled_reason,
      completed_at: extra?.completedAt ?? c.completed_at,
      updated_at: now
    };

    if (status === 'IN_PROGRESS' && !c.started_at) {
      updated.started_at = now;
    }

    this.consultations.set(id, updated);
    return { ...updated };
  }

  // --- Prescriptions ---
  public async createPrescription(prescription: Omit<Prescription, 'id' | 'created_at' | 'issued_at'>): Promise<Prescription> {
    const now = new Date();
    const p: Prescription = {
      ...prescription,
      id: uuidv4(),
      issued_at: now,
      created_at: now
    };
    this.prescriptions.set(p.id, p);
    return { ...p };
  }

  public async getPrescriptionByConsultationId(consultationId: string): Promise<Prescription | null> {
    for (const p of this.prescriptions.values()) {
      if (p.consultation_id === consultationId) return { ...p };
    }
    return null;
  }

  public async getPrescriptionById(id: string): Promise<Prescription | null> {
    const p = this.prescriptions.get(id);
    return p ? { ...p } : null;
  }

  // --- Payments ---
  public async createPayment(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> {
    const now = new Date();
    const newPayment: Payment = {
      ...payment,
      id: uuidv4(),
      created_at: now,
      updated_at: now
    };
    this.payments.set(newPayment.id, newPayment);
    return { ...newPayment };
  }

  public async getPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    for (const p of this.payments.values()) {
      if (p.idempotency_key === key) return { ...p };
    }
    return null;
  }

  public async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment> {
    const p = this.payments.get(id);
    if (!p) throw new Error(`Payment ${id} not found`);

    const updated: Payment = {
      ...p,
      ...updates,
      updated_at: new Date()
    };
    this.payments.set(id, updated);
    return { ...updated };
  }

  // --- Audit Logs (Cryptographically Hash-Chained) ---
  public async createAuditLog(log: Omit<AuditLog, 'id' | 'created_at' | 'previous_hash' | 'block_hash'>): Promise<AuditLog> {
    const lastLog = await this.getLastAuditLog();
    const previousHash = lastLog ? lastLog.block_hash : GENESIS_HASH;
    const now = new Date();
    const id = uuidv4();

    const blockHash = auditHashChainService.computeBlockHash({
      previousHash,
      id,
      actorId: log.actor_id,
      action: log.action,
      resource: log.resource,
      resourceId: log.resource_id,
      createdAt: now,
      details: log.details
    });

    const entry: AuditLog = {
      ...log,
      id,
      previous_hash: previousHash,
      block_hash: blockHash,
      created_at: now
    };

    this.auditLogs.push(entry);
    return { ...entry };
  }

  public async getLastAuditLog(): Promise<AuditLog | null> {
    if (this.auditLogs.length === 0) return null;
    return { ...this.auditLogs[this.auditLogs.length - 1] };
  }

  public async getAuditLogs(limit = 100, offset = 0): Promise<AuditLog[]> {
    return this.auditLogs.slice(offset, offset + limit).map(l => ({ ...l }));
  }

  // --- Idempotency ---
  public async getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotencyRecords.get(key);
    if (!record) return null;
    if (new Date() > record.expires_at) {
      this.idempotencyRecords.delete(key);
      return null;
    }
    return { ...record };
  }

  public async saveIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
    this.idempotencyRecords.set(record.key, { ...record });
  }

  // --- Analytics ---
  public async getAnalyticsSummary(): Promise<{
    totalConsultations: number;
    completedConsultations: number;
    cancelledConsultations: number;
    totalRevenue: number;
    activeDoctors: number;
    activePatients: number;
  }> {
    const totalConsultations = this.consultations.size;
    let completed = 0;
    let cancelled = 0;

    for (const c of this.consultations.values()) {
      if (c.status === 'COMPLETED') completed++;
      if (c.status === 'CANCELLED') cancelled++;
    }

    let totalRevenue = 0;
    for (const p of this.payments.values()) {
      if (p.status === 'SUCCESS') totalRevenue += p.amount;
    }

    return {
      totalConsultations,
      completedConsultations: completed,
      cancelledConsultations: cancelled,
      totalRevenue,
      activeDoctors: this.doctors.size,
      activePatients: Array.from(this.users.values()).filter(u => u.role === 'PATIENT').length
    };
  }
}

export const memoryDatabaseAdapter = new MemoryDatabaseAdapter();
