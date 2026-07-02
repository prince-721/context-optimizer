// src/services/MemoryManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectMemory, FileSummary, Feature, Bug } from '../types';
import { StorageService } from './StorageService';
import { FileScanner } from './FileScanner';
import { Summarizer } from './Summarizer';
import { estimateTokens, calcSavings } from '../utils/tokenizer';

const DEFAULT_MEMORY = (): ProjectMemory => ({
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  projectName: '',
  framework: '',
  language: '',
  folderStructure: { name: 'root', type: 'folder', children: [] },
  dependencies: { runtime: {}, dev: {}, packageManager: 'npm' },
  database: { type: 'Unknown', schemas: [] },
  apiEndpoints: [],
  environmentVariables: [],
  architecture: '',
  importantFunctions: [],
  completedFeatures: [],
  pendingFeatures: [],
  knownBugs: [],
  codingStyle: { components: 'Unknown', patterns: [], asyncStyle: 'Unknown' },
  namingConvention: 'camelCase',
  libraries: [],
  projectGoals: [],
  developerNotes: [],
  fileIndex: {},
  conversationLog: [],
  tokenStats: { original: 0, compressed: 0, savedPercent: 0, history: [] },
  gitHistory: [],
});

export class MemoryManager {
  private memory: ProjectMemory;
  private storage: StorageService;
  private scanner: FileScanner;
  private summarizer: Summarizer;
  private _onDidUpdate = new vscode.EventEmitter<ProjectMemory>();
  public readonly onDidUpdate = this._onDidUpdate.event;

  constructor(context: vscode.ExtensionContext) {
    this.storage = new StorageService(context);
    this.scanner = new FileScanner();
    this.summarizer = new Summarizer();
    this.memory = this.storage.load() ?? DEFAULT_MEMORY();
    this.initProjectName();
  }

