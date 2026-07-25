import * as vscode from 'vscode';
import * as path from 'path';
import { MemoryManager, ProjectMemory, ApiEndpoint } from '../core/MemoryManager';

// ─── Tree Item Types ──────────────────────────────────────────────────────────

export type ContextItemType =
  | 'root'
  | 'section'
  | 'project'
  | 'stack'
  | 'feature-completed'
  | 'feature-pending'
  | 'feature-inprogress'
  | 'api-endpoint'
  | 'file'
  | 'token-stats'
  | 'bug'
  | 'rule'
  | 'note'
  | 'dependency'
  | 'env-var'
  | 'db-model'
  | 'architecture'
  | 'graph-link';

export class ContextItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: ContextItemType,
    public readonly value?: string,
    public readonly children?: ContextItem[]
  ) {
    super(label, collapsibleState);
    this.tooltip = value ?? label;
    this.contextValue = itemType;
    this.applyIcon();
    if (value && value !== label) {
      this.description = value;
    }
  }

  private applyIcon(): void {
    const icons: Partial<Record<ContextItemType, string>> = {
      project: '$(project)',
      stack: '$(layers)',
      'feature-completed': '$(check)',
      'feature-pending': '$(circle-outline)',
      'feature-inprogress': '$(sync~spin)',
      'api-endpoint': '$(globe)',
      file: '$(file-code)',
      'token-stats': '$(graph)',
      bug: '$(bug)',
      rule: '$(law)',
      note: '$(note)',
      dependency: '$(package)',
      'env-var': '$(key)',
      'db-model': '$(database)',
      architecture: '$(circuit-board)',
      section: '$(folder)',
      root: '$(root-folder)',
      'graph-link': '$(graph)',
    };

    const icon = icons[this.itemType];
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon.replace(/\$\(|\)/g, ''));
    }
  }
}

// ─── Summary Tree Provider ────────────────────────────────────────────────────

