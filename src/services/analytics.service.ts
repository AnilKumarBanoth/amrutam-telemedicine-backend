import { IDatabaseRepository } from '../storage/database.interface';

export class AnalyticsService {
  constructor(private db: IDatabaseRepository) {}

  public async getDashboardAnalytics() {
    const summary = await this.db.getAnalyticsSummary();
    const completionRate = summary.totalConsultations > 0
      ? ((summary.completedConsultations / summary.totalConsultations) * 100).toFixed(1)
      : '100.0';

    return {
      overview: {
        totalConsultations: summary.totalConsultations,
        completedConsultations: summary.completedConsultations,
        cancelledConsultations: summary.cancelledConsultations,
        completionRatePercentage: `${completionRate}%`,
        totalRevenueInr: summary.totalRevenue,
        activeDoctorsCount: summary.activeDoctors,
        activePatientsCount: summary.activePatients
      },
      scaleMetrics: {
        dailyCapacityTarget: 100000,
        currentThroughputPercentage: ((summary.totalConsultations / 100000) * 100).toFixed(3) + '%',
        p95ReadLatencyTargetMs: '<200ms',
        p95WriteLatencyTargetMs: '<500ms',
        targetAvailability: '99.95%'
      },
      timestamp: new Date().toISOString()
    };
  }
}
