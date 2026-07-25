import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { MEMORY_DIR, MEMORY_FILE, MEMORY_VERSION } from '../utils/constants';
import {
  writeJsonFile, readJsonFile, ensureDir, fileExists, isoDate
} from '../utils/fileUtils';

// ─── Memory Schema ────────────────────────────────────────────────────────────

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  file?: string;
}

export interface FileRecord {
  path: string;           // relative to workspace root
  priority: 'critical' | 'high' | 'medium' | 'low' | 'test';
  summary: string;
  lastAnalyzed: string;
  hash: string;
  size?: number;
  language?: string;
}

export interface ConversationNote {
  date: string;
  type: 'decision' | 'todo' | 'bugfix' | 'requirement' | 'rejection' | 'note' | 'completed';
  content: string;
}

export interface ProjectMemory {
  project: {
    name: string;
    description: string;
    goals: string[];
    version: string;
  };
  workspaceRoots?: string[];
  stack: {
    frontend: string;
    backend: string;
    database: string;
    auth: string;
    devOps: string;
    other: string[];
  };
  structure: {
    rootFolders: string[];
    mainEntryPoints: string[];
    totalFiles: number;
    analyzedFiles: number;
  };
  dependencies: {
    production: Record<string, string>;
    development: Record<string, string>;
    frameworks: string[];
  };
  api: {
    endpoints: ApiEndpoint[];
    baseUrl: string;
  };
  environment: {
    variables: string[];  // names only, never values
  };
  database: {
    type: string;
    models: string[];
    schemas: string[];
  };
  files: FileRecord[];
  features: {
    completed: string[];
    pending: string[];
    inProgress: string[];
  };
  bugs: string[];
  codingStyle: {
    patterns: string[];
    namingConventions: string[];
    libraries: string[];
  };
  architecture: {
    summary: string;
    decisions: string[];
    patterns: string[];
  };
  conversations: ConversationNote[];
  rules: string[];
  developerNotes: string[];
  meta: {
    lastUpdated: string;
    version: string;
    workspaceRoot: string;
    tokenEstimate: {
      original: number;
      compressed: number;
      savedPercent: number;
    };
  };
}

// ─── Default / Empty Memory ───────────────────────────────────────────────────

export function createEmptyMemory(workspaceRoot: string, projectName: string): ProjectMemory {
  return {
    project: { name: projectName, description: '', goals: [], version: '' },
    workspaceRoots: [workspaceRoot],
    stack: { frontend: '', backend: '', database: '', auth: '', devOps: '', other: [] },
    structure: { rootFolders: [], mainEntryPoints: [], totalFiles: 0, analyzedFiles: 0 },
    dependencies: { production: {}, development: {}, frameworks: [] },
    api: { endpoints: [], baseUrl: '' },
    environment: { variables: [] },
    database: { type: '', models: [], schemas: [] },
    files: [],
    features: { completed: [], pending: [], inProgress: [] },
    bugs: [],
    codingStyle: { patterns: [], namingConventions: [], libraries: [] },
    architecture: { summary: '', decisions: [], patterns: [] },
    conversations: [],
    rules: [],
    developerNotes: [],
    meta: {
      lastUpdated: isoDate(),
      version: MEMORY_VERSION,
      workspaceRoot,
      tokenEstimate: { original: 0, compressed: 0, savedPercent: 0 },
    },
  };
}

// ─── MemoryManager Class ──────────────────────────────────────────────────────

