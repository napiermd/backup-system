#!/bin/bash
#
# restore.sh - Full restore script for backup system
# Part of Automated Backup System (Matthew Berman Style)
#

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-$HOME/.backup-system/backups}"
DRIVE_FOLDER="${DRIVE_BACKUP_FOLDER:-backups}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/.openclaw/workspace}"
ENCRYPTION_PASSWORD="${BACKUP_ENCRYPTION_PASSWORD}"
DRIVE_PASSWORD="${DRIVE_UPLOAD_PASSWORD}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_usage() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS] [BACKUP_FILE]

Restore backups from local storage or Google Drive

OPTIONS:
  -l, --list           List available backups
  -d, --download       Download latest from Google Drive
  -r, --restore FILE   Restore from specific backup file
  -t, --to DIR         Restore to specific directory (default: workspace)
  -e, --encrypt FILE   Decrypt a backup file
  -h, --help           Show this help message

EXAMPLES:
  $(basename "$0") --list
  $(basename "$0") --download
  $(basename "$0") --restore backup-2024-01-15-10-00.tar.enc
  $(basename "$0") --encrypt backup.tar.enc

EOF
}

# Check dependencies
check_dependencies() {
  local missing=()
  
  for cmd in openssl tar gog; do
    if ! command -v $cmd &> /dev/null; then
      missing+=($cmd)
    fi
  done
  
  if [ ${#missing[@]} -ne 0 ]; then
    log_error "Missing dependencies: ${missing[*]}"
    log_error "Install with: brew install ${missing[*]}"
    exit 1
  fi
}

# List local backups
list_local_backups() {
  log_info "Local backups in $BACKUP_DIR:"
  
  if [ ! -d "$BACKUP_DIR" ]; then
    log_warn "No backup directory found"
    return
  fi
  
  local count=0
  for f in "$BACKUP_DIR"/*.tar.enc; do
    if [ -f "$f" ]; then
      local size=$(ls -lh "$f" | awk '{print $5}')
      local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$f" 2>/dev/null || stat -c "%y" "$f" | cut -d' ' -f1,2 | cut -d':' -f1,2)
      echo "  - $(basename "$f") ($size) - $date"
      ((count++))
    fi
  done
  
  if [ $count -eq 0 ]; then
    log_warn "No backups found"
  else
    log_success "$count backup(s) found"
  fi
}

# List Google Drive backups
list_drive_backups() {
  log_info "Google Drive backups:"
  
  gog drive list --folder "$DRIVE_FOLDER" 2>/dev/null | grep ".tar.enc" || log_warn "No Drive backups found"
}

# Download latest from Drive
download_latest() {
  log_info "Downloading latest backup from Google Drive..."
  
  mkdir -p "$BACKUP_DIR"
  
  # Get list of backups
  local backups=$(gog drive list --folder "$DRIVE_FOLDER" 2>/dev/null | grep ".tar.enc" | head -1)
  
  if [ -z "$backups" ]; then
    log_error "No backups found on Google Drive"
    exit 1
  fi
  
  # Download the first (oldest) one - they should be sorted by name
  local backup_name=$(echo "$backups" | head -1)
  log_info "Downloading: $backup_name"
  
  gog drive download "$backup_name" --folder "$DRIVE_FOLDER" --output "$BACKUP_DIR"
  
  log_success "Downloaded: $backup_name"
  echo "$BACKUP_DIR/$backup_name"
}

# Decrypt backup
decrypt_backup() {
  local encrypted_file="$1"
  local output_file="${encrypted_file%.enc}"
  
  if [ ! -f "$encrypted_file" ]; then
    log_error "File not found: $encrypted_file"
    exit 1
  fi
  
  if [ -z "$ENCRYPTION_PASSWORD" ]; then
    log_error "BACKUP_ENCRYPTION_PASSWORD not set"
    exit 1
  fi
  
  log_info "Decrypting: $encrypted_file"
  
  openssl enc -aes-256-cbc -d -pbkdf2 \
    -in "$encrypted_file" \
    -out "$output_file" \
    -pass "pass:$ENCRYPTION_PASSWORD"
  
  log_success "Decrypted to: $output_file"
  echo "$output_file"
}

# Extract backup
extract_backup() {
  local tar_file="$1"
  local restore_dir="$2"
  
  if [ ! -f "$tar_file" ]; then
    log_error "Archive not found: $tar_file"
    exit 1
  fi
  
  mkdir -p "$restore_dir"
  
  log_info "Extracting to: $restore_dir"
  
  tar -xf "$tar_file" -C "$restore_dir"
  
  log_success "Extraction complete"
}

# Full restore workflow
restore_backup() {
  local backup_file="$1"
  local restore_dir="${2:-$WORKSPACE_DIR}"
  
  log_info "Starting restore process..."
  log_info "  Backup: $backup_file"
  log_info "  Restore to: $restore_dir"
  
  # Check if file exists locally
  if [ ! -f "$backup_file" ]; then
    # Try to find in backup directory
    if [ -f "$BACKUP_DIR/$backup_file" ]; then
      backup_file="$BACKUP_DIR/$backup_file"
    else
      log_error "Backup file not found: $backup_file"
      exit 1
    fi
  fi
  
  # Decrypt
  local decrypted=$(decrypt_backup "$backup_file")
  
  # Extract
  extract_backup "$decrypted" "$restore_dir"
  
  # Cleanup decrypted file
  rm -f "$decrypted"
  
  log_success "Restore complete!"
  log_info "Files restored to: $restore_dir"
}

# Main
main() {
  check_dependencies
  
  # Ensure backup directory exists
  mkdir -p "$BACKUP_DIR"
  
  case "${1:-}" in
    -l|--list)
      echo ""
      echo "=== LOCAL BACKUPS ==="
      list_local_backups
      echo ""
      echo "=== GOOGLE DRIVE BACKUPS ==="
      list_drive_backups
      ;;
    -d|--download)
      download_latest
      ;;
    -r|--restore)
      restore_backup "$2" "$3"
      ;;
    -e|--encrypt)
      decrypt_backup "$2"
      ;;
    -t|--to)
      restore_backup "$2" "$3"
      ;;
    -h|--help)
      show_usage
      ;;
    *)
      if [ -n "${1:-}" ]; then
        restore_backup "$1" "$2"
      else
        show_usage
      fi
      ;;
  esac
}

main "$@"
