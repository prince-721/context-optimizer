import * as path from 'path';
import * as fs from 'fs';
import { FileRecord } from './MemoryManager';
import {
  walkDirectory, relativePath, isTextFile, getExtension,
  fileExists, isoDate
} from '../utils/fileUtils';
import {
  DEFAULT_IGNORE_PATTERNS, CRITICAL_FILE_PATTERNS,
  FilePriority
} from '../utils/constants';
import { logger } from '../utils/logger';

export interface ScanResult {
  files: ScannedFile[];
  totalFiles: number;
  rootFolders: string[];
  mainEntryPoints: string[];
}

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  priority: FilePriority;
  extension: string;
  sizeBytes: number;
  language: string;
}

/** Maps file extensions to language names */
export const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript/React', js: 'JavaScript', jsx: 'JavaScript/React',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
  cs: 'C#', cpp: 'C++', c: 'C', php: 'PHP', swift: 'Swift',
  html: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'SASS', less: 'LESS',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML',
  sql: 'SQL', graphql: 'GraphQL', gql: 'GraphQL',
  md: 'Markdown', txt: 'Text', sh: 'Shell', bash: 'Shell', zsh: 'Shell',
  env: 'ENV', prisma: 'Prisma', dockerfile: 'Dockerfile',
};

/** Determine priority of a file */
export function determinePriority(relPath: string, fileName: string): FilePriority {
  const lowerName = fileName.toLowerCase();
  const lowerPath = relPath.toLowerCase().replace(/\\/g, '/');

  // Critical
  for (const pattern of CRITICAL_FILE_PATTERNS) {
    if (lowerName === pattern.toLowerCase() || lowerPath.endsWith(pattern.toLowerCase())) {
      return 'critical';
    }
  }

  // Upgrade 6: Test files tier
  if (
    lowerName.includes('.test.') ||
    lowerName.includes('.spec.') ||
    lowerPath.includes('/__tests__/') ||
    lowerPath.includes('/test/') ||
    lowerPath.includes('/tests/')
  ) {
    return 'test';
  }

  // Low — deeply nested or unimportant
  if (
    lowerPath.includes('/.vscode/') ||
    lowerPath.includes('/coverage/') ||
    lowerPath.includes('/storybook/') ||
    lowerPath.includes('/stories/')
  ) {
    return 'low';
  }

  // High — routes, controllers, models, config, entry
  if (
    lowerPath.includes('/routes/') ||
    lowerPath.includes('/api/') ||
    lowerPath.includes('/controllers/') ||
    lowerPath.includes('/middleware/') ||
    lowerPath.includes('/models/') ||
    lowerPath.includes('/schema/') ||
    lowerPath.includes('/schemas/') ||
    lowerPath.includes('/migrations/') ||
    lowerPath.includes('/config/') ||
    lowerPath.includes('/auth/') ||
    lowerName.endsWith('.config.ts') ||
    lowerName.endsWith('.config.js') ||
    lowerName.endsWith('.config.mjs') ||
    lowerName === 'index.ts' ||
    lowerName === 'index.js' ||
    lowerName === 'app.ts' ||
    lowerName === 'app.js' ||
    lowerName === 'server.ts' ||
    lowerName === 'server.js' ||
    lowerName === 'main.ts' ||
    lowerName === 'main.js'
  ) {
    return 'high';
  }

  // Medium — components, services, hooks, stores
  if (
    lowerPath.includes('/components/') ||
    lowerPath.includes('/services/') ||
    lowerPath.includes('/hooks/') ||
    lowerPath.includes('/store/') ||
    lowerPath.includes('/stores/') ||
    lowerPath.includes('/pages/') ||
    lowerPath.includes('/views/') ||
    lowerPath.includes('/utils/') ||
    lowerPath.includes('/helpers/') ||
    lowerPath.includes('/lib/')
  ) {
    return 'medium';
  }

  return 'low';
}

export class ProjectScanner {
  private workspaceRoot: string;
  private ignorePatterns: string[];

  constructor(workspaceRoot: string, ignorePatterns: string[] = DEFAULT_IGNORE_PATTERNS) {
    this.workspaceRoot = workspaceRoot;
    this.ignorePatterns = ignorePatterns;
  }

  async scan(): Promise<ScanResult> {
    logger.info(`Scanning workspace: ${this.workspaceRoot}`);

    const allFiles = walkDirectory(this.workspaceRoot, this.ignorePatterns);
    const textFiles = allFiles.filter(f => isTextFile(f));

    const scanned: ScannedFile[] = [];
    for (const absPath of textFiles) {
      try {
        const stat = fs.statSync(absPath);
        if (!stat.isFile()) continue;

        const relPath = relativePath(this.workspaceRoot, absPath);
        const fileName = path.basename(absPath);
        const ext = getExtension(absPath);
        const priority = determinePriority(relPath, fileName);

        scanned.push({
          absolutePath: absPath,
          relativePath: relPath,
          priority,
          extension: ext,
          sizeBytes: stat.size,
          language: EXT_TO_LANGUAGE[ext] ?? ext.toUpperCase() ?? 'Unknown',
        });
      } catch {
        continue;
      }
    }

    // Sort: critical → high → medium → low → test
    const order: Record<FilePriority, number> = { critical: 0, high: 1, medium: 2, low: 3, test: 4, ignore: 5 };
    scanned.sort((a, b) => order[a.priority] - order[b.priority]);

    const rootFolders = this.getRootFolders();
    const mainEntryPoints = scanned
      .filter(f => f.priority === 'critical' || (f.priority === 'high' && ['index', 'app', 'server', 'main'].includes(path.basename(f.absolutePath, path.extname(f.absolutePath)))))
      .map(f => f.relativePath)
      .slice(0, 10);

    logger.success(`Scan complete: ${scanned.length} files found (${allFiles.length} total)`);

    return {
      files: scanned,
      totalFiles: allFiles.length,
      rootFolders,
      mainEntryPoints,
    };
  }

  /** Get priority-ordered files (critical + high only) for deep analysis */
  getHighPriorityFiles(files: ScannedFile[]): ScannedFile[] {
    return files.filter(f => f.priority === 'critical' || f.priority === 'high');
  }

  /** Get ALL analyzable files */
  getAllAnalyzableFiles(files: ScannedFile[]): ScannedFile[] {
    return files.filter(f => f.priority !== 'ignore');
  }

  private getRootFolders(): string[] {
    try {
      const entries = fs.readdirSync(this.workspaceRoot, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && !DEFAULT_IGNORE_PATTERNS.includes(e.name) && !e.name.startsWith('.'))
        .map(e => e.name)
        .slice(0, 20);
    } catch {
      return [];
    }
  }
}
