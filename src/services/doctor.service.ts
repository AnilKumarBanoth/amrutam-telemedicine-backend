import { IDatabaseRepository, DoctorSearchParams } from '../storage/database.interface';
import { NotFoundError, ValidationError } from '../domain/errors';

export class DoctorService {
  constructor(private db: IDatabaseRepository) {}

  public async searchDoctors(params: DoctorSearchParams) {
    return this.db.searchDoctors(params);
  }

  public async getDoctorById(id: string) {
    const doctor = await this.db.getDoctorById(id);
    if (!doctor) {
      throw new NotFoundError('Doctor', id);
    }
    return doctor;
  }

  public async getDoctorAvailability(doctorId: string, startDate?: Date, endDate?: Date) {
    // Validate doctor exists
    await this.getDoctorById(doctorId);
    return this.db.getSlotsByDoctor(doctorId, startDate, endDate);
  }

  public async createAvailabilitySlots(doctorId: string, slotsData: Array<{ startTime: string | Date; endTime: string | Date }>) {
    await this.getDoctorById(doctorId);

    if (!slotsData || slotsData.length === 0) {
      throw new ValidationError('At least one availability slot must be provided.');
    }

    const formattedSlots = slotsData.map(s => {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      if (end <= start) {
        throw new ValidationError(`End time (${end.toISOString()}) must be after start time (${start.toISOString()})`);
      }
      return {
        doctor_id: doctorId,
        start_time: start,
        end_time: end
      };
    });

    return this.db.createSlots(formattedSlots);
  }
}
