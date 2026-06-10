import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

type DB = Database.Database;

export interface ServiceLock {
  id: string;
  serviceId: string;
  lockedBy: string;
  reason: string;
  lockedAt: string;
}

export class LocksRepository {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  lock(serviceId: string, lockedBy: string, reason: string): ServiceLock {
    const entry: ServiceLock = {
      id: randomUUID(),
      serviceId,
      lockedBy,
      reason,
      lockedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO service_locks (id, service_id, locked_by, reason, locked_at)
      VALUES (@id, @serviceId, @lockedBy, @reason, @lockedAt)
    `).run(entry);
    return entry;
  }

  unlock(serviceId: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM service_locks WHERE service_id = ?'
    ).run(serviceId);
    return result.changes > 0;
  }

  findByServiceId(serviceId: string): ServiceLock | null {
    const row = this.db.prepare(
      'SELECT * FROM service_locks WHERE service_id = ?'
    ).get(serviceId) as Record<string, string> | undefined;
    if (!row) return null;
    return {
      id: row['id'],
      serviceId: row['service_id'],
      lockedBy: row['locked_by'],
      reason: row['reason'],
      lockedAt: row['locked_at'],
    };
  }

  findAll(): ServiceLock[] {
    const rows = this.db.prepare(
      'SELECT * FROM service_locks ORDER BY locked_at DESC'
    ).all() as Record<string, string>[];
    return rows.map((row) => ({
      id: row['id'],
      serviceId: row['service_id'],
      lockedBy: row['locked_by'],
      reason: row['reason'],
      lockedAt: row['locked_at'],
    }));
  }
}
