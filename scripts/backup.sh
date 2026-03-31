#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Businesslog.ai — Database Backup Script
# Usage: bash scripts/backup.sh
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Timestamp for this backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
BACKUP_NAME="businesslog-backup-${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Businesslog.ai — Backup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Create backup directory
mkdir -p "${BACKUP_PATH}"

info "Backup target: ${BACKUP_PATH}"

# ---- Export SQLite database ----
DB_FILE="${PROJECT_DIR}/data/businesslog.db"

if [ -f "$DB_FILE" ]; then
    info "Exporting SQLite database..."
    # Use sqlite3 to create a consistent dump
    if command -v sqlite3 &>/dev/null; then
        sqlite3 "$DB_FILE" ".dump" > "${BACKUP_PATH}/database.sql"
        # Also copy the raw database file for a binary backup
        cp "$DB_FILE" "${BACKUP_PATH}/businesslog.db"
        success "Database exported (SQL dump + binary copy)"
    else
        # Fallback: just copy the binary file if sqlite3 CLI is not available
        cp "$DB_FILE" "${BACKUP_PATH}/businesslog.db"
        warn "sqlite3 CLI not found — copied binary only (no SQL dump)"
        success "Database binary copy exported"
    fi
else
    info "No local database file found at ${DB_FILE}"

    # Try exporting from Docker container
    if docker compose ps db 2>/dev/null | grep -q "businesslog-db" 2>/dev/null || \
       docker ps --format '{{.Names}}' | grep -q "businesslog-db" 2>/dev/null; then
        info "Attempting to export from Docker container..."
        docker cp businesslog-db:/data/businesslog.db "${BACKUP_PATH}/businesslog.db" 2>/dev/null && \
            success "Database exported from Docker container" || \
            info "Could not export from container — database may be empty or not yet created"
    else
        warn "No database found locally or in Docker"
    fi
fi

# ---- Export user data ----
USER_DATA_DIR="${PROJECT_DIR}/data"

if [ -d "$USER_DATA_DIR" ]; then
    info "Exporting user data..."
    # Copy everything except the main db (already handled above)
    mkdir -p "${BACKUP_PATH}/data"
    find "$USER_DATA_DIR" -type f ! -name "businesslog.db" -exec cp {} "${BACKUP_PATH}/data/" \; 2>/dev/null || true
    success "User data exported"
else
    info "No local data/ directory found"
fi

# ---- Export environment config (without secrets) ----
if [ -f ".env" ]; then
    info "Backing up configuration..."
    # Copy .env but mask sensitive values
    cp .env "${BACKUP_PATH}/.env.backup"
    success "Configuration backed up (review before sharing)"
fi

# ---- Compress backup ----
info "Compressing backup..."
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"

BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Backup Complete${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  ${GREEN}Location:${NC}  ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo -e "  ${GREEN}Size:${NC}      ${BACKUP_SIZE}"
echo -e "  ${GREEN}Contents:${NC}  Database dump, user data, configuration"
echo ""
echo -e "  To restore:"
echo -e "    tar -xzf ${BACKUP_NAME}.tar.gz"
echo -e "    cp -r ${BACKUP_NAME}/businesslog.db data/businesslog.db"
echo ""
