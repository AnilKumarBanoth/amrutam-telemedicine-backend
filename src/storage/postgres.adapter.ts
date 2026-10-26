import { Pool } from 'pg';
import { config } from '../config/env';
import { logger } from '../observability/logger';
import { IDatabaseRepository, DoctorSearchParams } from './database.interface';
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
import { memoryDatabaseAdapter } from './memory.adapter';

export class PostgresDatabaseAdapter implements IDatabaseRepository {
  private pool: Pool | null = null;
  private isConnected = false;

  constructor() {
    this.initPool();
  }

  private initPool() {
    try {
      this.pool = new Pool({
        host: config.DB_HOST,
        port: config.DB_PORT,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        database: config.DB_NAME,
        min: config.DB_POOL_MIN,
        max: config.DB_POOL_MAX,
        connectionTimeoutMillis: 2000
      });

      this.pool.on('error', (err) => {
        logger.error({ err }, 'PostgreSQL pool connection error. Falling back to in-memory store.');
        this.isConnected = false;
      });
    } catch (err) {
      logger.warn({ err }, 'Could not initialize PostgreSQL pool. Using in-memory fallback.');
      this.isConnected = false;
    }
  }

  public async checkHealth(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      this.isConnected = true;
      return true;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  // Graceful fallback helper: if postgres not connected, delegate to high-fidelity memory adapter
  private async withFallback<T>(fn: () => Promise<T>, fallbackFn: () => Promise<T>): Promise<T> {
    if (!this.isConnected || !this.pool) {
      return fallbackFn();
    }
    try {
      return await fn();
    } catch (err) {
      logger.warn({ err }, 'Postgres query failed. Falling back to memory adapter.');
      return fallbackFn();
    }
  }

  public async createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    return this.withFallback(
      async () => {
        const query = `
          INSERT INTO users (email, password_hash, role, is_active, mfa_enabled, mfa_secret)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *;
        `;
        const res = await this.pool!.query(query, [
          user.email,
          user.password_hash,
          user.role,
          user.is_active,
          user.mfa_enabled,
          user.mfa_secret || null
        ]);
        return res.rows[0];
      },
      () => memoryDatabaseAdapter.createUser(user)
    );
  }

  public async getUserById(id: string): Promise<User | null> {
    return this.withFallback(
      async () => {
        const res = await this.pool!.query('SELECT * FROM users WHERE id = $1', [id]);
        return res.rows[0] || null;
      },
      () => memoryDatabaseAdapter.getUserById(id)
    );
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    return this.withFallback(
      async () => {
        const res = await this.pool!.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        return res.rows[0] || null;
      },
      () => memoryDatabaseAdapter.getUserByEmail(email)
    );
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return this.withFallback(
      async () => {
        const setClauses: string[] = [];
        const values: any[] = [];
        let idx = 1;

        for (const [key, val] of Object.entries(updates)) {
          setClauses.push(`${key} = $${idx++}`);
          values.push(val);
        }
        setClauses.push(`updated_at = NOW()`);
        values.push(id);

        const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
        const res = await this.pool!.query(query, values);
        return res.rows[0];
      },
      () => memoryDatabaseAdapter.updateUser(id, updates)
    );
  }

  public async createProfile(profile: Omit<Profile, 'id' | 'created_at' | 'updated_at'>): Promise<Profile> {
    return this.withFallback(
      async () => {
        const query = `
          INSERT INTO profiles (user_id, first_name, last_name, phone_number, date_of_birth, gender, blood_group, emergency_contact, address_city, address_state)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *;
        `;
        const res = await this.pool!.query(query, [
          profile.user_id,
          profile.first_name,
          profile.last_name,
          profile.phone_number,
          profile.date_of_birth,
          profile.gender,
          profile.blood_group,
          profile.emergency_contact,
          profile.address_city,
          profile.address_state
        ]);
        return res.rows[0];
      },
      () => memoryDatabaseAdapter.createProfile(profile)
    );
  }

  public async getProfileByUserId(userId: string): Promise<Profile | null> {
    return this.withFallback(
      async () => {
        const res = await this.pool!.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
        return res.rows[0] || null;
      },
      () => memoryDatabaseAdapter.getProfileByUserId(userId)
    );
  }

