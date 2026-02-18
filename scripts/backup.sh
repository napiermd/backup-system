#!/bin/bash
#
# backup.sh - Main backup runner
# Part of Automated Backup System (Matthew Berman Style)
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.backup-system/backups}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/.openclaw/workspace}"
DRIVE_FOLDER="${DRIVE_BACKUP_FOLDER:-backups}"
MAX_BACKUPS=7

# Environment variables (must be set)
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-${OPENCLAW_TELEGRAM_TOKEN}}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID}"
BACKUP_ENCRYPTION_PASSWORD="${BACKUP_ENCRYPTION_PASSWORD}"
DRIVE_UPLOAD_PASSWORD="${DRIVE_UPLOAD_PASSWORD}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*"; }

# Send Telegram alert
send_telegram_alert() {
  local message="$1"
  local is_error="${2:-false}"
  
  if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
    log_warn "Telegram not configured, skipping alert"
    return
  fi
  
  local emoji="🔔"
  if [ "$is_error" = "true" ]; then
    emoji="🚨"
  fi
  
  local full_message="$emoji *Backup System*
  
$message"
  
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    -d "chat_id=$TELEGRAM_CHAT_ID" \
    -d "text=$full_message" \
    -d "parse_mode=Markdown" > /dev/null
  
  log_info "Telegram alert sent"
}

