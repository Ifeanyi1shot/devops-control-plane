import type Database from 'better-sqlite3';

type DB = Database.Database;

export interface DailyCount {
  date: string;
  count: number;
}

export interface MetricsSummary {
  totalCompleted: number;
  totalRollbacks: number;
  changeFailureRate: number;
  avgMttrMinutes: number | null;
  deploymentsLast7Days: number;
  deploymentsLast30Days: number;
}

export class MetricsRepository {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  getSummary(): MetricsSummary {
    const totals = this.db.prepare(`
      SELECT
        COUNT(*) as total_completed,
        SUM(CASE WHEN action_type = 'rollback' THEN 1 ELSE 0 END) as total_rollbacks
      FROM audit_entries
      WHERE event = 'action.completed'
    `).get() as { total_completed: number; total_rollbacks: number };

    const last7 = this.db.prepare(`
      SELECT COUNT(*) as count FROM audit_entries
      WHERE event = 'action.completed'
        AND timestamp >= datetime('now', '-7 days')
    `).get() as { count: number };

    const last30 = this.db.prepare(`
      SELECT COUNT(*) as count FROM audit_entries
      WHERE event = 'action.completed'
        AND timestamp >= datetime('now', '-30 days')
    `).get() as { count: number };

    const mttr = this.db.prepare(`
      WITH times AS (
        SELECT
          action_id,
          MIN(CASE WHEN event = 'action.previewed' THEN timestamp END) AS started_at,
          MIN(CASE WHEN event = 'action.completed' THEN timestamp END) AS completed_at
        FROM audit_entries
        WHERE action_type = 'rollback'
        GROUP BY action_id
        HAVING started_at IS NOT NULL AND completed_at IS NOT NULL
      )
      SELECT AVG(
        (julianday(completed_at) - julianday(started_at)) * 24 * 60
      ) AS avg_minutes
      FROM times
    `).get() as { avg_minutes: number | null };

    const total = totals.total_completed ?? 0;
    const rollbacks = totals.total_rollbacks ?? 0;

    return {
      totalCompleted: total,
      totalRollbacks: rollbacks,
      changeFailureRate: total > 0 ? Math.round((rollbacks / total) * 100) : 0,
      avgMttrMinutes: mttr.avg_minutes !== null ? Math.round(mttr.avg_minutes) : null,
      deploymentsLast7Days: last7.count ?? 0,
      deploymentsLast30Days: last30.count ?? 0,
    };
  }

  getDeploymentFrequency(days = 30): DailyCount[] {
    const rows = this.db.prepare(`
      SELECT
        substr(timestamp, 1, 10) AS date,
        COUNT(*) AS count
      FROM audit_entries
      WHERE event = 'action.completed'
        AND timestamp >= datetime('now', '-${days} days')
      GROUP BY substr(timestamp, 1, 10)
      ORDER BY date ASC
    `).all() as { date: string; count: number }[];

    // Fill in missing days with zero
    const map = new Map(rows.map((r) => [r.date, r.count]));
    const result: DailyCount[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, count: map.get(key) ?? 0 });
    }
    return result;
  }

  getMttrTrend(days = 30): DailyCount[] {
    const rows = this.db.prepare(`
      WITH times AS (
        SELECT
          action_id,
          MIN(CASE WHEN event = 'action.previewed' THEN timestamp END) AS started_at,
          MIN(CASE WHEN event = 'action.completed' THEN timestamp END) AS completed_at
        FROM audit_entries
        WHERE action_type = 'rollback'
        GROUP BY action_id
        HAVING started_at IS NOT NULL AND completed_at IS NOT NULL
      )
      SELECT
        substr(completed_at, 1, 10) AS date,
        ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60)) AS count
      FROM times
      WHERE completed_at >= datetime('now', '-${days} days')
      GROUP BY substr(completed_at, 1, 10)
      ORDER BY date ASC
    `).all() as { date: string; count: number }[];

    return rows;
  }

  getTopActors(limit = 5): Array<{ actor: string; count: number }> {
    return this.db.prepare(`
      SELECT actor, COUNT(*) as count
      FROM audit_entries
      WHERE event = 'action.completed'
      GROUP BY actor
      ORDER BY count DESC
      LIMIT ?
    `).all(limit) as Array<{ actor: string; count: number }>;
  }

  getActionBreakdown(): Array<{ actionType: string; count: number }> {
    return this.db.prepare(`
      SELECT action_type as actionType, COUNT(*) as count
      FROM audit_entries
      WHERE event = 'action.completed'
      GROUP BY action_type
      ORDER BY count DESC
    `).all() as Array<{ actionType: string; count: number }>;
  }
}
