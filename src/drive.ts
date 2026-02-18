/**
 * drive.ts - Upload backups to Google Drive
 * Part of Automated Backup System (Matthew Berman Style)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface DriveConfig {
  folderId: string;
  backupFolder: string;
}

const DRIVE_FOLDER = process.env.DRIVE_BACKUP_FOLDER || 'backups';
const MAX_BACKUPS = 7;

function getDriveFolderId(): string {
  // Try to get from environment or create/find the folder
  const folderId = process.env.DRIVE_FOLDER_ID;
  if (folderId) return folderId;
  
  // Fallback: use gogcli to find/create folder
  return findOrCreateDriveFolder(DRIVE_FOLDER);
}

function findOrCreateDriveFolder(folderName: string): string {
  try {
    // Try to find existing folder
    const result = execSync(
      `gog drive find --name "${folderName}" --type folder 2>/dev/null || echo ""`,
      { encoding: 'utf8' }
    ).trim();
    
    if (result) {
      console.log(`📁 Found existing Drive folder: ${folderName}`);
      return result;
    }
    
    // Create new folder
    console.log(`📁 Creating Drive folder: ${folderName}`);
    execSync(`gog drive create --name "${folderName}" --type folder`, {
      stdio: 'pipe'
    });
    
    return findOrCreateDriveFolder(folderName);
  } catch (error) {
    console.error('Error managing Drive folder:', error);
    throw error;
  }
}

export async function uploadToDrive(
  filePath: string,
  folderName: string = DRIVE_FOLDER
): Promise<string> {
  console.log(`☁️  Uploading to Google Drive: ${path.basename(filePath)}`);
  
  const folderId = getDriveFolderId();
  
  try {
    // Upload file to Drive folder
    const result = execSync(
      `gog drive upload "${filePath}" --folder "${folderId}" --share anyone`,
      { encoding: 'utf8' }
    ).trim();
    
    console.log(`   ✅ Upload complete: ${result || path.basename(filePath)}`);
    return result || filePath;
  } catch (error) {
    console.error('   ❌ Upload failed:', error);
    throw error;
  }
}

export async function listDriveBackups(): Promise<string[]> {
  console.log('📋 Listing Drive backups...');
  
  try {
    const folderId = getDriveFolderId();
    const result = execSync(
      `gog drive list --folder "${folderId}" --recursive false`,
      { encoding: 'utf8' }
    );
    
    const files = result
      .split('\n')
      .filter(line => line.includes('.tar.enc'))
      .map(line => line.trim());
    
    return files;
  } catch (error) {
    console.error('Error listing Drive files:', error);
    return [];
  }
}

export async function downloadFromDrive(
  fileName: string,
  outputDir: string
): Promise<string> {
  console.log(`☁️  Downloading from Drive: ${fileName}`);
  
  try {
    const folderId = getDriveFolderId();
    const outputPath = path.join(outputDir, fileName);
    
    execSync(
      `gog drive download "${fileName}" --folder "${folderId}" --output "${outputDir}"`,
      { stdio: 'pipe' }
    );
    
    console.log(`   ✅ Downloaded: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('   ❌ Download failed:', error);
    throw error;
  }
}

export async function cleanupOldBackups(): Promise<void> {
  console.log('🧹 Cleaning up old Drive backups (keeping last 7)...');
  
  try {
    const folderId = getDriveFolderId();
    
    // List all backup files with timestamps
    const result = execSync(
      `gog drive list --folder "${folderId}" --recursive false`,
      { encoding: 'utf8' }
    ).trim();
    
    const files = result
      .split('\n')
      .filter(line => line.includes('.tar.enc'))
      .map(line => line.trim())
      .filter(Boolean);
    
    if (files.length <= MAX_BACKUPS) {
      console.log(`   ${files.length} backups exist, within limit`);
      return;
    }
    
    // Sort by name (timestamp) and remove oldest
    files.sort();
    const toDelete = files.slice(0, files.length - MAX_BACKUPS);
    
    for (const file of toDelete) {
      console.log(`   🗑️  Deleting old backup: ${file}`);
      execSync(`gog drive delete "${file}" --folder "${folderId}"`, {
        stdio: 'pipe'
      });
    }
    
    console.log(`   ✅ Cleaned up ${toDelete.length} old backup(s)`);
  } catch (error) {
    console.error('Error cleaning up Drive backups:', error);
    throw error;
  }
}

export async function shareBackup(filePath: string): Promise<string> {
  console.log('🔗 Creating shareable link...');
  
  try {
    const result = execSync(
      `gog drive share "${filePath}" --type anyone`,
      { encoding: 'utf8' }
    ).trim();
    
    console.log(`   ✅ Share link: ${result}`);
    return result;
  } catch (error) {
    console.error('Error creating share link:', error);
    throw error;
  }
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'upload' && args[1]) {
    uploadToDrive(args[1]).then(() => process.exit(0));
  } else if (args[0] === 'list') {
    listDriveBackups().then(files => {
      console.log('Backups:', files.join('\n'));
      process.exit(0);
    });
  } else if (args[0] === 'cleanup') {
    cleanupOldBackups().then(() => process.exit(0));
  }
}