export class SummaryTreeProvider implements vscode.TreeDataProvider<ContextItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContextItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private memoryManager: MemoryManager) {
    memoryManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ContextItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ContextItem): ContextItem[] {
    if (!element) return this.getRootItems();
    return element.children ?? [];
  }

  private getRootItems(): ContextItem[] {
    const mem = this.memoryManager.get();
    return [
      this.buildProjectSection(mem),
      this.buildStackSection(mem),
      this.buildFeaturesSection(mem),
      this.buildArchitectureSection(mem),
      this.buildBugsSection(mem),
      this.buildRulesSection(mem),
      this.buildTokenStatsSection(mem),
    ].filter(Boolean) as ContextItem[];
  }

  private buildProjectSection(mem: ProjectMemory): ContextItem {
    const children: ContextItem[] = [
      new ContextItem('Name', vscode.TreeItemCollapsibleState.None, 'project', mem.project.name),
      new ContextItem('Version', vscode.TreeItemCollapsibleState.None, 'project', mem.project.version || 'N/A'),
      new ContextItem('Description', vscode.TreeItemCollapsibleState.None, 'project',
        mem.project.description || 'No description'),
      new ContextItem('Total Files', vscode.TreeItemCollapsibleState.None, 'project',
        `${mem.structure.analyzedFiles} analyzed / ${mem.structure.totalFiles} total`),
    ];

    if (mem.project.goals.length > 0) {
      children.push(...mem.project.goals.map((g: string) =>
        new ContextItem(`Goal: ${g}`, vscode.TreeItemCollapsibleState.None, 'note')
      ));
    }

    return new ContextItem(
      '🗂 Project',
      vscode.TreeItemCollapsibleState.Expanded,
      'section', undefined, children
    );
  }

  private buildStackSection(mem: ProjectMemory): ContextItem {
    const children: ContextItem[] = [];
    if (mem.stack.frontend) children.push(new ContextItem('Frontend', vscode.TreeItemCollapsibleState.None, 'stack', mem.stack.frontend));
    if (mem.stack.backend) children.push(new ContextItem('Backend', vscode.TreeItemCollapsibleState.None, 'stack', mem.stack.backend));
    if (mem.stack.database) children.push(new ContextItem('Database', vscode.TreeItemCollapsibleState.None, 'db-model', mem.stack.database));
    if (mem.stack.auth) children.push(new ContextItem('Auth', vscode.TreeItemCollapsibleState.None, 'stack', mem.stack.auth));
    if (mem.database.models.length > 0) {
      children.push(new ContextItem(`DB Models (${mem.database.models.length})`,
        vscode.TreeItemCollapsibleState.Collapsed, 'section', undefined,
        mem.database.models.map((m: string) => new ContextItem(m, vscode.TreeItemCollapsibleState.None, 'db-model'))
      ));
    }
    return new ContextItem('⚡ Stack', vscode.TreeItemCollapsibleState.Expanded, 'section', undefined, children);
  }

  private buildFeaturesSection(mem: ProjectMemory): ContextItem {
    const children: ContextItem[] = [];

    if (mem.features.completed.length > 0) {
      children.push(new ContextItem(
        `✅ Completed (${mem.features.completed.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'section', undefined,
        mem.features.completed.map((f: string) => new ContextItem(f, vscode.TreeItemCollapsibleState.None, 'feature-completed'))
      ));
    }
    if (mem.features.inProgress.length > 0) {
      children.push(new ContextItem(
        `🔄 In Progress (${mem.features.inProgress.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'section', undefined,
        mem.features.inProgress.map((f: string) => new ContextItem(f, vscode.TreeItemCollapsibleState.None, 'feature-inprogress'))
      ));
    }
    if (mem.features.pending.length > 0) {
      children.push(new ContextItem(
        `📋 Pending (${mem.features.pending.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'section', undefined,
        mem.features.pending.map((f: string) => new ContextItem(f, vscode.TreeItemCollapsibleState.None, 'feature-pending'))
      ));
    }

    return new ContextItem('🚀 Features', vscode.TreeItemCollapsibleState.Expanded, 'section', undefined, children);
  }

  private buildArchitectureSection(mem: ProjectMemory): ContextItem | null {
    const { summary, decisions, patterns } = mem.architecture;
    if (!summary && decisions.length === 0 && patterns.length === 0) return null;

    const children: ContextItem[] = [];
    if (summary) children.push(new ContextItem('Summary', vscode.TreeItemCollapsibleState.None, 'architecture', summary));
    if (patterns.length > 0) children.push(new ContextItem('Patterns', vscode.TreeItemCollapsibleState.None, 'architecture', patterns.join(', ')));
    if (decisions.length > 0) {
      children.push(new ContextItem(
        `Decisions (${decisions.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'section', undefined,
        decisions.map((d: string) => new ContextItem(d, vscode.TreeItemCollapsibleState.None, 'architecture'))
      ));
    }

    return new ContextItem('🏗 Architecture', vscode.TreeItemCollapsibleState.Collapsed, 'section', undefined, children);
  }

  private buildBugsSection(mem: ProjectMemory): ContextItem | null {
    if (mem.bugs.length === 0) return null;
    return new ContextItem(
      `🐛 Known Bugs (${mem.bugs.length})`,
      vscode.TreeItemCollapsibleState.Collapsed,
      'section', undefined,
      mem.bugs.map((b: string) => new ContextItem(b, vscode.TreeItemCollapsibleState.None, 'bug'))
    );
  }

  private buildRulesSection(mem: ProjectMemory): ContextItem | null {
    if (mem.rules.length === 0 && mem.developerNotes.length === 0) return null;
    const children: ContextItem[] = [
      ...mem.rules.map((r: string) => new ContextItem(r, vscode.TreeItemCollapsibleState.None, 'rule')),
      ...mem.developerNotes.slice(0, 10).map((n: string) => new ContextItem(n, vscode.TreeItemCollapsibleState.None, 'note')),
    ];
    return new ContextItem('📜 Rules & Notes', vscode.TreeItemCollapsibleState.Collapsed, 'section', undefined, children);
  }

  private buildTokenStatsSection(mem: ProjectMemory): ContextItem {
    const stats = mem.meta.tokenEstimate;
    const savedTokens = Math.max(0, stats.original - stats.compressed);
    const dollars = (savedTokens * 0.000003).toFixed(2);

    const children: ContextItem[] = [
      new ContextItem('Original', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${stats.original.toLocaleString()} tokens`),
      new ContextItem('Compressed', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${stats.compressed.toLocaleString()} tokens`),
      new ContextItem('Saved', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${stats.savedPercent}% reduction`),
      new ContextItem('Est. Cost Saved', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `~$${dollars}`),
      new ContextItem('Last Updated', vscode.TreeItemCollapsibleState.None, 'note',
        new Date(mem.meta.lastUpdated).toLocaleString()),
    ];
    return new ContextItem('📊 Token Savings', vscode.TreeItemCollapsibleState.Expanded, 'section', undefined, children);
  }
}

// ─── Files Tree Provider ──────────────────────────────────────────────────────

export class FilesTreeProvider implements vscode.TreeDataProvider<ContextItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContextItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private memoryManager: MemoryManager) {
    memoryManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ContextItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ContextItem): ContextItem[] {
    if (element) return element.children ?? [];
    return this.buildFileTree();
  }

  private buildFileTree(): ContextItem[] {
    const mem = this.memoryManager.get();
    const groups: Record<string, ContextItem[]> = {
      '🔴 Critical': [],
      '🟠 High Priority': [],
      '🟡 Medium Priority': [],
      '⚪ Low Priority': [],
    };

    for (const file of mem.files) {
      const item = new ContextItem(
        path.basename(file.path),
        vscode.TreeItemCollapsibleState.None,
        'file',
        file.summary?.slice(0, 80)
      );
      item.tooltip = `${file.path}\n\n${file.summary}`;
      item.command = {
        command: 'contextOptimizer.openFile',
        title: 'Open File',
        arguments: [file.path],
      };

      switch (file.priority) {
        case 'critical': groups['🔴 Critical'].push(item); break;
        case 'high': groups['🟠 High Priority'].push(item); break;
        case 'medium': groups['🟡 Medium Priority'].push(item); break;
        default: groups['⚪ Low Priority'].push(item); break;
      }
    }

    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, children]) =>
        new ContextItem(
          `${label} (${children.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'section', undefined, children
        )
      );
  }
}

// ─── Stats Tree Provider ──────────────────────────────────────────────────────

export class StatsTreeProvider implements vscode.TreeDataProvider<ContextItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContextItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private memoryManager: MemoryManager) {
    memoryManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ContextItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ContextItem): ContextItem[] {
    if (element) return element.children ?? [];
    return this.buildStats();
  }

  private buildStats(): ContextItem[] {
    const mem = this.memoryManager.get();
    const stats = mem.meta.tokenEstimate;

    const items: ContextItem[] = [
      new ContextItem('📥 Original Tokens', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${stats.original.toLocaleString()}`),
      new ContextItem('📤 Compressed Tokens', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${stats.compressed.toLocaleString()}`),
      new ContextItem('💰 Tokens Saved', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${(stats.original - stats.compressed).toLocaleString()}`),
      new ContextItem('📉 Compression Ratio', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${stats.savedPercent}%`),
      new ContextItem('📁 Files Analyzed', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${mem.structure.analyzedFiles} / ${mem.structure.totalFiles}`),
      new ContextItem('🔗 API Endpoints', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${mem.api.endpoints.length}`),
      new ContextItem('🏗 DB Models', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${mem.database.models.length}`),
      new ContextItem('✅ Features Done', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${mem.features.completed.length}`),
      new ContextItem('📋 Features Pending', vscode.TreeItemCollapsibleState.None, 'token-stats',
        `${mem.features.pending.length}`),
    ];

    // API endpoints section
    if (mem.api.endpoints.length > 0) {
      items.push(new ContextItem(
        `🌐 API Endpoints (${mem.api.endpoints.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'section', undefined,
        mem.api.endpoints.slice(0, 20).map((ep: ApiEndpoint) =>
          new ContextItem(`${ep.method} ${ep.path}`, vscode.TreeItemCollapsibleState.None, 'api-endpoint', ep.description)
        )
      ));
    }

    return items;
  }
}

// ─── Graphs Tree Provider ─────────────────────────────────────────────────────

export class GraphsTreeProvider implements vscode.TreeDataProvider<ContextItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContextItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private memoryManager: MemoryManager) {
    memoryManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ContextItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ContextItem): ContextItem[] {
    if (element) return [];

    const dashboardItem = new ContextItem('📈 View Dashboard', vscode.TreeItemCollapsibleState.None, 'graph-link');
    dashboardItem.command = {
      command: 'contextOptimizer.openDashboard',
      title: 'View Dashboard'
    };

    const interactiveItem = new ContextItem('🔮 Interactive Force Graph', vscode.TreeItemCollapsibleState.None, 'graph-link');
    interactiveItem.command = {
      command: 'contextOptimizer.openInteractiveGraph',
      title: 'Interactive Force Graph'
    };

    const flowchartItem = new ContextItem('📊 Hierarchical Flowchart Graph', vscode.TreeItemCollapsibleState.None, 'graph-link');
    flowchartItem.command = {
      command: 'contextOptimizer.openMermaidGraph',
      title: 'Hierarchical Flowchart Graph'
    };

    return [dashboardItem, interactiveItem, flowchartItem];
  }
}
