import { v4 as uuidv4 } from 'uuid';
import type { AuditEntry, ActionRequest } from '../../types/index';
import type { AuditRepository } from '../../db/repositories/audit';

export class AuditStore {
  constructor(private repo: AuditRepository) {}

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

    this.repo.insert(entry);
    console.log(`[Audit] ${entry.timestamp.toISOString()} | ${actor} | ${event} | action=${actionId}`);
    return entry;
  }

  getByActionId(actionId: string): AuditEntry[] {
    return this.repo.findByActionId(actionId);
  }

  getByServiceId(serviceId: string, limit = 50): AuditEntry[] {
    return this.repo.findByServiceId(serviceId, limit);
  }

  getAll(limit = 100): AuditEntry[] {
    return this.repo.findAll(limit);
  }
}
