/**
 * git-sync.ts - Auto-commit and push workspace to GitHub
 * Part of Automated Backup System (Matthew Berman Style)
 */

import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/Users/andrewbot/.openclaw/workspace';
const GIT_REMOTE = process.env.GIT_REMOTE || 'origin';
const AUTO_PUSH = process.env.GIT_AUTO_PUSH !== 'false';

interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  isDirty: boolean;
}

function runGit(command: string, cwd: string = WORKSPACE_DIR): string {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error: any) {
    if (error.stdout) return error.stdout.trim();
    throw error;
  }
}

export function getGitStatus(): GitStatus {
  console.log('📊 Checking git status...');
  
  const status = runGit('git status --porcelain');
  
  if (!status) {
    return {
      modified: [],
      added: [],
      deleted: [],
      untracked: [],
      isDirty: false
    };
  }
  
  const lines = status.split('\n').filter(Boolean);
  const result: GitStatus = {
    modified: [],
    added: [],
    deleted: [],
    untracked: [],
    isDirty: lines.length > 0
  };
  
  for (const line of lines) {
    const statusCode = line.substring(0, 2);
    const filePath = line.substring(3).trim();
    
    if (statusCode.includes('M')) {
      result.modified.push(filePath);
    }
    if (statusCode.includes('A')) {
      result.added.push(filePath);
    }
    if (statusCode.includes('D')) {
      result.deleted.push(filePath);
    }
    if (statusCode === '??') {
      result.untracked.push(filePath);
    }
  }
  
  if (result.isDirty) {
    console.log(`   Modified: ${result.modified.length}`);
    console.log(`   Added: ${result.added.length}`);
    console.log(`   Deleted: ${result.deleted.length}`);
    console.log(`   Untracked: ${result.untracked.length}`);
  } else {
    console.log('   ✅ Working tree clean');
  }
  
  return result;
}

export function isGitRepo(): boolean {
  try {
    runGit('git rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

export function initGitRepo(): void {
  if (isGitRepo()) {
    console.log('📦 Git repository already initialized');
    return;
  }
  
  console.log('🔧 Initializing git repository...');
  runGit('git init');
  runGit('git add .');
  runGit('git commit -m "Initial commit"');
  
  // Add remote if specified
  const remoteUrl = process.env.GIT_REMOTE_URL;
  if (remoteUrl) {
    runGit(`git remote add ${GIT_REMOTE} ${remoteUrl}`);
  }
}

export function getCurrentBranch(): string {
  return runGit('git rev-parse --abbrev-ref HEAD');
}

export function stageAllChanges(): void {
  console.log('📦 Staging all changes...');
  
  // Stage all files including new ones
  runGit('git add -A');
  
  console.log('   ✅ All changes staged');
}

export function createBackupCommit(message?: string): string {
  const timestamp = new Date();
  const commitMessage = message || 
    `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:00 Auto-backup`;
  
  console.log(`💾 Creating backup commit: "${commitMessage}"`);
  
  try {
    const result = runGit(`git commit -m "${commitMessage}"`);
    console.log(`   ✅ Commit created`);
    return commitMessage;
  } catch (error: any) {
    // No changes to commit
    if (error.message && error.message.includes('nothing to commit')) {
      console.log('   ℹ️  No changes to commit');
      return '';
    }
    throw error;
  }
}

export function pushToRemote(): void {
  if (!AUTO_PUSH) {
    console.log('⏭️  Auto-push disabled, skipping');
    return;
  }
  
  console.log(`🚀 Pushing to ${GIT_REMOTE}...`);
  
  const branch = getCurrentBranch();
  
  try {
    runGit(`git push ${GIT_REMOTE} ${branch}`);
    console.log(`   ✅ Pushed to ${GIT_REMOTE}/${branch}`);
  } catch (error) {
    console.error('   ❌ Push failed:', error);
    throw error;
  }
}

export async function syncWorkspace(): Promise<boolean> {
  console.log('🔄 Starting git auto-sync...\n');
  
  if (!isGitRepo()) {
    console.log('⚠️  Not a git repository, initializing...');
    initGitRepo();
  }
  
  // Get current status
  const status = getGitStatus();
  
  if (!status.isDirty) {
    console.log('✨ No changes to sync');
    return false;
  }
  
  // Stage changes
  stageAllChanges();
  
  // Create commit
  const commitMsg = createBackupCommit();
  
  if (!commitMsg) {
    return false;
  }
  
  // Push
  await new Promise(resolve => {
    pushToRemote();
    resolve(true);
  });
  
  console.log('\n✅ Git sync complete!');
  return true;
}

export function getLastCommitInfo(): { message: string; date: string; author: string } {
  try {
    const message = runGit('git log -1 --pretty=%s');
    const date = runGit('git log -1 --pretty=%ci');
    const author = runGit('git log -1 --pretty=%an');
    
    return { message, date, author };
  } catch {
    return { message: 'No commits', date: '', author: '' };
  }
}

export function hasRemote(): boolean {
  try {
    runGit(`git remote get-url ${GIT_REMOTE}`);
    return true;
  } catch {
    return false;
  }
}

export function configureGitUser(): void {
  const gitName = process.env.GIT_USER_NAME || 'Andrew Napier';
  const gitEmail = process.env.GIT_USER_EMAIL || 'andrew@napier.md';
  
  runGit(`git config user.name "${gitName}"`);
  runGit(`git config user.email "${gitEmail}"`);
  
  console.log(`   Git user: ${gitName} <${gitEmail}>`);
}

// CLI mode
if (require.main === module) {
  configureGitUser();
  syncWorkspace().then(synced => {
    process.exit(synced ? 0 : 0);
  });
}
