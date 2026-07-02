import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_IGNORE_PATTERNS, MAX_FILE_SIZE_BYTES } from './constants';

/** Read a file safely, returning null on error or oversized files */
export async function readFileSafe(filePath: string, maxBytes = MAX_FILE_SIZE_BYTES): Promise<string | null> {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Check if a file exists */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/** Ensure a directory exists (mkdir -p) */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** Write JSON to a file safely */
export function writeJsonFile(filePath: string, data: unknown, pretty = true): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8');
}

/** Write text to a file safely */
export function writeTextFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

/** Read JSON from a file safely */
export function readJsonFile<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** Get workspace root path */
export function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

/** Get all files recursively under a directory, respecting ignore patterns */
export function walkDirectory(
  dir: string,
  ignorePatterns: string[] = DEFAULT_IGNORE_PATTERNS,
  maxDepth = 12
): string[] {
  const results: string[] = [];

  function shouldIgnore(name: string, fullPath: string): boolean {
    // Check against simple patterns (no glob)
    for (const pattern of ignorePatterns) {
      if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1);
        if (name.endsWith(ext)) return true;
      } else if (name === pattern || fullPath.includes(`${path.sep}${pattern}${path.sep}`) || fullPath.endsWith(`${path.sep}${pattern}`)) {
        return true;
      }
    }
    return false;
  }

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (shouldIgnore(entry.name, fullPath)) continue;
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  walk(dir, 0);
  return results;
}

/** Get relative path from workspace root */
export function relativePath(workspaceRoot: string, absPath: string): string {
  return path.relative(workspaceRoot, absPath).replace(/\\/g, '/');
}

/** Get file extension (lowercase, without dot) */
export function getExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace('.', '');
}

/** Check if file is a text file (analyzable) */
export function isTextFile(filePath: string): boolean {
  const binaryExts = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'svg', 'bmp', 'tiff',
    'mp4', 'mp3', 'wav', 'ogg', 'webm', 'avi', 'mov',
    'zip', 'tar', 'gz', 'rar', '7z',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'ttf', 'woff', 'woff2', 'eot',
    'exe', 'dll', 'so', 'dylib',
    'pyc', 'class', 'jar',
    'db', 'sqlite', 'sqlite3',
  ]);
  return !binaryExts.has(getExtension(filePath));
}

/** Truncate a string to a max length with ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/** Format a date to ISO string (date only) */
export function isoDate(): string {
  return new Date().toISOString();
}

/** Escape markdown special characters */
export function escapeMarkdown(text: string): string {
  return text.replace(/[*_`[\]()#>+\-!]/g, '\\$&');
}