export class MemoryManager {
  private memory: ProjectMemory | null = null;
  private previousMemorySnapshot: ProjectMemory | null = null;
  private lastDiffLines: string[] = [];
  private memoryPath: string;
  private workspaceRoot: string;

  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.memoryPath = path.join(workspaceRoot, MEMORY_DIR, MEMORY_FILE);
  }

  /** Snapshot current memory before generate/update run */
  public snapshot(): void {
    if (this.memory) {
      this.previousMemorySnapshot = JSON.parse(JSON.stringify(this.memory));
    }
  }

  /** Compute human-readable diff lines between snapshot and current memory */
  public computeDiff(): string[] {
    const diff: string[] = [];
    if (!this.previousMemorySnapshot || !this.memory) {
      this.lastDiffLines = ['⚡ Fresh project context created.'];
      return this.lastDiffLines;
    }

    const prev = this.previousMemorySnapshot;
    const curr = this.memory;

    // Files diff
    const prevFileMap = new Map(prev.files.map(f => [f.path, f]));
    const currFileMap = new Map(curr.files.map(f => [f.path, f]));

    for (const [path] of currFileMap) {
      if (!prevFileMap.has(path)) {
        diff.push(`➕ Added new file: ${path}`);
      }
    }
    for (const [path] of prevFileMap) {
      if (!currFileMap.has(path)) {
        diff.push(`➖ Removed file: ${path}`);
      }
    }

    // Features diff
    const newlyCompleted = curr.features.completed.filter(f => !prev.features.completed.includes(f));
    for (const feat of newlyCompleted) {
      diff.push(`✅ Feature completed: "${feat}"`);
    }

    const newlyPending = curr.features.pending.filter(f => !prev.features.pending.includes(f));
    for (const feat of newlyPending) {
      diff.push(`➕ Feature pending: "${feat}"`);
    }

    // Bugs diff
    const newBugs = curr.bugs.filter(b => !prev.bugs.includes(b));
    for (const bug of newBugs) {
      diff.push(`🐛 New bug logged: "${bug}"`);
    }

    // Token savings change
    const prevSavings = prev.meta.tokenEstimate.savedPercent || 0;
    const currSavings = curr.meta.tokenEstimate.savedPercent || 0;
    if (prevSavings !== currSavings) {
      diff.push(`⚡ Token savings changed: ${prevSavings}% → ${currSavings}%`);
    }

    // New API Endpoints
    const prevEpKeys = new Set(prev.api.endpoints.map(e => `${e.method} ${e.path}`));
    for (const ep of curr.api.endpoints) {
      if (!prevEpKeys.has(`${ep.method} ${ep.path}`)) {
        diff.push(`➕ API Endpoint detected: ${ep.method} ${ep.path}`);
      }
    }

    if (diff.length === 0) {
      diff.push('ℹ️ No major context changes detected.');
    }

    this.lastDiffLines = diff;
    return diff;
  }

  public getLastDiff(): string[] {
    return this.lastDiffLines;
  }

  /** Load memory from disk, or create a fresh one */
  load(): ProjectMemory {
    if (this.memory) return this.memory;

    const existing = readJsonFile<ProjectMemory>(this.memoryPath);
    if (existing) {
      this.memory = existing;
      return this.memory;
    }

    const projectName = path.basename(this.workspaceRoot);
    this.memory = createEmptyMemory(this.workspaceRoot, projectName);
    return this.memory;
  }

  /** Get current memory (load if needed) */
  get(): ProjectMemory {
    return this.memory ?? this.load();
  }

  /** Merge partial updates into memory */
  update(partial: Partial<ProjectMemory>): void {
    const mem = this.get();
    Object.assign(mem, partial);
    mem.meta.lastUpdated = isoDate();
    this.save();
  }

  /** Deep merge a specific section */
  updateSection<K extends keyof ProjectMemory>(key: K, value: ProjectMemory[K]): void {
    const mem = this.get();
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      (mem[key] as Record<string, unknown>) = {
        ...(mem[key] as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      };
    } else {
      mem[key] = value;
    }
    mem.meta.lastUpdated = isoDate();
    this.save();
  }

  /** Update a single file record (by path), or add it */
  upsertFileRecord(record: FileRecord): void {
    const mem = this.get();
    const idx = mem.files.findIndex(f => f.path === record.path);
    if (idx >= 0) {
      mem.files[idx] = record;
    } else {
      mem.files.push(record);
    }
    mem.meta.lastUpdated = isoDate();
    this.save();
  }

  /** Get a file record by relative path */
  getFileRecord(relativePath: string): FileRecord | undefined {
    return this.get().files.find(f => f.path === relativePath);
  }

  /** Add a conversation note */
  addNote(note: ConversationNote): void {
    const mem = this.get();
    mem.conversations.unshift(note);
    // Keep last 200 notes
    if (mem.conversations.length > 200) {
      mem.conversations = mem.conversations.slice(0, 200);
    }
    this.save();
  }

  /** Add a developer rule */
  addRule(rule: string): void {
    const mem = this.get();
    if (!mem.rules.includes(rule)) {
      mem.rules.push(rule);
    }
    this.save();
  }

  /** Add a developer note */
  addDeveloperNote(note: string): void {
    const mem = this.get();
    if (!mem.developerNotes.includes(note)) {
      mem.developerNotes.unshift(note);
    }
    this.save();
  }

  /** Reset memory to empty */
  reset(): void {
    const projectName = path.basename(this.workspaceRoot);
    this.memory = createEmptyMemory(this.workspaceRoot, projectName);
    this.save();
    this._onDidChange.fire();
  }

  /** Save memory to disk */
  save(): void {
    try {
      const memDir = path.join(this.workspaceRoot, MEMORY_DIR);
      ensureDir(memDir);
      writeJsonFile(this.memoryPath, this.memory);
      this._onDidChange.fire();
    } catch (err) {
      console.error('MemoryManager: Failed to save memory', err);
    }
  }

  /** Check if memory file exists on disk */
  exists(): boolean {
    return fileExists(this.memoryPath);
  }

  /** Get memory file path */
  getMemoryPath(): string {
    return this.memoryPath;
  }

  /** Get output directory */
  getOutputDir(): string {
    return path.join(this.workspaceRoot, MEMORY_DIR);
  }

  /** Get exports directory */
  getExportsDir(): string {
    return path.join(this.workspaceRoot, MEMORY_DIR, 'exports');
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
