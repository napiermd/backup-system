/**
 * discover.ts - Auto-discover all SQLite databases in workspace
 * Part of Automated Backup System (Matthew Berman Style)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface DiscoveredDatabase {
  name: string;
  path: string;
  size: number;
  lastModified: Date;
}

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/Users/andrewbot/.openclaw/workspace';

// Known database patterns
const KNOWN_DATABASES = [
  'crm.db',
  'contacts.db',
  'knowledge.db',
  'kyberos.db',
  'hubspot.db',
  '.db',
  '.sqlite',
  '.sqlite3'
];

function findDatabases(dir: string, depth = 3): DiscoveredDatabase[] {
  const databases: DiscoveredDatabase[] = [];
  
  if (depth <= 0) return databases;
  
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip hidden dirs and common non-data dirs
          if (!file.startsWith('.') && !file.includes('node_modules')) {
            databases.push(...findDatabases(fullPath, depth - 1));
          }
        } else if (stat.isFile()) {
          // Check if it's a SQLite database
          const ext = path.extname(file).toLowerCase();
          const baseName = path.basename(file).toLowerCase();
          
          if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3' || 
              KNOWN_DATABASES.some(db => baseName === db || baseName.endsWith(db))) {
            databases.push({
              name: file,
              path: fullPath,
              size: stat.size,
              lastModified: stat.mtime
            });
          } else {
            // Check file header for SQLite magic bytes
            try {
              const buffer = Buffer.alloc(16);
              const fd = fs.openSync(fullPath, 'r');
              fs.readSync(fd, buffer, 0, 16, 0);
              fs.closeSync(fd);
              
              // SQLite database magic bytes: "SQLite format 3\0"
              if (buffer.toString('utf8', 0, 16) === 'SQLite format 3\0') {
                databases.push({
                  name: file,
                  path: fullPath,
                  size: stat.size,
                  lastModified: stat.mtime
                });
              }
            } catch {
              // Not a SQLite file, skip
            }
          }
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }
  
  return databases;
}

function getAdditionalKnownDatabases(): DiscoveredDatabase[] {
  const databases: DiscoveredDatabase[] = [];
  const knownPaths = [
    // CRM/Contacts
    path.join(WORKSPACE_DIR, 'data', 'crm.db'),
    path.join(WORKSPACE_DIR, 'crm.db'),
    // Knowledge base
    path.join(WORKSPACE_DIR, 'knowledge.db'),
    // KyberOS
    path.join(WORKSPACE_DIR, 'kyberos.db'),
    // HubSpot local cache
    path.join(WORKSPACE_DIR, 'data', 'hubspot.db'),
    // Obsidian vault
    path.join(process.env.HOME || '', 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents', 'Tri-Vault', '.obsidian', 'graph.db'),
  ];
  
  for (const dbPath of knownPaths) {
    try {
      if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        databases.push({
          name: path.basename(dbPath),
          path: dbPath,
          size: stat.size,
          lastModified: stat.mtime
        });
      }
    } catch {
      // Skip inaccessible databases
    }
  }
  
  return databases;
}

export function discoverAllDatabases(): DiscoveredDatabase[] {
  console.log('🔍 Discovering SQLite databases...');
  
  // Start with workspace directory
  const workspaceDBs = findDatabases(WORKSPACE_DIR);
  
  // Get known database paths
  const knownDBs = getAdditionalKnownDatabases();
  
  // Merge and deduplicate
  const allDBs = [...workspaceDBs, ...knownDBs];
  const uniqueDBs = allDBs.filter((db, index, self) => 
    index === self.findIndex(d => d.path === db.path)
  );
  
  console.log(`📦 Found ${uniqueDBs.length} database(s):`);
  for (const db of uniqueDBs) {
    console.log(`   - ${db.name} (${formatBytes(db.size)})`);
  }
  
  return uniqueDBs;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// CLI mode
if (require.main === module) {
  const databases = discoverAllDatabases();
  console.log('\n📋 Database paths (for scripting):');
  databases.forEach(db => console.log(db.path));
}