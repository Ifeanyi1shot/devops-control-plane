import type Database from 'better-sqlite3';
import type { AuditEntry, ActionRequest } from '../../types/index';

type DB = Database.Database;

function toRow(e: AuditEntry) {
  return {
    id: e.id,
    action_id: e.actionId,
    action_type: e.actionType,
    service_id: e.serviceId,
    actor: e.actor,
    event: e.event,
    detail: JSON.stringify(e.detail),
    timestamp: e.timestamp.toISOString(),
  };
}

function fromRow(row: Record<string, unknown>): AuditEntry {
  return {
    id: row['id'] as string,
    actionId: row['action_id'] as string,
    actionType: row['action_type'] as ActionRequest['type'],
    serviceId: row['service_id'] as string,
    actor: row['actor'] as string,
    event: row['event'] as string,
    detail: JSON.parse(row['detail'] as string) as Record<string, unknown>,
    timestamp: new Date(row['timestamp'] as string),
  };
}

export class AuditRepository {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  insert(entry: AuditEntry): void {
    this.db.prepare(`
      INSERT INTO audit_entries (id, action_id, action_type, service_id, actor, event, detail, timestamp)
      VALUES (@id, @action_id, @action_type, @service_id, @actor, @event, @detail, @timestamp)
    `).run(toRow(entry));
  }

  findByActionId(actionId: string): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_entries WHERE action_id = ? ORDER BY timestamp ASC'
    ).all(actionId) as Record<string, unknown>[];
    return rows.map(fromRow);
  }

  findByServiceId(serviceId: string, limit = 50): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_entries WHERE service_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(serviceId, limit) as Record<string, unknown>[];
    return rows.map(fromRow);
  }

  findAll(limit = 100): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_entries ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as Record<string, unknown>[];
    return rows.map(fromRow);
  }
}
