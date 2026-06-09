import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { ActionRequest, PolicyDecision, PolicyFile, PolicyRule } from '../../types/index';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function matchesField(value: string, pattern: string | string[] | undefined): boolean {
  if (!pattern) return true;
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some((p) => p === '*' || p.toLowerCase() === value.toLowerCase());
}

function getLocalDayAndHour(): { dayName: string; hour: number } {
  const tz = process.env['POLICY_TIMEZONE'];
  const now = new Date();

  if (tz) {
    // Use the configured timezone (e.g. "Africa/Lagos", "America/New_York")
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const dayName = parts.find((p) => p.type === 'weekday')?.value ?? DAYS[now.getDay()] ?? 'Sunday';
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? String(now.getHours());
    const hour = parseInt(hourStr, 10) % 24; // "24" is returned for midnight in some locales
    return { dayName, hour };
  }

  // Fall back to server local time
  return { dayName: DAYS[now.getDay()] ?? 'Sunday', hour: now.getHours() };
}

function checkTimeRestriction(rule: PolicyRule): { denied: boolean; reason: string } {
  if (!rule.timeRestriction) return { denied: false, reason: '' };

  const { dayName, hour } = getLocalDayAndHour();

  const { denyDays, denyAfterHour, denyBeforeHour } = rule.timeRestriction;

  if (denyDays && denyDays.includes(dayName)) {
    return { denied: true, reason: `Actions are not allowed on ${dayName} per policy "${rule.name}"` };
  }

  if (denyAfterHour !== undefined && hour >= denyAfterHour) {
    return {
      denied: true,
      reason: `Actions are not allowed after ${denyAfterHour}:00 per policy "${rule.name}"`,
    };
  }

  if (denyBeforeHour !== undefined && hour < denyBeforeHour) {
    return {
      denied: true,
      reason: `Actions are not allowed before ${denyBeforeHour}:00 per policy "${rule.name}"`,
    };
  }

  return { denied: false, reason: '' };
}

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  constructor(policyDir: string) {
    this.loadPolicies(policyDir);
  }

  private loadPolicies(dir: string): void {
    if (!fs.existsSync(dir)) {
      console.warn(`[PolicyEngine] Policy directory not found: ${dir}. Using default allow-all.`);
      return;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const parsed = yaml.load(content) as PolicyFile;
      if (parsed?.rules) {
        this.rules.push(...parsed.rules);
        console.log(`[PolicyEngine] Loaded ${parsed.rules.length} rule(s) from ${file}`);
      }
    }
  }

  evaluate(request: ActionRequest): PolicyDecision {
    // Evaluate rules top-to-bottom; first match wins
    for (const rule of this.rules) {
      const actionMatch = matchesField(request.type, rule.match.actionType);
      const envMatch = matchesField(request.environment, rule.match.environment);
      const roleMatch = matchesField(request.requestedByRole, rule.match.role);

      if (!actionMatch || !envMatch || !roleMatch) continue;

      // Matched — check time restriction
      const timeCheck = checkTimeRestriction(rule);
      if (timeCheck.denied) {
        return {
          allowed: false,
          requiresApproval: false,
          matchedRule: rule.name,
          reason: timeCheck.reason,
        };
      }

      if (!rule.allow) {
        return {
          allowed: false,
          requiresApproval: false,
          matchedRule: rule.name,
          reason: `Action denied by policy "${rule.name}": ${rule.description}`,
        };
      }

      return {
        allowed: true,
        requiresApproval: rule.requireApproval ?? false,
        approverRole: rule.approverRole,
        matchedRule: rule.name,
        reason: `Allowed by policy "${rule.name}"`,
      };
    }

    // Default deny — no rule matched
    return {
      allowed: false,
      requiresApproval: false,
      matchedRule: 'default-deny',
      reason: 'No policy rule matched this action. Default policy is DENY.',
    };
  }
}
