# businesslog.ai

> Your business AI. Living in your codebase.

Open-source enterprise AI agent that lives in your company's repo. Multi-user, sandboxed, analytics-ready. Deploy anywhere in minutes.

## Features

- **Multi-user** — Team members with roles (admin, member, viewer)
- **Messenger UX** — Chat with your AI assistant like any messaging app
- **Docker-first** — Sandboxed deployment with one command
- **Analytics dashboard** — Message volume, active users, popular topics
- **Business tools** — Tasks, reports, meeting summaries, knowledge base
- **CRM integration points** — Connect to Salesforce, HubSpot, or build your own
- **A2A ready** — Agent-to-agent protocol for business system integration
- **Compliance** — SOC2-ready headers, GDPR-ready architecture, audit logging
- **Self-hosted** — Your data never leaves your infrastructure

## Quick Start (Docker)

```bash
# Clone
git clone https://github.com/your-org/businesslog.git
cd businesslog

# One-command setup
./scripts/setup.sh

# Or manual:
cp .env.example .env
# Edit .env with your settings
docker compose up -d
```

Open http://localhost:3000 and register your admin account.

## Deploy on Cloudflare Workers

```bash
# Install
npm install

# Configure
cp .env.example .env
# Set your Cloudflare credentials and LLM API key

# Deploy
npx wrangler deploy
```

## Architecture

```
businesslog/
├── public/
│   ├── index.html          # Landing page
│   └── app.html            # Web app (messenger UI)
├── src/
│   ├── worker.ts            # Main server (Hono)
│   ├── users/               # Auth, JWT, roles, middleware
│   ├── business/            # Reports, tasks, knowledge, CRM
│   ├── analytics/           # Event tracking, aggregation, export
│   └── agent/               # LLM, memory, context, routing
├── scripts/
│   ├── setup.sh             # One-command setup
│   └── backup.sh            # Data backup
├── Dockerfile               # Multi-stage build
├── docker-compose.yml       # App + DB + Redis
├── package.json
└── tsconfig.json
```

### Two-Repo Model

Like all cocapn verticals, businesslog uses two repos:

- **Private repo** — Internal analytics, reports, team tools, knowledge base
- **Public repo** — Customer-facing API, docs, support chatbot

The agent has different access levels per repo. Private data never leaks to the public boundary.

### User Roles

| Role | Chat | Tasks | Reports | Analytics | Admin |
|------|------|-------|---------|-----------|-------|
| Admin | full | full | full | full | full |
| Member | full | full | full | read | none |
| Viewer | read | read | read | none | none |

## Configuration

All configuration via environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `JWT_SECRET` | Token signing key | (auto-generated) |
| `LLM_API_KEY` | Your LLM provider key | required |
| `LLM_MODEL` | Model to use | gpt-4 |
| `LLM_BASE_URL` | Provider API URL | https://api.openai.com/v1 |
| `RATE_LIMIT_MAX` | Max requests per window | 100 |
| `ANALYTICS_ENABLED` | Enable tracking | true |

## API

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh token

### Chat
- `POST /api/chat` — Send message (streaming response)
- `GET /api/chat/history` — List conversations
- `GET /api/chat/:id` — Get conversation

### Business
- `GET /api/business/reports/daily` — Daily report
- `GET /api/business/reports/weekly` — Weekly report
- `POST /api/business/tasks` — Create task
- `GET /api/business/tasks` — List tasks
- `GET /api/business/knowledge` — Search knowledge base

### Analytics (admin only)
- `GET /api/analytics/overview` — Dashboard data
- `GET /api/analytics/messages` — Message stats
- `GET /api/analytics/users` — User activity
- `GET /api/analytics/export/:format` — Export (csv/json)

## Development

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build
npm run build

# Run tests
npm test

# Type check
npx tsc --noEmit
```

## Backup

```bash
./scripts/backup.sh
# Creates timestamped backup in ./backups/
```

## License

MIT — Free and open source forever.

---

Built on [cocapn](https://github.com/cocapn/cocapn) — the repo IS the agent.
