import * as path from 'path';
import * as vscode from 'vscode';
import { Project } from 'ts-morph';
import { readFileSafe, isoDate } from '../utils/fileUtils';
import { sha256 } from '../utils/constants';
import { FileRecord } from './MemoryManager';
import { ScannedFile } from './ProjectScanner';
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

// In-memory cache for AI summaries (keyed by sha256 hash)
const aiSummaryCache = new Map<string, string>();

/** Analyzes source files and produces compact AST & AI summaries */
export class FileAnalyzer {
  private tsProject: Project;
  private secretApiKey?: string;

  constructor(secretApiKey?: string) {
    this.secretApiKey = secretApiKey;
    this.tsProject = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { allowJs: true }
    });
  }

  public setSecretApiKey(key?: string): void {
    this.secretApiKey = key;
  }

  async analyzeFile(file: ScannedFile): Promise<FileRecord | null> {
    const content = await readFileSafe(file.absolutePath);
    if (!content) return null;

    const hash = sha256(content);
    const lineCount = content.split('\n').length;
    
    let summary = '';
    const config = vscode.workspace.getConfiguration('contextOptimizer');
    const aiSummarization = config.get<boolean>('aiSummarization') ?? false;

    // Upgrade 5: AI Summarization if enabled, file has > 50 lines
    if (aiSummarization && lineCount > 50) {
      if (aiSummaryCache.has(hash)) {
        summary = aiSummaryCache.get(hash)!;
      } else {
        try {
          summary = await this.summarizeWithAi(content, file.relativePath);
          aiSummaryCache.set(hash, summary);
        } catch (err) {
          // Fallback to AST / Heuristic
          summary = this.summarize(content, file.extension, file.relativePath, file.priority);
        }
      }
    } else {
      summary = this.summarize(content, file.extension, file.relativePath, file.priority);
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
    const systemPrompt = `You summarize code files in one sentence. Focus on purpose, not implementation. Max 25 words.`;
    const userPrompt = `File: ${filePath}\n\nCode:\n${content.slice(0, 3000)}`;

    const summary = await callGroqChatCompletion(systemPrompt, userPrompt, this.secretApiKey);
    return summary.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
  }

  /** Determine if a file changed (by hash) */
  hasChanged(content: string, existingHash: string): boolean {
    return sha256(content) !== existingHash;
  }

  /** Core summarization logic — AST parser (ts-morph) with regex fallback */
  summarize(content: string, ext: string, filePath: string, priority?: string): string {
    const fileName = path.basename(filePath);

    // Special config & schema files
    if (fileName === 'package.json') return this.summarizePackageJson(content);
    if (fileName === 'README.md' || fileName === 'readme.md') return this.summarizeReadme(content);
    if (fileName.endsWith('.env.example') || fileName.endsWith('.env.sample')) return this.summarizeEnvFile(content);
    if (fileName === 'schema.prisma') return this.summarizePrisma(content);
    if (ext === 'sql') return this.summarizeSql(content);

    // Upgrade 6: Test files
    if (priority === 'test' || fileName.includes('.test.') || fileName.includes('.spec.') || filePath.includes('__tests__')) {
      return this.summarizeTestFile(content);
    }

    // Upgrade 1: AST-Based Summarizer for TS / JS
    if (['ts', 'tsx', 'js', 'jsx', 'mjs'].includes(ext)) {
      try {
        const astSummary = this.summarizeWithAst(content, ext);
        if (astSummary && astSummary.length > 5) {
          return astSummary;
        }
      } catch (e) {
        // Fall back to regex approach if AST fails
      }
    }

    // Generic regex fallback
    return this.summarizeWithRegex(content, ext, filePath);
  }

  /** Upgrade 1: ts-morph AST parser implementation */
  private summarizeWithAst(content: string, ext: string): string {
    const tempFileName = `temp_${Date.now()}.${ext}`;
    const sourceFile = this.tsProject.createSourceFile(tempFileName, content, { overwrite: true });

    const parts: string[] = [];

    try {
      // 1. Functions & Async functions
      const functions = sourceFile.getFunctions();
      for (const fn of functions.slice(0, 8)) {
        const name = fn.getName();
        if (!name) continue;
        const params = fn.getParameters().map(p => {
          const pName = p.getName();
          const pType = p.getTypeNode() ? p.getTypeNode()!.getText() : 'any';
          return `${pName}: ${pType}`;
        }).join(', ');
        const retType = fn.getReturnTypeNode() ? fn.getReturnTypeNode()!.getText() : 'void';
        const isAsync = fn.isAsync() ? 'async ' : '';
        parts.push(`${isAsync}fn ${name}(${params}): ${retType}`);
      }

      // 2. React Components & Props
      const interfaces = sourceFile.getInterfaces();
      for (const iface of interfaces) {
        const iName = iface.getName();
        if (iName.endsWith('Props') || iName.endsWith('State')) {
          const props = iface.getProperties().map(p => {
            const optional = p.hasQuestionToken() ? '?' : '';
            return `${p.getName()}${optional}: ${p.getTypeNode() ? p.getTypeNode()!.getText() : 'any'}`;
          }).join(', ');
          parts.push(`component ${iName}{${props}}`);
        }
      }

      // 3. Classes & Methods
      const classes = sourceFile.getClasses();
      for (const cls of classes.slice(0, 5)) {
        const className = cls.getName() || 'AnonymousClass';
        const methodNames = cls.getMethods().map(m => {
          const scope = m.isPrivate() ? 'private ' : m.isProtected() ? 'protected ' : '';
          return `${scope}${m.getName()}()`;
        }).slice(0, 6).join(', ');
        parts.push(`class ${className}{${methodNames}}`);
      }

      // 4. Exported Declarations
      const exportedDeclarations = sourceFile.getExportedDeclarations();
      const exportNames: string[] = [];
      exportedDeclarations.forEach((decl, name) => {
        if (name && !exportNames.includes(name)) {
          exportNames.push(name);
        }
      });
      if (exportNames.length > 0) {
        parts.push(`exports:${exportNames.slice(0, 8).join(',')}`);
      }
    } finally {
      // Remove temporary file from in-memory ts-morph filesystem
      this.tsProject.removeSourceFile(sourceFile);
    }

    if (parts.length === 0) return '';
    return parts.join(' | ').slice(0, 300);
  }

  /** Upgrade 6: Test file AST / regex parser */
  private summarizeTestFile(content: string): string {
    const describes: string[] = [];
    const tests: string[] = [];

    const describeRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = describeRegex.exec(content)) !== null) {
      describes.push(match[1]);
    }

    const testRegex = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((match = testRegex.exec(content)) !== null) {
      tests.push(match[1]);
    }

    const describeStr = describes.length > 0 ? `Tests for: ${describes.join(', ')}` : 'Test Suite';
    const coversStr = tests.length > 0 ? `Covers: ${tests.slice(0, 4).join(', ')}` : '';
    const countStr = `${tests.length} cases total`;

    return [describeStr, coversStr, countStr].filter(Boolean).join('. ');
  }

  private summarizeWithRegex(content: string, ext: string, filePath: string): string {
    const info = this.extractRegex(content);
    const parts: string[] = [];

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
      const lines = content.split('\n').filter(l => l.trim().length > 10).slice(0, 3);
      return lines.join(' ').slice(0, 200) || 'No summary available';
    }

    return parts.join('. ');
  }

  private extractRegex(content: string): ExtractedInfo {
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

      const exportMatch = trimmed.match(/^export\s+(?:default\s+)?(?:function|class|const|let|var|async function)\s+(\w+)/);
      if (exportMatch) info.exports.push(exportMatch[1]);

      const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
      if (fnMatch) info.functions.push(fnMatch[1]);

      const arrowMatch = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/);
      if (arrowMatch && arrowMatch[1] !== arrowMatch[1].toUpperCase()) info.functions.push(arrowMatch[1]);

      const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) info.classes.push(classMatch[1]);

      const pyFnMatch = trimmed.match(/^def\s+(\w+)\s*\(/);
      if (pyFnMatch) info.functions.push(pyFnMatch[1]);
      const pyClassMatch = trimmed.match(/^class\s+(\w+)[\s:(]/);
      if (pyClassMatch) info.classes.push(pyClassMatch[1]);

      const routeMatch = trimmed.match(/(?:app|router|server)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (routeMatch) info.routes.push(`${routeMatch[1].toUpperCase()} ${routeMatch[2]}`);
    }

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
