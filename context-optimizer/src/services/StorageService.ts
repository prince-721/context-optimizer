// src/services/StorageService.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectMemory } from '../types';

export class StorageService {
  private storagePath: string;
  private memoryFile: string;

  constructor(context: vscode.ExtensionContext) {
    this.storagePath = context.globalStorageUri.fsPath;
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    const workspaceId = this.getWorkspaceId();
    this.memoryFile = path.join(this.storagePath, `${workspaceId}.json`);
  }

  private getWorkspaceId(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return 'default';
    const root = workspaceFolders[0].uri.fsPath;
    return Buffer.from(root).toString('base64').replace(/[/+=]/g, '_').slice(0, 64);
  }

  load(): ProjectMemory | null {
    try {
      if (!fs.existsSync(this.memoryFile)) return null;
      const data = fs.readFileSync(this.memoryFile, 'utf-8');
      return JSON.parse(data) as ProjectMemory;
    } catch {
      return null;
    }
  }

  save(memory: ProjectMemory): void {
    fs.writeFileSync(this.memoryFile, JSON.stringify(memory, null, 2), 'utf-8');
  }

  delete(): void {
    if (fs.existsSync(this.memoryFile)) {
      fs.unlinkSync(this.memoryFile);
    }
  }

  exportToWorkspace(format: { markdown: string; json: string; minJson: string; optimizedPrompt: string }): string[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) throw new Error('No workspace open');
    const root = workspaceFolders[0].uri.fsPath;
    const exportDir = path.join(root, '.context-optimizer');

    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const files: string[] = [];
    const write = (name: string, content: string) => {
      const p = path.join(exportDir, name);
      fs.writeFileSync(p, content, 'utf-8');
      files.push(p);
    };

    write('context.md', format.markdown);
    write('context.json', format.json);
    write('context.min.json', format.minJson);
    write('optimized_prompt.txt', format.optimizedPrompt);

    return files;
  }
}
