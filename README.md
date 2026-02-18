# Automated Backup System

Matthew Berman Style backup system for Andrew Napier.

## Features

- 🔍 **Auto-discover** all SQLite databases in workspace
- 🔐 **Encrypt** backups with AES-256-CBC
- ☁️ **Upload** to Google Drive automatically
- 🧹 **Rolling window** - keeps last 7 backups
- 🔄 **Git auto-sync** - hourly commits and pushes
- 🛡️ **Pre-commit hooks** - prevents committing secrets
- 📱 **Telegram alerts** - instant notification on failure
- ♻️ **Full restore** - complete restore script

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/andrewbot/workspace/backup-system
npm install
npm run build
```

### 2. Configure Environment Variables

Add to your `.zshrc` or `.bashrc`:

```bash
# Encryption passwords (REQUIRED)
export BACKUP_ENCRYPTION_PASSWORD="your-secure-encryption-password"
export DRIVE_UPLOAD_PASSWORD="your-google-drive-password"

# Telegram alerts (REQUIRED for alerts)
export TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
export TELEGRAM_CHAT_ID="your-chat-id"

# Google Drive (REQUIRED for uploads)
export DRIVE_FOLDER_ID="your-drive-folder-id"

# Paths
export WORKSPACE_DIR="/Users/andrewbot/.openclaw/workspace"
export BACKUP_DIR="/Users/andrewbot/.backup-system/backups"
```

Then run: `source ~/.zshrc`

### 3. Set Up Google Drive CLI

```bash
brew install gogcli
gog auth login
```

### 4. Install Crontab

```bash
crontab -e
# Add:
# 0 * * * * /Users/andrewbot/workspace/backup-system/scripts/backup.sh >> /Users/andrewbot/.backup-system/logs/backup.log 2>&1
```

### 5. Install Pre-commit Hook

```bash
cd /Users/andrewbot/.openclaw/workspace
ln -s ../backup-system/scripts/pre-commit .git/hooks/pre-commit
```

## Usage

### Manual Backup

```bash
./scripts/backup.sh
```

### List Backups

```bash
# Local
ls -la ~/.backup-system/backups/

# Google Drive
./scripts/restore.sh --list
```

### Restore from Backup

```bash
# Download latest from Drive
./scripts/restore.sh --download

# Restore specific backup
./scripts/restore.sh --restore backup-2024-01-15-1000.tar.enc

# Restore to custom directory
./scripts/restore.sh --restore backup.tar.enc --to /path/to/restore
```

### View Logs

```bash
tail -f ~/.backup-system/logs/backup.log
```

## File Structure

```
backup-system/
├── src/
│   ├── discover.ts      # Auto-find SQLite databases
│   ├── encrypt.ts       # AES-256-CBC encryption
│   ├── drive.ts         # Google Drive upload
│   ├── git-sync.ts      # Git auto-commit/push
│   └── pre-commit.ts    # Secret detection hook
├── scripts/
│   ├── backup.sh        # Main backup runner
│   ├── restore.sh       # Full restore script
│   └── pre-commit       # Git hook script
├── crontab.conf         # Cron schedule
├── package.json
└── tsconfig.json
```

## Security

- All backups encrypted with AES-256-CBC + PBKDF2
- Separate passwords for archive encryption and Drive access
- Pre-commit hook scans for 20+ secret patterns
- Checksums verify backup integrity
- Telegram alerts on ANY failure

## Troubleshooting

### "No databases found"
Check that your `.db`, `.sqlite`, or `.sqlite3` files are in the workspace directory.

### "Drive upload failed"
Verify `gog` is authenticated: `gog auth status`

### "Telegram not working"
Check `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set correctly.

## License

MIT