  public async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
    return this.withFallback(
      async () => {
        const setClauses: string[] = [];
        const values: any[] = [];
        let idx = 1;
        for (const [key, val] of Object.entries(updates)) {
          setClauses.push(`${key} = $${idx++}`);
          values.push(val);
        }
        setClauses.push(`updated_at = NOW()`);
        values.push(userId);
        const query = `UPDATE profiles SET ${setClauses.join(', ')} WHERE user_id = $${idx} RETURNING *`;
        const res = await this.pool!.query(query, values);
        return res.rows[0];
      },
      () => memoryDatabaseAdapter.updateProfile(userId, updates)
    );
  }

  public async createDoctor(doctor: Omit<Doctor, 'id' | 'created_at' | 'updated_at' | 'rating_avg' | 'rating_count' | 'is_verified'>): Promise<Doctor> {
    return this.withFallback(
      async () => {
        const query = `
          INSERT INTO doctors (user_id, registration_number, specialization, sub_specialization, experience_years, consultation_fee, languages, bio)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *;
        `;
        const res = await this.pool!.query(query, [
          doctor.user_id,
          doctor.registration_number,
          doctor.specialization,
          doctor.sub_specialization,
          doctor.experience_years,
          doctor.consultation_fee,
          doctor.languages,
          doctor.bio
        ]);
        return res.rows[0];
      },
      () => memoryDatabaseAdapter.createDoctor(doctor)
    );
  }

  public async getDoctorById(id: string): Promise<Doctor | null> {
    return this.withFallback(
      async () => {
        const query = `
          SELECT d.*, row_to_json(p.*) AS profile 
          FROM doctors d
          LEFT JOIN profiles p ON d.user_id = p.user_id
          WHERE d.id = $1;
        `;
        const res = await this.pool!.query(query, [id]);
        return res.rows[0] || null;
      },
      () => memoryDatabaseAdapter.getDoctorById(id)
    );
  }

  public async getDoctorByUserId(userId: string): Promise<Doctor | null> {
    return this.withFallback(
      async () => {
        const query = `
          SELECT d.*, row_to_json(p.*) AS profile 
          FROM doctors d
          LEFT JOIN profiles p ON d.user_id = p.user_id
          WHERE d.user_id = $1;
        `;
        const res = await this.pool!.query(query, [userId]);
        return res.rows[0] || null;
      },
      () => memoryDatabaseAdapter.getDoctorByUserId(userId)
    );
  }

  public async searchDoctors(params: DoctorSearchParams): Promise<{ doctors: Doctor[]; total: number }> {
    return this.withFallback(
      async () => {
        const whereClauses: string[] = ['1=1'];
        const values: any[] = [];
        let idx = 1;

        if (params.specialization) {
          whereClauses.push(`(LOWER(specialization) LIKE $${idx} OR LOWER(sub_specialization) LIKE $${idx})`);
          values.push(`%${params.specialization.toLowerCase()}%`);
          idx++;
        }

        if (params.language) {
          whereClauses.push(`$${idx} = ANY(languages)`);
          values.push(params.language);
          idx++;
        }

        if (params.minRating !== undefined) {
          whereClauses.push(`rating_avg >= $${idx++}`);
          values.push(params.minRating);
        }

        if (params.maxFee !== undefined) {
          whereClauses.push(`consultation_fee <= $${idx++}`);
          values.push(params.maxFee);
        }

        const countQuery = `SELECT COUNT(*) FROM doctors WHERE ${whereClauses.join(' AND ')}`;
        const countRes = await this.pool!.query(countQuery, values);
        const total = parseInt(countRes.rows[0].count, 10);

        const limit = params.limit || 20;
        const offset = params.offset || 0;
        values.push(limit, offset);

        const dataQuery = `
          SELECT d.*, row_to_json(p.*) AS profile
          FROM doctors d
          LEFT JOIN profiles p ON d.user_id = p.user_id
          WHERE ${whereClauses.join(' AND ')}
          ORDER BY d.rating_avg DESC
          LIMIT $${idx++} OFFSET $${idx++};
        `;
        const dataRes = await this.pool!.query(dataQuery, values);

        return { doctors: dataRes.rows, total };
      },
      () => memoryDatabaseAdapter.searchDoctors(params)
    );
  }

  public async createSlots(slots: Array<Omit<AvailabilitySlot, 'id' | 'status' | 'version' | 'created_at' | 'updated_at'>>): Promise<AvailabilitySlot[]> {
    return this.withFallback(
      async () => {
        const client = await this.pool!.connect();
        try {
          await client.query('BEGIN');
          const created: AvailabilitySlot[] = [];
          for (const s of slots) {
            const res = await client.query(
              `INSERT INTO availability_slots (doctor_id, start_time, end_time, status, version)
               VALUES ($1, $2, $3, 'AVAILABLE', 1) RETURNING *;`,
              [s.doctor_id, s.start_time, s.end_time]
            );
            created.push(res.rows[0]);
          }
          await client.query('COMMIT');
          return created;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      () => memoryDatabaseAdapter.createSlots(slots)
    );
  }

  public async getSlotById(id: string): Promise<AvailabilitySlot | null> {
    return this.withFallback(
      async () => {
        const res = await this.pool!.query('SELECT * FROM availability_slots WHERE id = $1', [id]);
        return res.rows[0] || null;
      },
      () => memoryDatabaseAdapter.getSlotById(id)
    );
  }

  public async getSlotsByDoctor(doctorId: string, startDate?: Date, endDate?: Date): Promise<AvailabilitySlot[]> {
    return this.withFallback(
      async () => {
        let query = 'SELECT * FROM availability_slots WHERE doctor_id = $1';
        const vals: any[] = [doctorId];
        let idx = 2;
        if (startDate) {
          query += ` AND start_time >= $${idx++}`;
          vals.push(startDate);
        }
        if (endDate) {
          query += ` AND end_time <= $${idx++}`;
          vals.push(endDate);
        }
        query += ' ORDER BY start_time ASC';
        const res = await this.pool!.query(query, vals);
        return res.rows;
      },
      () => memoryDatabaseAdapter.getSlotsByDoctor(doctorId, startDate, endDate)
    );
  }

  public async holdSlot(slotId: string, userId: string, holdExpiresAt: Date, expectedVersion: number): Promise<AvailabilitySlot | null> {
    return this.withFallback(
      async () => {
        const query = `
          UPDATE availability_slots
          SET status = 'HELD', held_by_user_id = $1, held_at = NOW(), hold_expires_at = $2, version = version + 1, updated_at = NOW()
          WHERE id = $3 
            AND version = $4
            AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < NOW()))
          RETURNING *;
        `;
        const res = await this.pool!.query(query, [userId, holdExpiresAt, slotId, expectedVersion]);
        return res.rows[0] || null;
      },
      () => memoryDatabaseAdapter.holdSlot(slotId, userId, holdExpiresAt, expectedVersion)
    );
  }

  public async updateSlotStatus(slotId: string, status: SlotStatus, heldByUserId?: string | null): Promise<AvailabilitySlot> {
    return this.withFallback(
      async () => {
        const query = `
          UPDATE availability_slots
          SET status = $1, held_by_user_id = $2, version = version + 1, updated_at = NOW()
          WHERE id = $3
          RETURNING *;
        `;
        const res = await this.pool!.query(query, [status, heldByUserId ?? null, slotId]);
        return res.rows[0];
      },
      () => memoryDatabaseAdapter.updateSlotStatus(slotId, status, heldByUserId)
    );
  }

  public async createConsultation(consultation: Omit<Consultation, 'id' | 'reference_no' | 'created_at' | 'updated_at'>): Promise<Consultation> {
    return memoryDatabaseAdapter.createConsultation(consultation);
  }

  public async getConsultationById(id: string): Promise<Consultation | null> {
    return memoryDatabaseAdapter.getConsultationById(id);
  }

  public async getConsultationsByPatient(patientId: string): Promise<Consultation[]> {
    return memoryDatabaseAdapter.getConsultationsByPatient(patientId);
  }

  public async getConsultationsByDoctor(doctorId: string): Promise<Consultation[]> {
    return memoryDatabaseAdapter.getConsultationsByDoctor(doctorId);
  }

  public async updateConsultationStatus(id: string, status: ConsultationStatus, extra?: any): Promise<Consultation> {
    return memoryDatabaseAdapter.updateConsultationStatus(id, status, extra);
  }

  public async createPrescription(prescription: any): Promise<Prescription> {
    return memoryDatabaseAdapter.createPrescription(prescription);
  }

  public async getPrescriptionByConsultationId(consultationId: string): Promise<Prescription | null> {
    return memoryDatabaseAdapter.getPrescriptionByConsultationId(consultationId);
  }

  public async getPrescriptionById(id: string): Promise<Prescription | null> {
    return memoryDatabaseAdapter.getPrescriptionById(id);
  }

  public async createPayment(payment: any): Promise<Payment> {
    return memoryDatabaseAdapter.createPayment(payment);
  }

  public async getPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    return memoryDatabaseAdapter.getPaymentByIdempotencyKey(key);
  }

  public async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment> {
    return memoryDatabaseAdapter.updatePayment(id, updates);
  }

  public async createAuditLog(log: any): Promise<AuditLog> {
    return memoryDatabaseAdapter.createAuditLog(log);
  }

  public async getLastAuditLog(): Promise<AuditLog | null> {
    return memoryDatabaseAdapter.getLastAuditLog();
  }

  public async getAuditLogs(limit?: number, offset?: number): Promise<AuditLog[]> {
    return memoryDatabaseAdapter.getAuditLogs(limit, offset);
  }

  public async getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
    return memoryDatabaseAdapter.getIdempotencyRecord(key);
  }

  public async saveIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
    return memoryDatabaseAdapter.saveIdempotencyRecord(record);
  }

  public async getAnalyticsSummary(): Promise<any> {
    return memoryDatabaseAdapter.getAnalyticsSummary();
  }
}

export const postgresDatabaseAdapter = new PostgresDatabaseAdapter();
