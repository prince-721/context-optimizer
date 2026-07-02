import * as path from 'path';
import { walkDirectory, readFileSafe, relativePath, isTextFile } from '../utils/fileUtils';
import { logger } from '../utils/logger';

export interface DuplicateResult {
  duplicateFunctions: Array<{ name: string; files: string[] }>;
  unusedFiles: string[];
  deadExports: Array<{ name: string; file: string }>;
}

export class DuplicateDetector {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async detect(): Promise<DuplicateResult> {
    const codeFiles = walkDirectory(this.workspaceRoot)
      .filter(f => /\.(ts|tsx|js|jsx)$/.test(f) && isTextFile(f));

    const functionMap = new Map<string, string[]>(); // fnName -> [files]
    const exportMap = new Map<string, string>();      // exportName -> file
    const importedNames = new Set<string>();          // all imported identifiers
    const allImportedFiles = new Set<string>();       // all import paths

    for (const file of codeFiles) {
      const content = await readFileSafe(file);
      if (!content) continue;

      const rel = relativePath(this.workspaceRoot, file);
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Detect function definitions
        const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
        if (fnMatch) {
          const name = fnMatch[1];
          const existing = functionMap.get(name) ?? [];
          functionMap.set(name, [...existing, rel]);
        }

        // Detect named exports
        const exportMatch = trimmed.match(/^export\s+(?:const|function|class|let|var|async\s+function)\s+(\w+)/);
        if (exportMatch && !exportMap.has(exportMatch[1])) {
          exportMap.set(exportMatch[1], rel);
        }

        // Track imports
        const importMatch = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/);
        if (importMatch) {
          importMatch[1].split(',').forEach(name => importedNames.add(name.trim().split(' as ')[0].trim()));
          const importedPath = importMatch[2];
          if (importedPath.startsWith('.')) {
            // Resolve relative import path
            const resolvedDir = path.dirname(file);
            const resolved = path.resolve(resolvedDir, importedPath);
            allImportedFiles.add(resolved);
            allImportedFiles.add(resolved + '.ts');
            allImportedFiles.add(resolved + '.tsx');
            allImportedFiles.add(resolved + '.js');
            allImportedFiles.add(resolved + '/index.ts');
            allImportedFiles.add(resolved + '/index.js');
          }
        }
      }
    }

    // Duplicate functions: appear in 2+ files
    const duplicateFunctions: DuplicateResult['duplicateFunctions'] = [];
    for (const [name, files] of functionMap.entries()) {
      if (files.length >= 2 && !['default', 'handler', 'main', 'init', 'App', 'Home', 'Index'].includes(name)) {
        duplicateFunctions.push({ name, files });
      }
    }

    // Unused files: files that are never imported
    const unusedFiles: string[] = [];
    for (const file of codeFiles) {
      const isEntry = /(?:index|app|server|main)\.[jt]sx?$/.test(file);
      const isConfig = /\.config\.[jt]s$/.test(file);
      const isTest = /\.(test|spec)\.[jt]sx?$/.test(file);
      if (isEntry || isConfig || isTest) continue;

      const isImported = allImportedFiles.has(file) ||
        [...allImportedFiles].some(imp => imp.startsWith(file.replace(/\.[jt]sx?$/, '')));
      if (!isImported) {
        unusedFiles.push(relativePath(this.workspaceRoot, file));
      }
    }

    // Dead exports: exported but never imported by name
    const deadExports: DuplicateResult['deadExports'] = [];
    for (const [name, file] of exportMap.entries()) {
      if (!importedNames.has(name) && name !== 'default') {
        deadExports.push({ name, file });
      }
    }

    logger.info(
      `DuplicateDetector: ${duplicateFunctions.length} duplicate fns, ` +
      `${unusedFiles.length} unused files, ${deadExports.length} dead exports`
    );

    return {
      duplicateFunctions: duplicateFunctions.slice(0, 20),
      unusedFiles: unusedFiles.slice(0, 50),
      deadExports: deadExports.slice(0, 30),
    };
  }
}