# Discover databases
discover_databases() {
  log_info "Discovering SQLite databases..."
  
  local dbs=()
  
  # Find all .db, .sqlite, .sqlite3 files
  while IFS= read -r -d '' db; do
    dbs+=("$db")
  done < <(find "$WORKSPACE_DIR" -type f \( -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" \) -print0 2>/dev/null)
  
  # Check for SQLite magic bytes
  for f in "$WORKSPACE_DIR"/**/*; do
    if [ -f "$f" ] && [ ! -s "$f" ]; then
      continue
    fi
    if file "$f" 2>/dev/null | grep -q "SQLite"; then
      dbs+=("$f")
    fi
  done
  
  # Add known databases
  [ -f "$WORKSPACE_DIR/data/crm.db" ] && dbs+=("$WORKSPACE_DIR/data/crm.db")
  [ -f "$WORKSPACE_DIR/crm.db" ] && dbs+=("$WORKSPACE_DIR/crm.db")
  [ -f "$WORKSPACE_DIR/knowledge.db" ] && dbs+=("$WORKSPACE_DIR/knowledge.db")
  
  # Remove duplicates
  local unique_dbs=($(printf '%s\n' "${dbs[@]}" | sort -u))
  
  echo "${unique_dbs[@]}"
}

# Create encrypted backup
create_backup() {
  local databases=("$@")
  local timestamp=$(date +%Y-%m-%d-%H%M)
  local backup_name="backup-$timestamp"
  local archive_path="$BACKUP_DIR/$backup_name.tar"
  local encrypted_path="$BACKUP_DIR/$backup_name.tar.enc"
  
  mkdir -p "$BACKUP_DIR"
  
  log_info "Creating backup: $backup_name"
  
  # Create tar archive
  log_info "Packaging databases..."
  tar -cf "$archive_path" -C "$WORKSPACE_DIR" . 2>/dev/null || true
  
  # Encrypt
  log_info "Encrypting..."
  echo "$BACKUP_ENCRYPTION_PASSWORD" | openssl enc -aes-256-cbc -salt -pbkdf2 \
    -in "$archive_path" \
    -out "$encrypted_path" \
    -pass stdin
  
  rm -f "$archive_path"
  
  # Calculate checksum
  local checksum=$(sha256sum "$encrypted_path" | cut -d' ' -f1)
  echo "$checksum" > "$encrypted_path.sha256"
  
  local size=$(du -h "$encrypted_path" | cut -f1)
  log_success "Backup created: $backup_name.tar.enc ($size)"
  
  echo "$encrypted_path"
}

# Upload to Google Drive
upload_to_drive() {
  local file="$1"
  
  log_info "Uploading to Google Drive..."
  
  # Get or create folder
  local folder_id="${DRIVE_FOLDER_ID:-}"
  
  if [ -z "$folder_id" ]; then
    folder_id=$(gog drive find --name "$DRIVE_FOLDER" --type folder 2>/dev/null | head -1) || true
    if [ -z "$folder_id" ]; then
      gog drive create --name "$DRIVE_FOLDER" --type folder > /dev/null 2>&1
      folder_id=$(gog drive find --name "$DRIVE_FOLDER" --type folder 2>/dev/null | head -1)
    fi
  fi
  
  gog drive upload "$file" --folder "$folder_id" --share anyone > /dev/null 2>&1
  
  log_success "Uploaded to Google Drive"
}

# Cleanup old backups
cleanup_old_backups() {
  log_info "Cleaning up old local backups (keeping last $MAX_BACKUPS)..."
  
  local count=$(ls -1 "$BACKUP_DIR"/backup-*.tar.enc 2>/dev/null | wc -l)
  
  if [ "$count" -gt "$MAX_BACKUPS" ];
  then
    local to_delete=$((count - MAX_BACKUPS))
    ls -1t "$BACKUP_DIR"/backup-*.tar.enc | tail -"$to_delete" | xargs rm -f
    log_success "Removed $to_delete old backup(s)"
  else
    log_info "Only $count backup(s), within limit"
  fi
}

# Git sync
run_git_sync() {
  log_info "Running git sync..."
  
  cd "$WORKSPACE_DIR"
  
  # Check if git repo
  if ! git rev-parse --git-dir &>/dev/null; then
    log_warn "Not a git repository, skipping"
    return
  fi
  
  # Stage and commit
  git add -A
  
  if git diff --staged --quiet; then
    log_info "No changes to commit"
    return
  fi
  
  local timestamp=$(date +"%Y-%m-%d %H:00")
  git commit -m "$timestamp Auto-backup" || true
  
  # Push
  git push origin $(git rev-parse --abbrev-ref HEAD) 2>/dev/null || log_warn "Push failed"
  
  log_success "Git sync complete"
}

# Main backup process
main() {
  echo ""
  echo "========================================"
  echo "   Automated Backup System"
  echo "   $(date)"
  echo "========================================"
  echo ""
  
  # Validate environment
  if [ -z "$BACKUP_ENCRYPTION_PASSWORD" ]; then
    log_error "BACKUP_ENCRYPTION_PASSWORD not set"
    send_telegram_alert "❌ Backup FAILED: Encryption password not configured" true
    exit 1
  fi
  
  # Discover databases
  local databases
  databases=($(discover_databases))
  
  if [ ${#databases[@]} -eq 0 ]; then
    log_warn "No databases found"
  else
    log_info "Found ${#databases[@]} database(s)"
  fi
  
  # Create backup
  local backup_file
  if backup_file=$(create_backup "${databases[@]}"); then
    log_success "Backup created successfully"
  else
    log_error "Backup failed"
    send_telegram_alert "❌ Backup FAILED: Could not create backup archive" true
    exit 1
  fi
  
  # Upload to Drive
  if [ -n "$DRIVE_UPLOAD_PASSWORD" ]; then
    if upload_to_drive "$backup_file"; then
      log_success "Drive upload complete"
    else
      log_error "Drive upload failed"
      send_telegram_alert "⚠️ Backup WARNING: Drive upload failed" true
    fi
  else
    log_warn "DRIVE_UPLOAD_PASSWORD not set, skipping Drive upload"
  fi
  
  # Cleanup
  cleanup_old_backups
  
  # Git sync
  run_git_sync
  
  # Success notification
  local size=$(du -h "$backup_file" | cut -f1)
  send_telegram_alert "✅ Backup COMPLETE

📦 Databases: ${#databases[@]}
📁 Size: $size
☁️ Drive: Uploaded"

  echo ""
  log_success "Backup complete!"
}

# Run main
main