  private initProjectName() {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && !this.memory.projectName) {
      this.memory.projectName = folders[0].name;
    }
  }

  getMemory(): ProjectMemory { return this.memory; }

  async generateContext(progress?: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
    const report = (msg: string, inc = 0) => progress?.report({ message: msg, increment: inc });

    report('Scanning project files…', 10);
    const allFiles = await this.scanner.getAllFiles();
    const highPriorityFiles = allFiles.filter(f => this.scanner.getPriority(f) === 'high');
    const mediumFiles = allFiles.filter(f => this.scanner.getPriority(f) === 'medium');

    report('Building folder structure…', 10);
    this.memory.folderStructure = this.scanner.scanFolder();

    // Count original tokens before compression
    report('Estimating original tokens…', 5);
    const originalTokens = this.scanner.countOriginalTokens([...highPriorityFiles, ...mediumFiles.slice(0, 30)]);

    report('Processing high-priority files…', 20);
    await this.processFiles(highPriorityFiles);

    report('Processing code files…', 20);
    await this.processFiles(mediumFiles.slice(0, 50)); // limit for performance

    report('Detecting framework & dependencies…', 10);
    this.detectProjectMeta();

    report('Extracting APIs & environment…', 10);
    this.extractApisAndEnv(highPriorityFiles);

    report('Computing token savings…', 5);
    const summaries = Object.values(this.memory.fileIndex).map(f => f.summary);
    const compressedTokens = estimateTokens(summaries.join(' '));
    const savedPct = calcSavings(originalTokens, compressedTokens);

    this.memory.tokenStats = {
      original: originalTokens,
      compressed: compressedTokens,
      savedPercent: savedPct,
      history: [
        ...this.memory.tokenStats.history.slice(-29),
        { date: new Date().toISOString(), original: originalTokens, compressed: compressedTokens },
      ],
    };

    this.memory.lastUpdated = new Date().toISOString();
    this.storage.save(this.memory);
    this._onDidUpdate.fire(this.memory);
    report('Done!', 10);
  }

  async updateContext(): Promise<void> {
    const allFiles = await this.scanner.getAllFiles();
    let changed = 0;
    for (const f of allFiles) {
      const hash = this.scanner.hashFile(f);
      const rel = path.relative(vscode.workspace.workspaceFolders![0].uri.fsPath, f);
      const existing = this.memory.fileIndex[rel];
      if (!existing || existing.hash !== hash) {
        await this.processFile(f);
        changed++;
      }
    }
    if (changed > 0) {
      this.memory.lastUpdated = new Date().toISOString();
      this.storage.save(this.memory);
      this._onDidUpdate.fire(this.memory);
    }
    return;
  }

  private async processFiles(files: string[]): Promise<void> {
    for (const f of files) {
      await this.processFile(f);
    }
  }

  private async processFile(filePath: string): Promise<void> {
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    const content = this.scanner.readFile(filePath);
    if (!content) return;

    const hash = this.scanner.hashFile(filePath);
    const priority = this.scanner.getPriority(filePath);
    const summary = this.summarizer.summarizeFile(filePath, content);
    const tokens = estimateTokens(content);

    this.memory.fileIndex[rel] = {
      path: rel,
      priority,
      summary,
      hash,
      lastModified: new Date().toISOString(),
      tokens,
    };
  }

  private detectProjectMeta() {
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const pkgPath = path.join(root, 'package.json');

    if (fs.existsSync(pkgPath)) {
      try {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        this.memory.projectName = pkg.name || this.memory.projectName;
        const deps = this.summarizer.extractDependencies(content);
        this.memory.dependencies = deps;
        this.memory.framework = this.summarizer.detectFramework(deps);
        this.memory.database = this.summarizer.detectDatabase(deps);
        this.memory.libraries = this.summarizer.extractLibraries(deps);
      } catch { /* ignore */ }
    }

    // Detect language
    const files = Object.keys(this.memory.fileIndex);
    const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx')).length;
    const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.jsx')).length;
    const pyFiles = files.filter(f => f.endsWith('.py')).length;
    if (tsFiles > jsFiles) this.memory.language = 'TypeScript';
    else if (jsFiles > 0) this.memory.language = 'JavaScript';
    else if (pyFiles > 0) this.memory.language = 'Python';
    else this.memory.language = 'Unknown';

    // Detect coding style from source files
    const codeSummaries = Object.values(this.memory.fileIndex)
      .filter(f => f.priority === 'high' || f.priority === 'medium')
      .map(f => f.summary)
      .join(' ');

    if (codeSummaries.includes('React Hooks')) this.memory.codingStyle.patterns.push('React Hooks');
    if (codeSummaries.includes('Async/Await')) this.memory.codingStyle.asyncStyle = 'Async/Await';
    if (codeSummaries.includes('Functional Components')) this.memory.codingStyle.components = 'Functional Components';
  }

  private extractApisAndEnv(files: string[]) {
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    for (const f of files) {
      const content = this.scanner.readFile(f);
      const name = path.basename(f).toLowerCase();

      if (name.includes('route') || name.includes('router')) {
        const endpoints = this.summarizer.extractApiEndpoints(content);
        // Merge, avoid duplicates
        const existing = new Set(this.memory.apiEndpoints.map(e => `${e.method}${e.path}`));
        for (const ep of endpoints) {
          if (!existing.has(`${ep.method}${ep.path}`)) {
            this.memory.apiEndpoints.push(ep);
            existing.add(`${ep.method}${ep.path}`);
          }
        }
      }

      if (name === '.env.example' || name === '.env.sample') {
        const vars = this.summarizer.extractEnvVars(content);
        this.memory.environmentVariables = vars;
      }
    }
  }

  addFeature(feature: Feature, type: 'completed' | 'pending') {
    if (type === 'completed') {
      this.memory.completedFeatures.push({ ...feature, completedAt: new Date().toISOString() });
      this.memory.pendingFeatures = this.memory.pendingFeatures.filter(f => f.name !== feature.name);
    } else {
      this.memory.pendingFeatures.push(feature);
    }
    this.storage.save(this.memory);
    this._onDidUpdate.fire(this.memory);
  }

  addBug(bug: Bug) {
    this.memory.knownBugs.push({ ...bug, reported: new Date().toISOString() });
    this.storage.save(this.memory);
    this._onDidUpdate.fire(this.memory);
  }

  addNote(note: string) {
    this.memory.developerNotes.push(note);
    this.storage.save(this.memory);
    this._onDidUpdate.fire(this.memory);
  }

  addConversationEntry(type: 'decision' | 'architecture' | 'todo' | 'completed' | 'bugfix' | 'rejected' | 'requirement', content: string) {
    this.memory.conversationLog.push({ type, content, timestamp: new Date().toISOString() });
    // Keep last 200 entries
    if (this.memory.conversationLog.length > 200) {
      this.memory.conversationLog = this.memory.conversationLog.slice(-200);
    }
    this.storage.save(this.memory);
  }

  addGitEntry(hash: string, message: string, filesChanged: string[]) {
    // Detect architecture changes from commit message
    const archKeywords = ['refactor', 'migrate', 'restructure', 'architect', 'redesign', 'move', 'rename'];
    const isArchChange = archKeywords.some(k => message.toLowerCase().includes(k));

    // Auto-detect completed features from commit messages
    const doneKeywords = ['feat:', 'feature:', 'add:', 'implement:', 'complete:'];
    const isDone = doneKeywords.some(k => message.toLowerCase().startsWith(k));
    if (isDone) {
      const name = message.replace(/^(feat|feature|add|implement|complete):\s*/i, '');
      this.addFeature({ name, description: message }, 'completed');
    }

    this.memory.gitHistory.push({
      hash: hash.slice(0, 7),
      message,
      date: new Date().toISOString(),
      filesChanged,
      architectureChange: isArchChange ? message : undefined,
    });

    if (this.memory.gitHistory.length > 50) {
      this.memory.gitHistory = this.memory.gitHistory.slice(-50);
    }

    this.storage.save(this.memory);
    this._onDidUpdate.fire(this.memory);
  }

  reset() {
    this.memory = DEFAULT_MEMORY();
    this.initProjectName();
    this.storage.delete();
    this._onDidUpdate.fire(this.memory);
  }

  analyzeForIssues(): { duplicates: string[]; unusedFiles: string[]; missingDocs: string[] } {
    const summaries = Object.entries(this.memory.fileIndex);
    const duplicates: string[] = [];
    const unusedFiles: string[] = [];
    const missingDocs: string[] = [];

    // Find files with very similar summaries (possible duplicates)
    const seen = new Map<string, string>();
    for (const [file, info] of summaries) {
      const key = info.summary.slice(0, 80);
      if (seen.has(key) && info.priority !== 'low') {
        duplicates.push(`${seen.get(key)} ↔ ${file}`);
      } else {
        seen.set(key, file);
      }
    }

    // Files with zero references (no imports found pointing to them)
    const allSummaries = summaries.map(([, v]) => v.summary).join(' ');
    for (const [file, info] of summaries) {
      if (info.priority === 'medium') {
        const name = path.basename(file, path.extname(file));
        if (!allSummaries.includes(name) && !file.includes('index') && !file.includes('main')) {
          unusedFiles.push(file);
        }
      }
    }

    // High-priority files without meaningful summaries
    for (const [file, info] of summaries) {
      if (info.priority === 'high' && info.summary.length < 30) {
        missingDocs.push(file);
      }
    }

    return { duplicates: duplicates.slice(0, 10), unusedFiles: unusedFiles.slice(0, 10), missingDocs: missingDocs.slice(0, 10) };
  }
}
