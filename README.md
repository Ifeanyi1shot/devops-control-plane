# DevOps Control Plane

An AI-native internal developer platform for safely executing operational tasks — rollbacks, preview environments, and service management — with policy enforcement, Slack approval workflows, and a full audit trail.

Built for engineering teams that want engineers to move fast without bypassing safety controls.

---

## What It Does

Production breaks at 2am. An engineer needs to roll back to the last known-good version. Normally this means:
- Pinging a senior engineer on Slack for approval
- Waiting for a response
- Manually running kubectl commands under pressure

This control plane replaces that entire flow with a single web interface:

1. Engineer selects a service and picks a commit from deployment history
2. The system shows exactly what will change, the risk level, and what the policy says
3. If the engineer's role requires it, a Slack message fires to the approver
4. The approver clicks **Approve** in Slack — the rollback executes automatically
5. Everything is logged in the audit trail

---

## Features

### Rollback Workflow
- View real deployment history pulled from GitHub Actions / GitHub Deployments API
- Commit diff with file-level change analysis and risk scoring
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
- Built-in rules: production weekend freeze, engineer requires approval, senior engineer self-service, staging open, preview environments open

### Audit Trail
- Every action logged: previewed, approved, rejected, executing, completed, failed
- Persisted to SQLite — survives server restarts
- Queryable by action ID, service ID, or global feed

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
│                     PreviewEnvsPage                      │
└────────────────────────┬────────────────────────────────┘
                         │ /api/* (Vite proxy)
┌────────────────────────▼────────────────────────────────┐
│                  Fastify Backend (TypeScript)            │
│                                                         │
│  PolicyEngine → ActionOrchestrator → AuditStore         │
│                                                         │
│  Integrations:                                          │
│    GitHub   — deployment history, commit diffs          │
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
| GitHub integration | Octokit REST |
| Kubernetes integration | @kubernetes/client-node |
| Slack integration | @slack/web-api |
| Policy | YAML rules engine (custom) |
| Dev tooling | ts-node, nodemon, ESLint |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A GitHub personal access token (fine-grained, read access to your repos)
- A Slack app with `chat:write` scope and Interactivity enabled (optional)
- ngrok or similar for Slack callback tunneling (optional)

### Installation

```bash
git clone https://github.com/Ifeanyi1shot/devops-control-plane.git
cd devops-control-plane
npm install
cd frontend && npm install && cd ..
```

### Configuration

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

```env
PORT=3002
HOST=0.0.0.0

# GitHub — fine-grained token with read access to your repos
GITHUB_TOKEN=github_pat_...

# Set to true when no real Kubernetes cluster is available
K8S_DRY_RUN=true

# Slack — required for approval notifications
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APPROVAL_CHANNEL="#your-channel"
```

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
Use the ngrok URL as the Interactivity Request URL in your Slack app settings.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/services` | List all services |
| GET | `/services/:id` | Get service details |
| GET | `/services/:id/deployments` | Deployment history |
| POST | `/rollback/preview` | Preview a rollback (policy check + diff) |
| POST | `/rollback/:id/execute` | Execute an approved rollback |
| POST | `/actions/:id/approve` | Approve a pending action |
| POST | `/actions/:id/reject` | Reject a pending action |
| GET | `/actions` | List all actions |
| POST | `/preview-env` | Create a preview environment |
| GET | `/preview-env` | List active preview environments |
| GET | `/preview-env/:id` | Get a single preview environment |
| DELETE | `/preview-env/:id` | Destroy a preview environment |
| GET | `/audit` | Global audit log |
| GET | `/audit/actions/:id` | Audit log for a specific action |
| GET | `/audit/services/:id` | Audit log for a specific service |
| POST | `/slack/interactions` | Slack interactive payload handler |

---

## Project Status

This is an MVP demonstrating the core workflows. Production-grade additions would include:

- [ ] Authentication (GitHub OAuth or SSO)
- [ ] Real Kubernetes cluster integration
- [ ] More services in the registry (config-file driven)
- [ ] Deployment to a hosted server (Docker + Fly.io / Railway)
- [ ] Metrics and alerting integration
- [ ] PR-based preview environment creation

---

## License

MIT
