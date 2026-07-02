import * as path from 'path';
import * as vscode from 'vscode';
import { readFileSafe, getExtension } from '../utils/fileUtils';
import { sha256, MAX_FILE_SIZE_BYTES } from '../utils/constants';
import { FileRecord } from './MemoryManager';
import { ScannedFile } from './ProjectScanner';
import { isoDate } from '../utils/fileUtils';
import { callGroqChatCompletion } from '../utils/groqClient';

interface ExtractedInfo {
  exports: string[];
  imports: string[];
  functions: string[];
  classes: string[];
  routes: string[];
  todos: string[];
  schemas: string[];
}

/** Analyzes source files and produces compact summaries */
export class FileAnalyzer {

  async analyzeFile(file: ScannedFile): Promise<FileRecord | null> {
    const content = await readFileSafe(file.absolutePath);
    if (!content) return null;

    const hash = sha256(content);
    
    let summary = '';
    const config = vscode.workspace.getConfiguration('contextOptimizer');
    const useAi = config.get<boolean>('useAiSummarization') ?? true;

    if (useAi) {
      try {
        summary = await this.summarizeWithAi(content, file.relativePath);
      } catch (err) {
        // Fallback to heuristic
        summary = this.summarize(content, file.extension, file.relativePath);
      }
    } else {
      summary = this.summarize(content, file.extension, file.relativePath);
    }

    return {
      path: file.relativePath,
      priority: file.priority as FileRecord['priority'],
      summary,
      lastAnalyzed: isoDate(),
      hash,
      size: file.sizeBytes,
      language: file.language,
    };
  }

  async summarizeWithAi(content: string, filePath: string): Promise<string> {
    const systemPrompt = `You are a professional software development assistant. Your task is to provide a single, highly concise, one-sentence summary of the provided source code file. Focus on its main purpose, exports, and core functionality. Keep your answer strictly under 20 words. Do not include any introductory or concluding conversational text.`;
    const userPrompt = `File: ${filePath}\n\nCode Content:\n${content.slice(0, 12000)}`;

    const summary = await callGroqChatCompletion(systemPrompt, userPrompt);
    return summary.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
  }

  /** Determine if a file changed (by hash) */
  hasChanged(content: string, existingHash: string): boolean {
    return sha256(content) !== existingHash;
  }

  /** Core summarization logic — regex/AST heuristics, no AI */
  summarize(content: string, ext: string, filePath: string): string {
    const fileName = path.basename(filePath);
    const info = this.extract(content, ext);
    const parts: string[] = [];

    // File-type specific summaries
    if (fileName === 'package.json') return this.summarizePackageJson(content);
    if (fileName === 'README.md' || fileName === 'readme.md') return this.summarizeReadme(content);
    if (fileName.endsWith('.env.example') || fileName.endsWith('.env.sample')) return this.summarizeEnvFile(content);
    if (fileName === 'schema.prisma') return this.summarizePrisma(content);
    if (ext === 'sql') return this.summarizeSql(content);

    // Generic code summary
    if (info.classes.length > 0) parts.push(`Classes: ${info.classes.join(', ')}`);
    if (info.functions.length > 0) {
      const fns = info.functions.slice(0, 12);
      parts.push(`Functions: ${fns.join(', ')}${info.functions.length > 12 ? ` +${info.functions.length - 12} more` : ''}`);
    }
    if (info.exports.length > 0) parts.push(`Exports: ${info.exports.slice(0, 8).join(', ')}`);
    if (info.routes.length > 0) parts.push(`Routes: ${info.routes.slice(0, 10).join(', ')}`);
    if (info.schemas.length > 0) parts.push(`Schemas: ${info.schemas.join(', ')}`);
    if (info.todos.length > 0) parts.push(`TODOs: ${info.todos.slice(0, 5).join(' | ')}`);

    if (parts.length === 0) {
      // Fallback: first meaningful line
      const lines = content.split('\n').filter(l => l.trim().length > 10).slice(0, 3);
      return lines.join(' ').slice(0, 200) || 'No summary available';
    }

    return parts.join('. ');
  }

  private extract(content: string, ext: string): ExtractedInfo {
    const info: ExtractedInfo = {
      exports: [],
      imports: [],
      functions: [],
      classes: [],
      routes: [],
      todos: [],
      schemas: [],
    };

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Exports (JS/TS)
      const exportMatch = trimmed.match(/^export\s+(?:default\s+)?(?:function|class|const|let|var|async function)\s+(\w+)/);
      if (exportMatch) info.exports.push(exportMatch[1]);

      // Functions (JS/TS)
      const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
      if (fnMatch) info.functions.push(fnMatch[1]);

      // Arrow functions assigned to const
      const arrowMatch = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/);
      if (arrowMatch && arrowMatch[1] !== arrowMatch[1].toUpperCase()) info.functions.push(arrowMatch[1]);

