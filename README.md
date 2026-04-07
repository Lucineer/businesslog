# businesslog.ai
> An AI agent for your business, running in your own environment.

Your team's operational knowledge should remain under your control. This tool provides an AI assistant that integrates into your existing systems without requiring external data storage or monthly subscriptions.

Built on the open-source Cocapn Fleet protocol. MIT licensed. Self-hosted.

---

## Why this exists

Most business AI tools require sending sensitive data to external servers, creating dependencies and potential compliance issues. This project lets you run an AI agent within your infrastructure, keeping your data internal and customizable to your workflow.

---

## How it works

This is a deployable agent that uses the Fleet agent-to-agent protocol:

- **Self-contained deployment:** Fork this repository to have a complete, modifiable agent codebase.
- **Local data processing:** Queries and data remain within your configured environment by default.
- **Infrastructure flexibility:** Runs on Docker, Cloudflare Workers, or bare metal servers.
- **Team-ready features:** Includes basic user roles and audit logging.

---

## Features

- **Multi-user chat interface** – Team members can interact with the assistant
- **Basic analytics** – View message counts and user activity
- **Docker deployment** – Containerized setup with `docker compose`
- **Cloudflare Workers option** – Edge deployment capability
- **MIT licensed** – Free to use, modify, and distribute

---

## Current limitations

Requires manual configuration for production deployments and ongoing maintenance of your chosen infrastructure.

---

## Quick start

```bash
# Clone and set up
git clone https://github.com/cocapn/businesslog.git
cd businesslog
bash scripts/setup.sh

# Access the interface
open http://localhost:3000
```

The setup script will guide you through configuring environment variables and starting the service.

For Cloudflare Workers deployment:
```bash
npm install
cp .env.example .env
# Configure .env, then deploy
```

---

## Attribution

Superinstance & Lucineer (DiGennaro et al.)

<div>
  <a href="https://the-fleet.casey-digennaro.workers.dev">Fleet</a> ·
  <a href="https://cocapn.ai">Cocapn</a>
</div>