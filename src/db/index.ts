import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { ActionsRepository } from './repositories/actions';
import { AuditRepository } from './repositories/audit';
import { PreviewsRepository } from './repositories/previews';

export function createDatabase() {
  const dbPath = process.env['DB_PATH'] ?? path.join(process.cwd(), 'data', 'control-plane.db');

  // Ensure the data directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);

  // WAL mode: better write performance, safe concurrent reads
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS actions (
      id               TEXT PRIMARY KEY,
      type             TEXT NOT NULL,
      service_id       TEXT NOT NULL,
      requested_by     TEXT NOT NULL,
      environment      TEXT NOT NULL,
      params           TEXT NOT NULL,
      status           TEXT NOT NULL,
      preview          TEXT NOT NULL,
      approved_by      TEXT,
      rejected_by      TEXT,
      rejection_reason TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      completed_at     TEXT,
      error            TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_entries (
      id          TEXT PRIMARY KEY,
      action_id   TEXT NOT NULL,
      action_type TEXT NOT NULL,
      service_id  TEXT NOT NULL,
      actor       TEXT NOT NULL,
      event       TEXT NOT NULL,
      detail      TEXT NOT NULL,
      timestamp   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_action_id  ON audit_entries(action_id);
    CREATE INDEX IF NOT EXISTS idx_audit_service_id ON audit_entries(service_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp  ON audit_entries(timestamp);

    CREATE TABLE IF NOT EXISTS preview_environments (
      id           TEXT PRIMARY KEY,
      service_id   TEXT NOT NULL,
      service_name TEXT NOT NULL,
      branch       TEXT NOT NULL,
      commit_sha   TEXT NOT NULL,
      image        TEXT NOT NULL,
      namespace    TEXT NOT NULL,
      url          TEXT NOT NULL,
      status       TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      created_by   TEXT NOT NULL,
      destroyed_at TEXT,
      destroyed_by TEXT,
      error        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_preview_service_id ON preview_environments(service_id);
  `);

  console.log(`[DB] SQLite database ready at ${dbPath}`);

  return {
    actions:  new ActionsRepository(db),
    audit:    new AuditRepository(db),
    previews: new PreviewsRepository(db),
  };
}
