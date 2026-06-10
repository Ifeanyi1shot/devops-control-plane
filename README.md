# DevOps Control Plane

An AI-native internal developer platform for safely executing operational tasks — rollbacks, preview environments, and service management — with policy enforcement, Slack approval workflows, GitHub OAuth, and a full audit trail.

Built for engineering teams that want engineers to move fast without bypassing safety controls.

---

## What It Does

Production breaks at 2am. An engineer needs to roll back to the last known-good version. Normally this means:
- Pinging a senior engineer on Slack for approval
- Waiting for a response
- Manually running kubectl commands under pressure

This control plane replaces that entire flow with a single web interface:

1. Engineer logs in with GitHub — identity is verified, role is assigned automatically
2. Engineer selects a service and picks a commit from the real deployment history
3. The **AI Rollback Assistant** analyzes the diff and returns a risk level, plain-English summary, affected areas, and a post-rollback verification checklist
4. If the engineer's role requires it, a Slack message fires to the approver
5. The approver clicks **Approve** in Slack — the rollback executes automatically
6. Everything is logged in the audit trail

---

## Features

### GitHub OAuth
- Login with GitHub — no separate account creation needed
- JWT sessions (7-day expiry) stored in localStorage
- Role assignment from GitHub login: admins defined via `ADMIN_GITHUB_LOGINS` env var, everyone else gets `engineer`
- "Acting as" section auto-fills from the authenticated user with a **GitHub verified** badge
- NavBar shows avatar, display name, role, and a Sign out button

### AI Rollback Assistant (powered by Claude)
- When a commit is selected, an AI panel appears before the rollback form
- Claude analyzes the git diff (file patches + commit messages) between the current deploy and the rollback target
- Returns: risk level (low / medium / high / critical), plain-English summary, list of affected areas, and a step-by-step verification checklist
- Powered by `claude-haiku` for fast, low-cost analysis on every rollback decision
- Gracefully disabled when `ANTHROPIC_API_KEY` is not set

### Rollback Workflow
- View real deployment history pulled from GitHub Actions / GitHub Deployments API
- Three-tier fallback: Deployments API → workflow runs → branch commits
- Author avatars, clickable SHA links to GitHub, branch/ref labels, and source indicators on every row
- Click any row to select it as a rollback target
- Policy-gated execution: deny / self-service / requires-approval based on role + environment + time
- Weekend freeze policy blocks production changes on Saturdays and Sundays
- Kubernetes dry-run mode for safe testing without a live cluster

### Slack Approval Notifications
- Block Kit messages with Approve / Reject buttons sent to a configurable channel
- Signature verification on all incoming Slack callbacks
- Message updates on approve/reject — buttons replaced with outcome summary
- Inline approval also available directly in the web UI

### Preview Environments
- Spin up an ephemeral isolated copy of any service at any commit
- Full lifecycle: creating → running → destroying → destroyed
- Auto-transitions to running after K8s provisioning (simulated in dry-run mode)
- Status polling in the frontend so the UI updates live
- Use case 1: test a feature branch before it merges
- Use case 2: reproduce a production bug safely without touching live infra

### Policy Engine
- YAML-based rules with first-match-wins evaluation
- Supports: role matching, environment matching, time restrictions (deny days, deny after hour)
- Timezone-aware — set `POLICY_TIMEZONE` to enforce time windows in your local timezone
- Built-in rules: production weekend freeze, engineer requires approval, senior engineer self-service, staging open, preview environments open

### Deployment Locks
- Lock any service to block all rollbacks during incidents, freeze windows, or planned maintenance
- **Scoped locking**: lock by environment (production only, staging only, etc.) and/or branch — other environments stay unblocked
- A production-only lock never blocks a staging rollback; a service-wide lock blocks everything
- Visible everywhere: orange border and 🔒 badge on the Services list, full banner on the service detail page
- Lock banner shows who locked it, the reason, the scope (environment + branch chips), and how long ago
- Unlock with one click — no page reload needed
- All lock/unlock events recorded in the audit log (`service.locked` / `service.unlocked`)
- Locked services return HTTP 423 on any rollback attempt — API-safe
- Existing databases are migrated automatically on startup (no manual SQL needed)
- `GET/POST/DELETE /api/services/:id/lock` endpoints, plus `GET /api/locks` to list all locked services

