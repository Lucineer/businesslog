#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Businesslog.ai — One-Command Setup
# Usage: bash scripts/setup.sh
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Businesslog.ai — Setup Wizard${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ---- Check Docker ----
info "Checking for Docker..."
if ! command -v docker &>/dev/null; then
    error "Docker is not installed. Please install Docker first: https://docs.docker.com/get-docker/"
fi
success "Docker found: $(docker --version)"

# ---- Check Docker Compose ----
info "Checking for Docker Compose..."
if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    success "Docker Compose (plugin) found: $(docker compose version --short)"
elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
    success "Docker Compose (standalone) found: $(docker-compose --version)"
else
    error "Docker Compose is not installed. Please install Docker Compose: https://docs.docker.com/compose/install/"
fi

# ---- Copy .env.example if .env does not exist ----
if [ ! -f .env ]; then
    info "Creating .env from .env.example..."
    cp .env.example .env
    success ".env file created"
else
    warn ".env already exists — leaving it unchanged"
fi

# ---- Generate JWT_SECRET if placeholder ----
if grep -q "change-me-to-a-random-string-at-least-32-chars" .env 2>/dev/null; then
    info "Generating a secure JWT_SECRET..."
    GENERATED_SECRET=$(openssl rand -base64 48 | tr -d '\n')
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "s|change-me-to-a-random-string-at-least-32-chars|${GENERATED_SECRET}|g" .env
    else
        sed -i "s|change-me-to-a-random-string-at-least-32-chars|${GENERATED_SECRET}|g" .env
    fi
    success "JWT_SECRET generated and saved to .env"
else
    info "JWT_SECRET already set in .env"
fi

# ---- Prompt for admin credentials ----
echo ""
info "Configure the initial admin account:"
echo ""

read -rp "  Admin email [admin@example.com]: " ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

read -rp "  Admin password [changeme]: " ADMIN_PASSWORD
ADMIN_PASSWORD="${ADMIN_PASSWORD:-changeme}"

if [ "$ADMIN_PASSWORD" = "changeme" ]; then
    warn "Using default password — please change it after first login!"
fi

# Write admin credentials to .env
if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=${ADMIN_EMAIL}|g" .env
    sed -i '' "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASSWORD}|g" .env
else
    sed -i "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=${ADMIN_EMAIL}|g" .env
    sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASSWORD}|g" .env
fi
success "Admin credentials saved to .env"

# ---- Build containers ----
echo ""
info "Building Docker containers..."
$COMPOSE_CMD build --quiet
success "Containers built"

# ---- Start containers ----
info "Starting containers..."
$COMPOSE_CMD up -d
success "Containers started"

# ---- Wait for health check ----
info "Waiting for the application to become healthy..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    warn "Application has not reported healthy yet. It may still be starting."
    warn "Check logs with: $COMPOSE_CMD logs app"
else
    success "Application is healthy"
fi

# ---- Show status ----
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Setup Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
$COMPOSE_CMD ps
echo ""
echo -e "  ${GREEN}Application URL:${NC}  http://localhost:3000"
echo -e "  ${GREEN}Health check:${NC}     http://localhost:3000/health"
echo -e "  ${GREEN}Admin email:${NC}      ${ADMIN_EMAIL}"
echo ""
echo -e "  Useful commands:"
echo -e "    View logs:    $COMPOSE_CMD logs -f app"
echo -e "    Stop:         $COMPOSE_CMD down"
echo -e "    Restart:      $COMPOSE_CMD restart app"
echo -e "    Backup:       bash scripts/backup.sh"
echo ""
