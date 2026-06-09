import type Database from 'better-sqlite3';
import type { PreviewEnvironment } from '../../types/index';

type DB = Database.Database;

function toRow(p: PreviewEnvironment) {
  return {
    id: p.id,
    service_id: p.serviceId,
    service_name: p.serviceName,
    branch: p.branch,
    commit_sha: p.commitSha,
    image: p.image,
    namespace: p.namespace,
    url: p.url,
    status: p.status,
    created_at: p.createdAt.toISOString(),
    created_by: p.createdBy,
    destroyed_at: p.destroyedAt?.toISOString() ?? null,
    destroyed_by: p.destroyedBy ?? null,
    error: p.error ?? null,
  };
}

function fromRow(row: Record<string, unknown>): PreviewEnvironment {
  return {
    id: row['id'] as string,
    serviceId: row['service_id'] as string,
    serviceName: row['service_name'] as string,
    branch: row['branch'] as string,
    commitSha: row['commit_sha'] as string,
    image: row['image'] as string,
    namespace: row['namespace'] as string,
    url: row['url'] as string,
    status: row['status'] as PreviewEnvironment['status'],
    createdAt: new Date(row['created_at'] as string),
    createdBy: row['created_by'] as string,
    destroyedAt: row['destroyed_at'] ? new Date(row['destroyed_at'] as string) : undefined,
    destroyedBy: (row['destroyed_by'] as string | null) ?? undefined,
    error: (row['error'] as string | null) ?? undefined,
  };
}

export class PreviewsRepository {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  save(preview: PreviewEnvironment): void {
    this.db.prepare(`
      INSERT INTO preview_environments
        (id, service_id, service_name, branch, commit_sha, image, namespace, url,
         status, created_at, created_by, destroyed_at, destroyed_by, error)
      VALUES
        (@id, @service_id, @service_name, @branch, @commit_sha, @image, @namespace, @url,
         @status, @created_at, @created_by, @destroyed_at, @destroyed_by, @error)
    `).run(toRow(preview));
  }

  update(preview: PreviewEnvironment): void {
    const row = toRow(preview);
    this.db.prepare(`
      UPDATE preview_environments SET
        status       = @status,
        destroyed_at = @destroyed_at,
        destroyed_by = @destroyed_by,
        error        = @error
      WHERE id = @id
    `).run(row);
  }

  findById(id: string): PreviewEnvironment | undefined {
    const row = this.db.prepare('SELECT * FROM preview_environments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? fromRow(row) : undefined;
  }

  findActive(serviceId?: string): PreviewEnvironment[] {
    if (serviceId) {
      const rows = this.db.prepare(
        "SELECT * FROM preview_environments WHERE service_id = ? AND status != 'destroyed' ORDER BY created_at DESC"
      ).all(serviceId) as Record<string, unknown>[];
      return rows.map(fromRow);
    }
    const rows = this.db.prepare(
      "SELECT * FROM preview_environments WHERE status != 'destroyed' ORDER BY created_at DESC"
    ).all() as Record<string, unknown>[];
    return rows.map(fromRow);
  }
}