### DORA Metrics Dashboard
- Dedicated `/metrics` page showing engineering performance from the audit log
- **Deployment Frequency** — completed actions per day over the last 30 days, bar chart
- **Mean Time to Recovery (MTTR)** — average and daily trend of time from rollback initiated to completed
- **Change Failure Rate** — percentage of completed actions that were rollbacks
- **Action Breakdown** — proportion of rollbacks vs deploys vs preview environments
- **Most Active** — top 5 actors by action count
- DORA benchmark reference panel (Elite / High / Medium thresholds)
- Zero new data collection needed — calculated entirely from the existing audit log

### Audit Log UI
- Dedicated `/audit` page in the web UI
- Color-coded event badges (completed, approved, executing, failed, rejected, etc.)
- Filter by service, live polling toggle (updates every 5 seconds), expandable JSON detail rows
- Every action logged: previewed, approved, rejected, executing, completed, failed
- Persisted to SQLite — survives server restarts

### Config-Driven Service Registry
- Services defined in `services.yaml` at the project root — no code changes needed to add a service
- Override the file path with `SERVICES_FILE` env var
- Supports all service fields: id, name, repo, namespace, deployment, owner, onCall, runbookUrl, tags

### Persistent Storage
- SQLite database (`data/control-plane.db`)
- Actions, audit entries, and preview environments all persisted on disk
- WAL mode enabled for safe concurrent reads

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  ServicesPage → ServiceDetailPage → RollbackPreviewPage  │
│  PreviewEnvsPage → AuditLogPage → AuthCallbackPage       │
└────────────────────────┬────────────────────────────────┘
                         │ /api/* (Vite proxy in dev)
┌────────────────────────▼────────────────────────────────┐
│                  Fastify Backend (TypeScript)            │
│                                                         │
│  PolicyEngine → ActionOrchestrator → AuditStore         │
│                                                         │
│  Integrations:                                          │
│    GitHub   — OAuth, deployment history, commit diffs   │
│    Anthropic — AI rollback analysis (Claude Haiku)      │
│    Kubernetes — rollback execution (dry-run supported)  │
│    Slack    — Block Kit approvals, signature verify     │
│                                                         │
│  Services:                                              │
│    RollbackService    — preview + execute rollbacks     │
│    PreviewEnvService  — manage ephemeral environments   │
│                                                         │
│  Database: SQLite via better-sqlite3                    │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Fastify, TypeScript |
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| Database | SQLite (better-sqlite3) |
| AI | Anthropic SDK (Claude Haiku) |
| Auth | GitHub OAuth + JWT (jsonwebtoken) |
| GitHub integration | Octokit REST |
| Kubernetes integration | @kubernetes/client-node |
| Slack integration | @slack/web-api |
| Policy | YAML rules engine (custom) |
| Dev tooling | ts-node, nodemon |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A GitHub personal access token (fine-grained, read access to your repos)
- A GitHub OAuth app (for login)
- An Anthropic API key (for AI rollback analysis — optional)
- A Slack app with `chat:write` scope and Interactivity enabled (optional)

### Installation

```bash
git clone https://github.com/Ifeanyi1shot/devops-control-plane.git
cd devops-control-plane
npm install
cd frontend && npm install && cd ..
```

### Configuration

```bash
cp .env.example .env
```

Key variables:

```env
PORT=3002
HOST=0.0.0.0

# GitHub — fine-grained token with read access to your repos
GITHUB_TOKEN=github_pat_...

# GitHub OAuth — create an app at github.com/settings/developers
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:3002/auth/github/callback
APP_URL=http://localhost:5173

# JWT — sign auth sessions (change in production)
JWT_SECRET=your-secret-here

# Admins — GitHub logins that get the admin role (comma-separated)
ADMIN_GITHUB_LOGINS=your-github-username

# Anthropic — enables AI rollback analysis (optional)
ANTHROPIC_API_KEY=sk-ant-...

# Policy timezone (defaults to UTC)
POLICY_TIMEZONE=Africa/Lagos

# Set to true when no real Kubernetes cluster is available
K8S_DRY_RUN=true

# Slack — required for approval notifications (optional)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APPROVAL_CHANNEL="#your-channel"
```

### GitHub OAuth App Setup

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set **Authorization callback URL** to `http://localhost:3002/auth/github/callback`
4. Copy Client ID and Client Secret into `.env`

### Running

Start the backend:
```bash
npm run dev
```

Start the frontend (separate terminal):
```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`

---

## Service Registry

Services are defined in `services.yaml` at the project root:

```yaml
services:
  - id: my-service
    name: My Service
    repo: my-org/my-service
    namespace: production
    deployment: my-service
    owner: platform-team
    onCall: platform-oncall
    runbookUrl: https://wiki.internal/runbooks/my-service
    tags:
      team: platform
      tier: critical
```

Restart the backend after editing — no code changes needed.

---

## Policy Configuration

Policies live in `policies/default.yaml`. Rules are evaluated top-to-bottom, first match wins.

```yaml
version: "1.0"
rules:
  # Block production on weekends
  - name: production-weekend-freeze
    match:
      actionType: "*"
      environment: production
    allow: false
    timeRestriction:
      denyDays: [Saturday, Sunday]

  # Engineers need approval for production rollbacks
  - name: production-rollback-requires-approval
    match:
      actionType: rollback
      environment: production
      role: [engineer, developer]
    allow: true
    requireApproval: true
    approverRole: senior-engineer

  # Senior engineers can self-approve
  - name: senior-production-rollback
    match:
      actionType: rollback
      environment: production
      role: senior-engineer
    allow: true
    requireApproval: false
```

---

## Slack Setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add OAuth scope: `chat:write`
3. Enable **Interactivity & Shortcuts** — set Request URL to `https://your-domain/slack/interactions`
4. Install the app to your workspace and invite the bot to your approval channel
5. Copy Bot Token, Signing Secret, and channel name into `.env`

For local development, use [ngrok](https://ngrok.com) to expose port 3002:
```bash
ngrok http 3002
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/auth/github` | Initiate GitHub OAuth login |
| GET | `/auth/github/callback` | OAuth callback — issues JWT |
| GET | `/auth/me` | Get current authenticated user |
| GET | `/api/services` | List all services |
| GET | `/api/services/:id` | Get service details |
| GET | `/api/services/:id/deployments` | Deployment history from GitHub |
| POST | `/api/rollback/preview` | Preview a rollback (policy check + diff) |
| POST | `/api/rollback/:id/execute` | Execute an approved rollback |
| POST | `/api/analyze` | AI rollback analysis (Claude) |
| POST | `/api/actions/:id/approve` | Approve a pending action |
| POST | `/api/actions/:id/reject` | Reject a pending action |
| GET | `/api/actions` | List all actions |
| POST | `/api/preview-env` | Create a preview environment |
| GET | `/api/preview-env` | List active preview environments |
| GET | `/api/preview-env/:id` | Get a single preview environment |
| DELETE | `/api/preview-env/:id` | Destroy a preview environment |
| GET | `/api/audit` | Global audit log |
| GET | `/api/audit/actions/:id` | Audit log for a specific action |
| GET | `/api/audit/services/:id` | Audit log for a specific service |
| GET | `/api/metrics` | DORA metrics (frequency, MTTR, CFR, breakdowns) |
| GET | `/api/services/:id/lock` | Get current lock for a service |
| POST | `/api/services/:id/lock` | Lock a service (blocks rollbacks) |
| DELETE | `/api/services/:id/lock` | Unlock a service |
| GET | `/api/locks` | List all currently locked services |
| POST | `/slack/interactions` | Slack interactive payload handler |

---

## Docker

```bash
docker build -t devops-control-plane .
docker run -p 3002:3002 \
  -e GITHUB_TOKEN=... \
  -e GITHUB_CLIENT_ID=... \
  -e GITHUB_CLIENT_SECRET=... \
  -e JWT_SECRET=... \
  -e ANTHROPIC_API_KEY=... \
  -v $(pwd)/data:/app/data \
  devops-control-plane
```

---

## Project Status

- [x] GitHub OAuth login with role assignment
- [x] AI-powered rollback analysis (Claude)
- [x] Real GitHub deployment history with avatars and commit links
- [x] Audit log UI with live polling and service filtering
- [x] Config-driven service registry (services.yaml)
- [x] Policy engine with timezone support
- [x] Slack approval workflow
- [x] Preview environments
- [x] SQLite persistence
- [x] Docker support
- [x] DORA metrics dashboard (deployment frequency, MTTR, change failure rate)
- [x] Deployment locks (block rollbacks during incidents or freeze windows)
- [ ] Real Kubernetes cluster integration
- [ ] Policy editor UI
- [ ] PR-based preview environment creation

---

## License

MIT
