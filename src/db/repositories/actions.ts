import type Database from 'better-sqlite3';
import type { Action } from '../../types/index';

type DB = Database.Database;

function toRow(a: Action) {
  return {
    id: a.id,
    type: a.type,
    service_id: a.serviceId,
    requested_by: a.requestedBy,
    environment: a.environment,
    params: JSON.stringify(a.params),
    status: a.status,
    preview: JSON.stringify(a.preview),
    approved_by: a.approvedBy ?? null,
    rejected_by: a.rejectedBy ?? null,
    rejection_reason: a.rejectionReason ?? null,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
    completed_at: a.completedAt?.toISOString() ?? null,
    error: a.error ?? null,
  };
}

function fromRow(row: Record<string, unknown>): Action {
  return {
    id: row['id'] as string,
    type: row['type'] as Action['type'],
    serviceId: row['service_id'] as string,
    requestedBy: row['requested_by'] as string,
    environment: row['environment'] as string,
    params: JSON.parse(row['params'] as string) as Record<string, unknown>,
    status: row['status'] as Action['status'],
    preview: JSON.parse(row['preview'] as string),
    approvedBy: (row['approved_by'] as string | null) ?? undefined,
    rejectedBy: (row['rejected_by'] as string | null) ?? undefined,
    rejectionReason: (row['rejection_reason'] as string | null) ?? undefined,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
    completedAt: row['completed_at'] ? new Date(row['completed_at'] as string) : undefined,
    error: (row['error'] as string | null) ?? undefined,
  };
}

export class ActionsRepository {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  save(action: Action): void {
    this.db.prepare(`
      INSERT INTO actions
        (id, type, service_id, requested_by, environment, params, status, preview,
         approved_by, rejected_by, rejection_reason, created_at, updated_at, completed_at, error)
      VALUES
        (@id, @type, @service_id, @requested_by, @environment, @params, @status, @preview,
         @approved_by, @rejected_by, @rejection_reason, @created_at, @updated_at, @completed_at, @error)
    `).run(toRow(action));
  }

  update(action: Action): void {
    const row = toRow(action);
    this.db.prepare(`
      UPDATE actions SET
        status            = @status,
        approved_by       = @approved_by,
        rejected_by       = @rejected_by,
        rejection_reason  = @rejection_reason,
        updated_at        = @updated_at,
        completed_at      = @completed_at,
        error             = @error
      WHERE id = @id
    `).run(row);
  }

  findById(id: string): Action | undefined {
    const row = this.db.prepare('SELECT * FROM actions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? fromRow(row) : undefined;
  }

  findAll(): Action[] {
    const rows = this.db.prepare('SELECT * FROM actions ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(fromRow);
  }
}
