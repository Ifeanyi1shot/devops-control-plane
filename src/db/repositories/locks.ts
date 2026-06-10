import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

type DB = Database.Database;

export interface ServiceLock {
  id: string;
  serviceId: string;
  lockedBy: string;
  reason: string;
  lockedAt: string;
  targetEnvironment: string | null;
  targetBranch: string | null;
}

export class LocksRepository {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  lock(
    serviceId: string,
    lockedBy: string,
    reason: string,
    targetEnvironment: string | null = null,
    targetBranch: string | null = null,
  ): ServiceLock {
    const entry: ServiceLock = {
      id: randomUUID(),
      serviceId,
      lockedBy,
      reason,
      lockedAt: new Date().toISOString(),
      targetEnvironment,
      targetBranch,
    };
    this.db.prepare(`
      INSERT INTO service_locks (id, service_id, locked_by, reason, locked_at, target_environment, target_branch)
      VALUES (@id, @serviceId, @lockedBy, @reason, @lockedAt, @targetEnvironment, @targetBranch)
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
    ).get(serviceId) as Record<string, string | null> | undefined;
    if (!row) return null;
    return this.toModel(row);
  }

  // Returns the lock only if it applies to the given environment.
  // A lock with no targetEnvironment applies to everything.
  findApplicable(serviceId: string, environment: string): ServiceLock | null {
    const row = this.db.prepare(`
      SELECT * FROM service_locks
      WHERE service_id = ?
        AND (target_environment IS NULL OR target_environment = ?)
    `).get(serviceId, environment) as Record<string, string | null> | undefined;
    if (!row) return null;
    return this.toModel(row);
  }

  findAll(): ServiceLock[] {
    const rows = this.db.prepare(
      'SELECT * FROM service_locks ORDER BY locked_at DESC'
    ).all() as Record<string, string | null>[];
    return rows.map((row) => this.toModel(row));
  }

  private toModel(row: Record<string, string | null>): ServiceLock {
    return {
      id: row['id'] as string,
      serviceId: row['service_id'] as string,
      lockedBy: row['locked_by'] as string,
      reason: row['reason'] as string,
      lockedAt: row['locked_at'] as string,
      targetEnvironment: row['target_environment'] ?? null,
      targetBranch: row['target_branch'] ?? null,
    };
  }
}
