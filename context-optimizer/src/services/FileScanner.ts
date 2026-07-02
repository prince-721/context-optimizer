// src/services/FileScanner.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileSummary, FolderNode } from '../types';
import { estimateTokens } from '../utils/tokenizer';
import * as crypto from 'crypto';

const HIGH_PRIORITY_PATTERNS = [
  /package\.json$/,
  /tsconfig.*\.json$/,
  /README\.md$/i,
  /\.env\.example$/,
  /schema\.(ts|js|prisma|sql|graphql)$/i,
  /model[s]?\.(ts|js)$/i,
  /route[s]?\.(ts|js)$/i,
  /router\.(ts|js)$/i,
  /config\.(ts|js|json)$/i,
  /app\.(ts|js|tsx|jsx)$/i,
  /main\.(ts|js|tsx|jsx)$/i,
  /index\.(ts|js|tsx|jsx)$/,
  /server\.(ts|js)$/i,
  /database\.(ts|js)$/i,
  /auth.*\.(ts|js|tsx|jsx)$/i,
  /middleware.*\.(ts|js)$/i,
  /prisma\/schema\.prisma$/,
  /Dockerfile$/,
  /docker-compose.*\.ya?ml$/,
];

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.cache\//,
  /coverage\//,
  /\.nyc_output/,
  /logs?\//,
  /\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|pdf|woff|woff2|ttf|eot|ico)$/i,
  /\.(lock|map)$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

const MEDIUM_PRIORITY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.php', '.rb'];
const LOW_PRIORITY_EXTENSIONS = ['.md', '.yml', '.yaml', '.json', '.toml', '.ini', '.cfg', '.txt'];

export class FileScanner {
  private workspaceRoot: string;

  constructor() {
    const folders = vscode.workspace.workspaceFolders;
    this.workspaceRoot = folders?.[0]?.uri?.fsPath ?? '';
  }

  shouldIgnore(filePath: string): boolean {
    const rel = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    const config = vscode.workspace.getConfiguration('contextOptimizer');
    const customIgnore: string[] = config.get('ignorePatterns') ?? [];

    if (IGNORE_PATTERNS.some(p => p.test(rel))) return true;
    if (customIgnore.some(pattern => rel.includes(pattern))) return true;
    return false;
  }

  getPriority(filePath: string): FileSummary['priority'] {
    if (this.shouldIgnore(filePath)) return 'ignore';
    const rel = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    if (HIGH_PRIORITY_PATTERNS.some(p => p.test(rel))) return 'high';
    const ext = path.extname(filePath).toLowerCase();
    if (MEDIUM_PRIORITY_EXTENSIONS.includes(ext)) return 'medium';
    if (LOW_PRIORITY_EXTENSIONS.includes(ext)) return 'low';
    return 'ignore';
  }

  hashFile(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  readFile(filePath: string): string {
    try {
      const config = vscode.workspace.getConfiguration('contextOptimizer');
      const maxKB: number = config.get('maxFileSizeKB') ?? 100;
      const stat = fs.statSync(filePath);
      if (stat.size > maxKB * 1024) return `[File too large: ${Math.round(stat.size / 1024)}KB]`;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  scanFolder(dir: string = this.workspaceRoot, depth = 0, maxDepth = 6): FolderNode {
    const name = path.basename(dir);
    const node: FolderNode = { name, type: 'folder', children: [] };

    if (depth > maxDepth) return node;
    if (this.shouldIgnore(dir)) {
      node.priority = 'ignore';
      return node;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return node;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!this.shouldIgnore(fullPath)) {
          node.children!.push(this.scanFolder(fullPath, depth + 1, maxDepth));
        }
      } else {
        const priority = this.getPriority(fullPath);
        if (priority !== 'ignore') {
          node.children!.push({
            name: entry.name,
            type: 'file',
            priority,
          });
        }
      }
    }

    return node;
  }

  async getAllFiles(dir: string = this.workspaceRoot): Promise<string[]> {
    const result: string[] = [];
    const walk = (d: string) => {
      if (this.shouldIgnore(d)) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (this.getPriority(full) !== 'ignore') result.push(full);
      }
    };
    walk(dir);
    return result;
  }

  countOriginalTokens(files: string[]): number {
    let total = 0;
    for (const f of files) {
      const content = this.readFile(f);
      total += estimateTokens(content);
    }
    return total;
  }
}