      // Classes
      const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) info.classes.push(classMatch[1]);

      // Python defs
      const pyFnMatch = trimmed.match(/^def\s+(\w+)\s*\(/);
      if (pyFnMatch) info.functions.push(pyFnMatch[1]);
      const pyClassMatch = trimmed.match(/^class\s+(\w+)[\s:(]/);
      if (pyClassMatch) info.classes.push(pyClassMatch[1]);

      // Express/Fastify/Hono routes
      const routeMatch = trimmed.match(/(?:app|router|server)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (routeMatch) info.routes.push(`${routeMatch[1].toUpperCase()} ${routeMatch[2]}`);

      // FastAPI routes
      const fastapiMatch = trimmed.match(/@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (fastapiMatch) info.routes.push(`${fastapiMatch[1].toUpperCase()} ${fastapiMatch[2]}`);

      // Mongoose schemas
      const mongooseMatch = trimmed.match(/(?:const|let|var)\s+(\w+Schema)\s*=\s*new\s+Schema/);
      if (mongooseMatch) info.schemas.push(mongooseMatch[1]);

      // TODOs / FIXMEs
      const todoMatch = trimmed.match(/\/\/\s*(TODO|FIXME|HACK|NOTE):\s*(.+)/i);
      if (todoMatch) info.todos.push(`${todoMatch[1]}: ${todoMatch[2].slice(0, 60)}`);

      // Imports (first 30 only)
      if (info.imports.length < 30) {
        const importMatch = trimmed.match(/^import\s+.+\s+from\s+['"`]([^'"`]+)['"`]/);
        if (importMatch && !importMatch[1].startsWith('.')) info.imports.push(importMatch[1]);
      }
    }

    // Deduplicate
    info.functions = [...new Set(info.functions)];
    info.classes = [...new Set(info.classes)];
    info.exports = [...new Set(info.exports)];
    info.routes = [...new Set(info.routes)];

    return info;
  }

  private summarizePackageJson(content: string): string {
    try {
      const pkg = JSON.parse(content);
      const name = pkg.name ?? 'unknown';
      const version = pkg.version ?? '';
      const deps = Object.keys(pkg.dependencies ?? {}).join(', ');
      const devDeps = Object.keys(pkg.devDependencies ?? {}).slice(0, 5).join(', ');
      const scripts = Object.keys(pkg.scripts ?? {}).join(', ');
      return `Package: ${name}@${version}. Deps: ${deps || 'none'}. DevDeps: ${devDeps}. Scripts: ${scripts}`;
    } catch {
      return 'package.json (parse error)';
    }
  }

  private summarizeReadme(content: string): string {
    const lines = content.split('\n').filter(l => l.trim());
    // Grab h1, first paragraph, and first h2s
    const title = lines.find(l => l.startsWith('# '))?.slice(2).trim() ?? '';
    const desc = lines.find(l => l.length > 20 && !l.startsWith('#'))?.trim() ?? '';
    const sections = lines.filter(l => l.startsWith('## ')).map(l => l.slice(3).trim()).slice(0, 8);
    return `README: ${title}. ${desc}. Sections: ${sections.join(', ')}`.slice(0, 300);
  }

  private summarizeEnvFile(content: string): string {
    const vars = content.split('\n')
      .filter(l => l.trim() && !l.startsWith('#'))
      .map(l => l.split('=')[0].trim())
      .filter(Boolean);
    return `Env vars (${vars.length}): ${vars.join(', ')}`;
  }

  private summarizePrisma(content: string): string {
    const models = [...content.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]);
    const enums = [...content.matchAll(/^enum\s+(\w+)\s*\{/gm)].map(m => m[1]);
    const dbMatch = content.match(/provider\s*=\s*"(\w+)"/);
    return `Prisma schema. DB: ${dbMatch?.[1] ?? 'unknown'}. Models: ${models.join(', ')}${enums.length ? `. Enums: ${enums.join(', ')}` : ''}`;
  }

  private summarizeSql(content: string): string {
    const tables = [...content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?/gi)].map(m => m[1]);
    return `SQL schema. Tables: ${tables.join(', ') || 'none detected'}`;
  }
}
