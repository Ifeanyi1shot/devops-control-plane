import Anthropic from '@anthropic-ai/sdk';

export interface RollbackAnalysis {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskReason: string;
  affectedAreas: string[];
  verificationSteps: string[];
}

interface DiffContext {
  repoName: string;
  currentSha: string;
  targetSha: string;
  reason: string;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
  commitMessages: string[];
  totalAdditions: number;
  totalDeletions: number;
}

const MAX_PATCH_LINES = 80;
const MAX_FILES = 12;

function truncatePatch(patch: string): string {
  const lines = patch.split('\n');
  if (lines.length <= MAX_PATCH_LINES) return patch;
  return lines.slice(0, MAX_PATCH_LINES).join('\n') + `\n... (${lines.length - MAX_PATCH_LINES} more lines truncated)`;
}

export class AiClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyzeRollback(ctx: DiffContext): Promise<RollbackAnalysis> {
    const filesBlock = ctx.files
      .slice(0, MAX_FILES)
      .map((f) => {
        const patch = f.patch ? `\n${truncatePatch(f.patch)}` : '';
        return `[${f.status.toUpperCase()}] ${f.filename} (+${f.additions}/-${f.deletions})${patch}`;
      })
      .join('\n\n');

    const commitsBlock = ctx.commitMessages.length > 0
      ? ctx.commitMessages.map((m) => `- ${m}`).join('\n')
      : '(no commit messages available)';

    const prompt = `You are a DevOps assistant analyzing a rollback operation.

A developer wants to roll back service "${ctx.repoName}" from commit ${ctx.currentSha.substring(0, 7)} back to ${ctx.targetSha.substring(0, 7)}.

Reason given: "${ctx.reason}"

Commits being reverted:
${commitsBlock}

Files changed (what will be undone by this rollback):
Total: +${ctx.totalAdditions} additions, -${ctx.totalDeletions} deletions across ${ctx.files.length} files

${filesBlock}

Analyze this rollback and respond with a JSON object (no markdown, just raw JSON) with exactly these fields:
{
  "summary": "2-3 sentence plain English description of what this rollback will undo and why it matters",
  "riskLevel": "low" | "medium" | "high" | "critical",
  "riskReason": "one sentence explaining why you chose that risk level",
  "affectedAreas": ["list", "of", "features", "endpoints", "or", "systems", "affected"],
  "verificationSteps": ["step 1 to verify after rollback", "step 2", "step 3"]
}

Risk level guide:
- low: config changes, docs, minor UI tweaks, test-only changes
- medium: non-critical feature changes, backend logic without DB migrations
- high: API changes, DB schema/data migrations, auth/security changes
- critical: payment flows, data loss risk, multiple services affected`;

    const message = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    try {
      return JSON.parse(text) as RollbackAnalysis;
    } catch {
      // Strip markdown fences if model added them anyway
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned) as RollbackAnalysis;
    }
  }
}
