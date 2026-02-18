/**
 * encrypt.ts - Encrypt backups with password protection
 * Part of Automated Backup System (Matthew Berman Style)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface BackupPackage {
  archivePath: string;
  encryptedPath: string;
  checksum: string;
  timestamp: string;
}

const BACKUP_PASSWORD = process.env.BACKUP_ENCRYPTION_PASSWORD || '';
const DRIVE_PASSWORD = process.env.DRIVE_UPLOAD_PASSWORD || '';

function getEncryptionPassword(): string {
  if (!BACKUP_PASSWORD) {
    throw new Error('BACKUP_ENCRYPTION_PASSWORD environment variable not set');
  }
  return BACKUP_PASSWORD;
}

function getDrivePassword(): string {
  if (!DRIVE_PASSWORD) {
    throw new Error('DRIVE_UPLOAD_PASSWORD environment variable not set');
  }
  return DRIVE_PASSWORD;
}

export function createEncryptedBackup(
  files: string[], 
  outputDir: string,
  backupName: string
): BackupPackage {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveName = `${backupName}-${timestamp}`;
  const archivePath = path.join(outputDir, `${archiveName}.tar`);
  const encryptedPath = path.join(outputDir, `${archiveName}.tar.enc`);
  
  console.log('🔐 Creating encrypted backup...');
  
  try {
    // Create tar archive
    console.log(`   Creating tar archive: ${archivePath}`);
    execSync(`tar -cf "${archivePath}" ${files.map(f => `"${f}"`).join(' ')}`, {
      stdio: 'pipe'
    });
    
    // Encrypt with OpenSSL (AES-256-CBC)
    const password = getEncryptionPassword();
    console.log(`   Encrypting with AES-256-CBC...`);
    
    execSync(
      `openssl enc -aes-256-cbc -salt -pbkdf2 -in "${archivePath}" -out "${encryptedPath}" -pass "pass:${password}"`,
      { stdio: 'pipe' }
    );
    
    // Calculate checksum
    const checksum = calculateChecksum(encryptedPath);
    
    // Clean up unencrypted archive
    fs.unlinkSync(archivePath);
    
    // Write checksum file
    const checksumPath = path.join(outputDir, `${archiveName}.tar.enc.sha256`);
    fs.writeFileSync(checksumPath, checksum);
    
    console.log(`   ✅ Backup encrypted: ${path.basename(encryptedPath)}`);
    console.log(`   Checksum: ${checksum.substring(0, 16)}...`);
    
    return {
      archivePath: encryptedPath,
      encryptedPath,
      checksum,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Clean up on failure
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    throw error;
  }
}

export function decryptBackup(encryptedPath: string, outputDir: string): string {
  const password = getEncryptionPassword();
  const decryptedPath = path.join(outputDir, path.basename(encryptedPath, '.enc'));
  
  console.log('🔓 Decrypting backup...');
  
  execSync(
    `openssl enc -aes-256-cbc -d -pbkdf2 -in "${encryptedPath}" -out "${decryptedPath}" -pass "pass:${password}"`,
    { stdio: 'pipe' }
  );
  
  console.log(`   ✅ Decrypted to: ${decryptedPath}`);
  return decryptedPath;
}

export function extractBackup(tarPath: string, extractDir: string): void {
  console.log(`📂 Extracting backup to: ${extractDir}`);
  
  execSync(`tar -xf "${tarPath}" -C "${extractDir}"`, {
    stdio: 'pipe'
  });
  
  console.log('   ✅ Extraction complete');
}

function calculateChecksum(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

export function verifyChecksum(filePath: string, expectedChecksum: string): boolean {
  const actualChecksum = calculateChecksum(filePath);
  return actualChecksum === expectedChecksum;
}

export function encryptForDrive(filePath: string, outputPath: string): string {
  const password = getDrivePassword();
  
  console.log('🔐 Encrypting for Google Drive upload...');
  
  execSync(
    `openssl enc -aes-256-cbc -salt -pbkdf2 -in "${filePath}" -out "${outputPath}" -pass "pass:${password}"`,
    { stdio: 'pipe' }
  );
  
  return outputPath;
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'encrypt' && args[1]) {
    const encrypted = createEncryptedBackup([args[1]], path.dirname(args[1]), 'manual');
    console.log('Encrypted:', encrypted.encryptedPath);
  } else if (args[0] === 'decrypt' && args[1]) {
    const decrypted = decryptBackup(args[1], path.dirname(args[1]));
    console.log('Decrypted:', decrypted);
  }
}
