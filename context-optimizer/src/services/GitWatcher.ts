// src/services/GitWatcher.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryManager } from './MemoryManager';

export class GitWatcher implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private gitHeadPath: string | null = null;
  private lastHead: string = '';
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private manager: MemoryManager) {
    const config = vscode.workspace.getConfiguration('contextOptimizer');
    if (!config.get('gitIntegration')) return;
    this.setupWatcher();
  }

  private setupWatcher() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;

    const gitDir = path.join(folders[0].uri.fsPath, '.git');
    if (!fs.existsSync(gitDir)) return;

    this.gitHeadPath = path.join(gitDir, 'COMMIT_EDITMSG');

    // Poll every 10 seconds for new commits
    this.interval = setInterval(() => this.checkForNewCommit(), 10_000);
  }

  private async checkForNewCommit() {
    if (!this.gitHeadPath || !fs.existsSync(this.gitHeadPath)) return;
    try {
      const msg = fs.readFileSync(this.gitHeadPath, 'utf-8').trim();
      if (msg && msg !== this.lastHead && !msg.startsWith('#')) {
        this.lastHead = msg;
        const hash = this.readHead();
        this.manager.addGitEntry(hash, msg, []);
        await this.manager.updateContext();
      }
    } catch { /* ignore */ }
  }

  private readHead(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return 'unknown';
    const headFile = path.join(folders[0].uri.fsPath, '.git', 'HEAD');
    try {
      const ref = fs.readFileSync(headFile, 'utf-8').trim();
      if (ref.startsWith('ref: ')) {
        const refPath = path.join(folders[0].uri.fsPath, '.git', ref.replace('ref: ', ''));
        if (fs.existsSync(refPath)) return fs.readFileSync(refPath, 'utf-8').trim().slice(0, 7);
      }
      return ref.slice(0, 7);
    } catch {
      return 'unknown';
    }
  }

  dispose() {
    if (this.interval) clearInterval(this.interval);
    this.disposables.forEach(d => d.dispose());
  }
}
