# businesslog — A self-hosted agent for internal business queries

Your team's invoices, meeting notes, and process rules stay within your infrastructure. This agent runs on your servers, uses your data, and does not transmit information externally by default.

**Live:** [businesslog.ai](https://businesslog.ai)  
**License:** MIT | Open source | Zero runtime dependencies

---

## Why This Exists
Teams often spend time configuring generic AI tools with internal business logic. This project provides an alternative for teams that prefer a self-hosted assistant, avoiding monthly SaaS fees and keeping data in their environment.

---

## Quick Start
1.  **Fork this repository.** You own your copy.
2.  Deploy to Cloudflare Workers via `npm run deploy` or run locally with Docker.
3.  Connect your data sources and modify the prompts directly in your codebase.

---

## Features
- Handles business document queries and processes locally
- Configurable team roles (admin, member, viewer) with audit logs
- Zero external API calls by default; operates entirely within your environment
- Consistent runtime on Cloudflare Workers, Node.js, or Docker
- No vendor lock-in; your fork is independent and permanently modifiable
- No per-user fees or recurring billing

---

## What Makes This Different
1.  It is not a thin client for a SaaS platform. The entire application runs on your infrastructure.
2.  Configuration is done through code, not a proprietary dashboard.
3.  Your fork does not receive automatic updates; changes are under your control.

---

## Limitations
By default, chat history and user data are stored in memory and will be lost on restart. To persist data, you must integrate your own database.

---

## Run Locally
```bash
git clone https://github.com/cocapn/businesslog.git
cd businesslog
bash scripts/setup.sh
open http://localhost:3000
```

## Deploy to Cloudflare Workers
```bash
npm install
cp .env.example .env
# Add your environment variables
npm run deploy
```

---

## Architecture
This is a lightweight Hono application that runs identically across Cloudflare Workers, Node.js, and Docker. It manages authentication, multi-user chat sessions, and operational logs within your configured environment.

<div style="text-align:center;padding:16px;color:#64748b;font-size:.8rem"><a href="https://the-fleet.casey-digennaro.workers.dev" style="color:#64748b">The Fleet</a> &middot; <a href="https://cocapn.ai" style="color:#64748b">Cocapn</a></div>