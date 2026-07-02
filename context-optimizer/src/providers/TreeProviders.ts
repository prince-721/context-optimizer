// src/providers/TreeProviders.ts
import * as vscode from 'vscode';
import { ProjectMemory } from '../types';
import { formatTokenCount } from '../utils/tokenizer';

class TreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    description?: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    iconPath?: vscode.ThemeIcon,
    tooltip?: string,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.iconPath = iconPath;
    this.tooltip = tooltip;
    this.command = command;
  }
}

// ─── Summary Provider ─────────────────────────────────────────────────────────
export class SummaryProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private memory: ProjectMemory | null = null;

  refresh(memory: ProjectMemory) {
    this.memory = memory;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem { return element; }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!this.memory) return [new TreeItem('Run "Generate Context" to start', '', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('info'))];
    if (element) return [];

    const m = this.memory;
    return [
      new TreeItem(m.projectName || 'Unnamed Project', 'name', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('project')),
      new TreeItem(m.framework || 'Unknown', 'framework', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('symbol-namespace')),
      new TreeItem(m.language || 'Unknown', 'language', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('symbol-variable')),
      new TreeItem(m.database.type || 'Unknown', 'database', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('database')),
      new TreeItem(m.codingStyle.components || 'Unknown', 'components', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('symbol-class')),
      new TreeItem(new Date(m.lastUpdated).toLocaleString(), 'last updated', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('clock')),
    ];
  }
}

// ─── Features Provider ────────────────────────────────────────────────────────
export class FeaturesProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private memory: ProjectMemory | null = null;

  refresh(memory: ProjectMemory) {
    this.memory = memory;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(e: TreeItem): vscode.TreeItem { return e; }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!this.memory) return [];
    const m = this.memory;

    if (!element) {
      return [
        new TreeItem(`Completed (${m.completedFeatures.length})`, '', vscode.TreeItemCollapsibleState.Expanded, new vscode.ThemeIcon('pass')),
        new TreeItem(`Pending (${m.pendingFeatures.length})`, '', vscode.TreeItemCollapsibleState.Expanded, new vscode.ThemeIcon('circle-large-outline')),
        new TreeItem(`Bugs (${m.knownBugs.length})`, '', vscode.TreeItemCollapsibleState.Collapsed, new vscode.ThemeIcon('bug')),
      ];
    }

    if (element.label?.toString().startsWith('Completed')) {
      return m.completedFeatures.map(f => new TreeItem(f.name, f.description, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('check')));
    }
    if (element.label?.toString().startsWith('Pending')) {
      return m.pendingFeatures.map(f => new TreeItem(f.name, f.description, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('circle-large-outline')));
    }
    if (element.label?.toString().startsWith('Bugs')) {
      return m.knownBugs.map(b => new TreeItem(b.description, b.severity, vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon(b.severity === 'high' ? 'error' : 'warning')));
    }
    return [];
  }
}

// ─── Files Provider ───────────────────────────────────────────────────────────
export class FilesProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private memory: ProjectMemory | null = null;

  refresh(memory: ProjectMemory) {
    this.memory = memory;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(e: TreeItem): vscode.TreeItem { return e; }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!this.memory) return [];
    const m = this.memory;

    if (!element) {
      const high = Object.values(m.fileIndex).filter(f => f.priority === 'high');
      const med = Object.values(m.fileIndex).filter(f => f.priority === 'medium');
      return [
        new TreeItem(`High Priority (${high.length})`, '', vscode.TreeItemCollapsibleState.Expanded, new vscode.ThemeIcon('star-full')),
        new TreeItem(`Medium Priority (${med.length})`, '', vscode.TreeItemCollapsibleState.Collapsed, new vscode.ThemeIcon('star-half')),
      ];
    }

    const priority = element.label?.toString().startsWith('High') ? 'high' : 'medium';
    return Object.values(m.fileIndex)
      .filter(f => f.priority === priority)
      .slice(0, 30)
      .map(f => new TreeItem(f.path, '', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('file-code'), f.summary));
  }
}

// ─── Tokens Provider ──────────────────────────────────────────────────────────
export class TokensProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private memory: ProjectMemory | null = null;

  refresh(memory: ProjectMemory) {
    this.memory = memory;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(e: TreeItem): vscode.TreeItem { return e; }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!this.memory) return [];
    const { tokenStats } = this.memory;

    if (!element) {
      return [
        new TreeItem(formatTokenCount(tokenStats.original), 'original tokens', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('symbol-numeric')),
        new TreeItem(formatTokenCount(tokenStats.compressed), 'compressed tokens', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('arrow-down')),
        new TreeItem(`${tokenStats.savedPercent}%`, 'tokens saved', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('sparkle')),
        new TreeItem(`${formatTokenCount(tokenStats.original - tokenStats.compressed)}`, 'tokens eliminated', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('trash')),
      ];
    }
    return [];
  }
}
