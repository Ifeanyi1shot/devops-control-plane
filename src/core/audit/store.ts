import { v4 as uuidv4 } from 'uuid';
import type { AuditEntry, ActionRequest } from '../../types/index';

// In-memory append-only audit store.
// Replace the private `entries` array with a PostgreSQL/ClickHouse write
// once a database is wired in — the interface stays identical.
export class AuditStore {
  private entries: AuditEntry[] = [];

  log(
    actionId: string,
    actionType: ActionRequest['type'],
    serviceId: string,
    actor: string,
    event: string,
    detail: Record<string, unknown> = {}
  ): AuditEntry {
    const entry: AuditEntry = {
      id: uuidv4(),
      actionId,
      actionType,
      serviceId,
      actor,
      event,
      detail,
      timestamp: new Date(),
    };

    this.entries.push(entry);
    console.log(`[Audit] ${entry.timestamp.toISOString()} | ${actor} | ${event} | action=${actionId}`);
    return entry;
  }

  getByActionId(actionId: string): AuditEntry[] {
    return this.entries.filter((e) => e.actionId === actionId);
  }

  getByServiceId(serviceId: string, limit = 50): AuditEntry[] {
    return this.entries
      .filter((e) => e.serviceId === serviceId)
      .slice(-limit)
      .reverse();
  }

  getAll(limit = 100): AuditEntry[] {
    return this.entries.slice(-limit).reverse();
  }
}

// Singleton — shared across the app
export const auditStore = new AuditStore();
