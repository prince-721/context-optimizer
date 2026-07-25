import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MemoryManager, ProjectMemory } from '../core/MemoryManager';
import { GraphExporter } from '../exporters/GraphExporter';

export class DashboardPanel {
  private static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static readonly viewType = 'contextOptimizer.dashboard';

  public static create(
    extensionUri: vscode.Uri,
    memoryManager: MemoryManager
  ): DashboardPanel {
    const column = vscode.ViewColumn.Two;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      DashboardPanel.currentPanel.update(memoryManager.get());
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      '🧠 Context Optimizer Dashboard',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, memoryManager);
    return DashboardPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private memoryManager: MemoryManager
  ) {
    this.panel = panel;

    // Initial render
    this.panel.webview.html = this.getHtml();

    // Listen to memory changes
    memoryManager.onDidChange(() => {
      this.update(memoryManager.get());
    });

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: { command: string; data?: unknown }) => {
        this.handleMessage(message);
      },
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  public async update(mem: ProjectMemory, force = false): Promise<void> {
    if (this.panel.visible || force) {
      try {
        const exporter = new GraphExporter(this.memoryManager);
        const mermaidCode = await exporter.getMermaidDiagram();
        this.panel.webview.postMessage({
          command: 'update',
          data: { mem, mermaidCode }
        });
      } catch (err) {
        console.error('Failed to generate mermaid diagram for dashboard update:', err);
        this.panel.webview.postMessage({
          command: 'update',
          data: { mem, mermaidCode: '' }
        });
      }
    }
  }

  private handleMessage(message: { command: string; data?: unknown }): void {
    switch (message.command) {
      case 'ready':
        this.update(this.memoryManager.get(), true);
        break;
      case 'generateContext':
        vscode.commands.executeCommand('contextOptimizer.generateContext');
        break;
      case 'generateAiArchitectureSummary':
        vscode.commands.executeCommand('contextOptimizer.generateAiArchitectureSummary');
        break;
      case 'updateContext':
        vscode.commands.executeCommand('contextOptimizer.updateContext');
        break;
      case 'exportPrompt':
        vscode.commands.executeCommand('contextOptimizer.exportPrompt');
        break;
      case 'addNote':
        vscode.commands.executeCommand('contextOptimizer.addNote');
        break;
      case 'addRule':
        vscode.commands.executeCommand('contextOptimizer.addRule');
        break;
      case 'openMemory':
        vscode.commands.executeCommand('contextOptimizer.openMemoryFile');
        break;
      case 'openInteractiveGraph':
        vscode.commands.executeCommand('contextOptimizer.openInteractiveGraph');
        break;
      case 'openMermaidGraph':
        vscode.commands.executeCommand('contextOptimizer.openMermaidGraph');
        break;
      case 'showError':
        vscode.window.showErrorMessage(String(message.data));
        break;
    }
  }

  private getHtml(): string {
    const nonce = this.getNonce();
    const cspSource = this.panel.webview.cspSource;
    const mermaidUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'mermaid.min.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline' 'unsafe-eval'; font-src ${cspSource} https:;"/>
  <title>Context Optimizer Dashboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --bg: #0d1117;
      --bg-card: #161b22;
      --bg-card2: #1c2333;
      --border: #30363d;
      --accent: #7c3aed;
      --accent2: #06b6d4;
      --accent3: #10b981;
      --accent4: #f59e0b;
      --danger: #ef4444;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --text-subtle: #6e7681;
      --radius: 12px;
      --radius-sm: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }

    /* ─── Layout ─── */
    .app {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 20px 48px;
    }

    /* ─── Header ─── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .header-icon {
      width: 48px; height: 48px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
      box-shadow: 0 0 24px rgba(124,58,237,0.4);
    }
    .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .header .subtitle { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

    /* ─── Buttons ─── */
    .btn {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      border: none;
      font-size: 13px; font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #6d28d9; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(124,58,237,0.4); }
    .btn-secondary { background: var(--bg-card2); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: #2d3748; border-color: var(--accent); transform: translateY(-1px); }
    .btn-success { background: var(--accent3); color: #fff; }
    .btn-success:hover { background: #059669; }

    /* ─── Cards ─── */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: var(--accent); }
    .card-title {
      font-size: 12px; font-weight: 600; letter-spacing: 0.8px;
      text-transform: uppercase; color: var(--text-muted);
      margin-bottom: 14px; display: flex; align-items: center; gap: 6px;
    }
    .card-value { font-size: 28px; font-weight: 700; }
    .card-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

    /* ─── Stats Grid ─── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }

    /* ─── Token Savings ─── */
    .token-card {
      background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.1));
      border: 1px solid rgba(124,58,237,0.4);
    }
    .token-bar {
      height: 8px;
      background: var(--bg-card2);
      border-radius: 99px;
      overflow: hidden;
      margin: 12px 0;
    }
    .token-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      border-radius: 99px;
      transition: width 1s cubic-bezier(0.4,0,0.2,1);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.85; }
    }
    .token-numbers {
      display: flex; justify-content: space-between;
      font-size: 12px; color: var(--text-muted);
    }
    .token-saved { color: var(--accent3); font-weight: 700; }

    /* ─── Two Column ─── */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 680px) { .two-col { grid-template-columns: 1fr; } }

    /* ─── Three Column ─── */
    .three-col {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 800px) { .three-col { grid-template-columns: 1fr; } }

    /* ─── Stack Badge ─── */
    .stack-grid {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px;
      border-radius: 99px;
      font-size: 11px; font-weight: 500;
      background: var(--bg-card2);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }
    .badge.accent { border-color: var(--accent); color: var(--accent); }
    .badge.cyan { border-color: var(--accent2); color: var(--accent2); }
    .badge.green { border-color: var(--accent3); color: var(--accent3); }
    .badge.yellow { border-color: var(--accent4); color: var(--accent4); }
    .badge.red { border-color: var(--danger); color: var(--danger); }

    /* ─── Feature List ─── */
    .feature-list { list-style: none; }
    .feature-list li {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 6px 0;
      font-size: 13px;
      border-bottom: 1px solid rgba(48,54,61,0.5);
    }
    .feature-list li:last-child { border-bottom: none; }
    .feature-icon { flex-shrink: 0; width: 18px; text-align: center; }
    .f-done { color: var(--accent3); }
    .f-wip { color: var(--accent4); }
    .f-todo { color: var(--text-muted); }

    /* ─── API List ─── */
    .api-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 0;
      font-size: 12px;
      border-bottom: 1px solid rgba(48,54,61,0.4);
      font-family: 'JetBrains Mono', monospace;
    }
    .api-item:last-child { border-bottom: none; }
    .method {
      font-size: 10px; font-weight: 700;
      padding: 2px 6px; border-radius: 4px;
      min-width: 44px; text-align: center;
    }
    .m-get { background: rgba(16,185,129,0.15); color: var(--accent3); border: 1px solid rgba(16,185,129,0.3); }
    .m-post { background: rgba(124,58,237,0.15); color: #a78bfa; border: 1px solid rgba(124,58,237,0.3); }
    .m-put { background: rgba(245,158,11,0.15); color: var(--accent4); border: 1px solid rgba(245,158,11,0.3); }
    .m-patch { background: rgba(6,182,212,0.15); color: var(--accent2); border: 1px solid rgba(6,182,212,0.3); }
    .m-delete { background: rgba(239,68,68,0.15); color: var(--danger); border: 1px solid rgba(239,68,68,0.3); }
    .api-path { color: var(--text); }
    .api-desc { color: var(--text-subtle); font-size: 11px; margin-left: auto; max-width: 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }

    /* ─── File List ─── */
    .file-item {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 6px 0;
      font-size: 12px;
      border-bottom: 1px solid rgba(48,54,61,0.4);
    }
    .file-item:last-child { border-bottom: none; }
    .file-path { font-family: 'JetBrains Mono', monospace; color: var(--accent2); flex-shrink: 0; }
    .file-summary { color: var(--text-muted); flex: 1; }
    .priority-dot {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 5px;
    }
    .p-critical { background: #ef4444; }
    .p-high { background: #f97316; }
    .p-medium { background: #eab308; }
    .p-low { background: #6b7280; }

    /* ─── Section Title ─── */
    .section-title {
      font-size: 15px; font-weight: 600;
      margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-row {
      margin-bottom: 24px;
    }

    /* ─── Bug / Rule list ─── */
    .plain-list { list-style: none; }
    .plain-list li {
      padding: 5px 0;
      font-size: 13px;
      border-bottom: 1px solid rgba(48,54,61,0.4);
      display: flex; align-items: flex-start; gap: 8px;
      color: var(--text-muted);
    }
    .plain-list li:last-child { border-bottom: none; }
    .plain-list li::before { content: '•'; color: var(--accent); flex-shrink: 0; }

    /* ─── Last Updated ─── */
    .meta-row {
      display: flex; align-items: center; justify-content: flex-end;
      gap: 12px;
      font-size: 11px; color: var(--text-subtle);
      padding-top: 16px; margin-top: 24px;
      border-top: 1px solid var(--border);
    }
    .meta-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent3); animation: blink 2s infinite; }
    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

    /* ─── Empty state ─── */
    .empty {
      text-align: center; padding: 32px;
      color: var(--text-muted); font-size: 13px;
    }
    .empty-icon { font-size: 32px; margin-bottom: 8px; }

    /* ─── Scrollable containers ─── */
    .scroll-container { max-height: 280px; overflow-y: auto; }
    .scroll-container::-webkit-scrollbar { width: 4px; }
    .scroll-container::-webkit-scrollbar-track { background: transparent; }
    .scroll-container::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  </style>
</head>
<body>
<div class="app" id="app">
  <!-- Content is dynamically rendered by JS -->
  <div class="empty">
    <div class="empty-icon">🧠</div>
    <div>Loading dashboard...</div>
  </div>
</div>

<script src="${mermaidUri}"></script>
<script>
  const vscode = acquireVsCodeApi();
  let currentMemory = null;
  let currentMermaidCode = "";

  document.addEventListener('click', event => {
    const target = event.target;
    const btn = target && typeof target.closest === 'function' ? target.closest('[data-cmd]') : null;
    if (btn) {
      const command = btn.getAttribute('data-cmd');
      if (command) {
        vscode.postMessage({ command });
      }
    }
  });

  function methodClass(method) {
    const m = method.toUpperCase();
    if (m === 'GET') return 'm-get';
    if (m === 'POST') return 'm-post';
    if (m === 'PUT') return 'm-put';
    if (m === 'PATCH') return 'm-patch';
    if (m === 'DELETE') return 'm-delete';
    return '';
  }

  function priorityDotClass(p) {
    if (p === 'critical') return 'p-critical';
    if (p === 'high') return 'p-high';
    if (p === 'medium') return 'p-medium';
    return 'p-low';
  }

  function formatNum(n) {
    if (!n) return '0';
    if (n >= 1000) return (n/1000).toFixed(1) + 'k';
    return n.toString();
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function render(mem, mermaidCode = "") {
    if (!mem) {
      document.getElementById('app').innerHTML = \`
        <div class="empty">
          <div class="empty-icon">🧠</div>
          <div>Loading dashboard...</div>
        </div>
      \`;
      return;
    }
    const stats = mem.meta?.tokenEstimate || {};
    const savedPct = stats.savedPercent || 0;
    const hasData = mem.project?.name;

    const html = \`
      <div class="header">
        <div class="header-left">
          <div class="header-icon">🧠</div>
          <div>
            <h1>\${esc(mem.project?.name || 'Context Optimizer')}</h1>
            <div class="subtitle">\${esc(mem.project?.description || 'AI Context Memory Dashboard')}</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" data-cmd="generateContext">⚡ Generate Context</button>
          <button class="btn btn-secondary" data-cmd="generateAiArchitectureSummary">🤖 AI Summary</button>
          <button class="btn btn-secondary" data-cmd="updateContext">🔄 Update Context</button>
          <button class="btn btn-success" data-cmd="exportPrompt">📤 Export Prompt</button>
          <button class="btn btn-secondary" data-cmd="addNote">📝 Add Note</button>
          <button class="btn btn-secondary" data-cmd="addRule">📜 Add Rule</button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="card">
          <div class="card-title">📁 Files Analyzed</div>
          <div class="card-value">\${mem.structure?.analyzedFiles || 0}</div>
          <div class="card-sub">of \${mem.structure?.totalFiles || 0} total</div>
        </div>
        <div class="card">
          <div class="card-title">🌐 API Endpoints</div>
          <div class="card-value">\${mem.api?.endpoints?.length || 0}</div>
          <div class="card-sub">\${mem.api?.baseUrl || 'Detected routes'}</div>
        </div>
        <div class="card">
          <div class="card-title">🏗 DB Models</div>
          <div class="card-value">\${mem.database?.models?.length || 0}</div>
          <div class="card-sub">\${esc(mem.database?.type || 'No DB detected')}</div>
        </div>
        <div class="card">
          <div class="card-title">✅ Features</div>
          <div class="card-value">\${mem.features?.completed?.length || 0}</div>
          <div class="card-sub">\${mem.features?.pending?.length || 0} pending</div>
        </div>
      </div>

      <!-- Token Savings -->
      <div class="card token-card section-row">
        <div class="card-title">📊 Token Savings</div>
        <div style="font-size:32px;font-weight:700;color:#7c3aed">\${savedPct}% <span style="font-size:16px;color:#8b949e">tokens saved</span></div>
        <div class="token-bar">
          <div class="token-bar-fill" id="tokenBar" style="width:\${Math.min(savedPct,100)}%"></div>
        </div>
        <div class="token-numbers">
          <span>Original: <strong>\${formatNum(stats.original)}</strong></span>
          <span>Compressed: <strong>\${formatNum(stats.compressed)}</strong></span>
          <span class="token-saved">Saved: \${formatNum((stats.original||0)-(stats.compressed||0))}</span>
        </div>
      </div>

      <!-- AI Architecture Summary -->
      \${mem.architecture?.summary ? \`
      <div class="card section-row" style="margin-bottom: 24px;">
        <div class="section-title">🏗 AI Architecture Overview</div>
        <div style="font-size: 13px; color: var(--text-muted); white-space: pre-wrap; line-height: 1.6;">\${esc(mem.architecture.summary)}</div>
      </div>
      \` : ''}

      <!-- Stack + Features -->
      <div class="two-col">
        <!-- Stack -->
        <div class="card">
          <div class="section-title">⚡ Tech Stack</div>
          \${mem.stack?.frontend ? \`<div style="margin-bottom:6px;font-size:12px;color:var(--text-muted)">Frontend</div><div class="stack-grid"><span class="badge accent">\${esc(mem.stack.frontend)}</span></div>\` : ''}
          \${mem.stack?.backend ? \`<div style="margin:10px 0 6px;font-size:12px;color:var(--text-muted)">Backend</div><div class="stack-grid"><span class="badge cyan">\${esc(mem.stack.backend)}</span></div>\` : ''}
          \${mem.stack?.database ? \`<div style="margin:10px 0 6px;font-size:12px;color:var(--text-muted)">Database</div><div class="stack-grid"><span class="badge green">\${esc(mem.stack.database)}</span></div>\` : ''}
          \${mem.stack?.auth ? \`<div style="margin:10px 0 6px;font-size:12px;color:var(--text-muted)">Auth</div><div class="stack-grid"><span class="badge yellow">\${esc(mem.stack.auth)}</span></div>\` : ''}
          \${mem.dependencies?.frameworks?.length > 0 ? \`
            <div style="margin:10px 0 6px;font-size:12px;color:var(--text-muted)">Frameworks</div>
            <div class="stack-grid">\${mem.dependencies.frameworks.slice(0,8).map(f => \`<span class="badge">\${esc(f)}</span>\`).join('')}</div>
          \` : ''}
          \${!mem.stack?.frontend && !mem.stack?.backend ? '<div class="empty"><div>Run Generate Context to detect stack</div></div>' : ''}
        </div>

        <!-- Features -->
        <div class="card">
          <div class="section-title">🚀 Features</div>
          \${mem.features?.completed?.length === 0 && mem.features?.pending?.length === 0
            ? '<div class="empty"><div class="empty-icon">📋</div><div>No features logged yet</div></div>'
            : \`
          <ul class="feature-list">
            \${(mem.features?.completed || []).slice(0,5).map(f => \`
              <li><span class="feature-icon f-done">✓</span><span>\${esc(f)}</span></li>
            \`).join('')}
            \${(mem.features?.inProgress || []).slice(0,3).map(f => \`
              <li><span class="feature-icon f-wip">⟳</span><span>\${esc(f)}</span></li>
            \`).join('')}
            \${(mem.features?.pending || []).slice(0,5).map(f => \`
              <li><span class="feature-icon f-todo">○</span><span style="color:var(--text-muted)">\${esc(f)}</span></li>
            \`).join('')}
          </ul>
          \`}
        </div>
      </div>

      <!-- API Endpoints + Key Files -->
      <div class="two-col">
        <!-- API -->
        <div class="card">
          <div class="section-title">🌐 API Endpoints</div>
          \${!mem.api?.endpoints?.length
            ? '<div class="empty"><div class="empty-icon">🔌</div><div>No endpoints detected</div></div>'
            : \`<div class="scroll-container">\${mem.api.endpoints.slice(0,20).map(ep => \`
              <div class="api-item">
                <span class="method \${methodClass(ep.method)}">\${esc(ep.method)}</span>
                <span class="api-path">\${esc(ep.path)}</span>
                \${ep.description ? \`<span class="api-desc">\${esc(ep.description)}</span>\` : ''}
              </div>
            \`).join('')}</div>\`}
        </div>

        <!-- Key Files -->
        <div class="card">
          <div class="section-title">📁 Key Files</div>
          \${!mem.files?.length
            ? '<div class="empty"><div class="empty-icon">📂</div><div>No files analyzed yet</div></div>'
            : \`<div class="scroll-container">\${mem.files.filter(f => f.priority === 'critical' || f.priority === 'high').slice(0,12).map(f => \`
              <div class="file-item">
                <div class="priority-dot \${priorityDotClass(f.priority)}"></div>
                <div>
                  <div class="file-path">\${esc(f.path)}</div>
                  <div class="file-summary">\${esc((f.summary||'').slice(0,80))}</div>
                </div>
              </div>
            \`).join('')}</div>\`}
        </div>
      </div>

      <!-- Bugs + Rules -->
      \${(mem.bugs?.length > 0 || mem.rules?.length > 0) ? \`
      <div class="two-col">
        \${mem.bugs?.length > 0 ? \`
        <div class="card">
          <div class="section-title">🐛 Known Bugs</div>
          <ul class="plain-list">
            \${mem.bugs.slice(0,8).map(b => \`<li>\${esc(b)}</li>\`).join('')}
          </ul>
        </div>\` : ''}
        \${mem.rules?.length > 0 ? \`
        <div class="card">
          <div class="section-title">📜 Project Rules</div>
          <ul class="plain-list">
            \${mem.rules.slice(0,8).map(r => \`<li>\${esc(r)}</li>\`).join('')}
          </ul>
        </div>\` : ''}
      </div>\` : ''}

      <!-- Visual Codebase Graph -->
      \${mermaidCode ? \`
      <div class="card section-row" style="margin-bottom: 24px;">
        <div class="section-title" style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 8px;">
          <span>🔮 Codebase Visual Graph</span>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-primary" data-cmd="openInteractiveGraph" style="padding: 4px 8px; font-size: 11px;">🔮 Interactive Graph (Fullscreen)</button>
            <button class="btn btn-primary" data-cmd="openMermaidGraph" style="padding: 4px 8px; font-size: 11px;">📊 Flowchart (Fullscreen)</button>
            <button class="btn btn-secondary" id="btn-zoom-in" style="padding: 4px 8px; font-size: 11px;">➕ Zoom In</button>
            <button class="btn btn-secondary" id="btn-zoom-out" style="padding: 4px 8px; font-size: 11px;">➖ Zoom Out</button>
            <button class="btn btn-secondary" id="btn-zoom-reset" style="padding: 4px 8px; font-size: 11px;">🔄 Reset Zoom</button>
            <button class="btn btn-secondary" id="btn-download-mermaid" style="padding: 4px 8px; font-size: 11px;">📥 Download Source</button>
            <button class="btn btn-secondary" id="btn-download-svg" style="padding: 4px 8px; font-size: 11px;">🖼️ Download SVG</button>
          </div>
        </div>
        <div class="scroll-container" id="mermaid-scroll-container" style="max-height: 600px; overflow: auto; background: #0b0e14; padding: 20px; border-radius: 8px; cursor: grab; user-select: none;">
          <div class="mermaid" id="mermaid-graph" style="transform-origin: top center; transition: transform 0.15s ease-in-out;">\${mermaidCode}</div>
        </div>
      </div>
      \` : ''}

      <!-- Footer -->
      <div class="meta-row">
        <div class="meta-dot"></div>
        <span>Live memory — updates automatically</span>
        <span>·</span>
        <span>Last updated: \${new Date(mem.meta?.lastUpdated || Date.now()).toLocaleString()}</span>
        <button class="btn btn-secondary" data-cmd="openMemory" style="padding:4px 10px;font-size:11px">📄 View memory.json</button>
      </div>
    \`;

    document.getElementById('app').innerHTML = html;

    if (mermaidCode && typeof mermaid !== 'undefined') {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          maxTextSize: 10000000,
          flowchart: { useMaxWidth: true, htmlLabels: true }
        });
      } catch (err) {
        console.error("Failed to initialize mermaid:", err);
      }

      const container = document.getElementById('mermaid-graph');
      if (container) {
        // Show temporary status to prevent visual locking
        container.innerHTML = '<div style="color:#94a3b8;padding:40px;text-align:center">Computing visual layout...</div>';
        
        setTimeout(() => {
          container.removeAttribute('data-processed');
          container.innerHTML = mermaidCode;
          try {
            if (typeof mermaid.run === 'function') {
              mermaid.run({ nodes: [container] });
            } else {
              mermaid.init(undefined, container);
            }
          } catch (err) {
            console.error("Mermaid render error:", err);
            container.innerHTML = '<div style="color:#f43f5e;padding:20px;font-family:monospace">⚠ Mermaid render error: ' + (err && err.message ? err.message : String(err)) + '</div>';
          }
        }, 50);
      }

      // Attach zoom & download event listeners
      let mermaidScale = 1.0;
      const updateScale = () => {
        const svgEl = document.querySelector('#mermaid-graph svg');
        if (svgEl) {
          svgEl.style.transform = 'scale(' + mermaidScale + ')';
          svgEl.style.transformOrigin = 'top center';
          svgEl.style.transition = 'transform 0.15s ease-in-out';
        }
      };

      // Click-and-drag panning & wheel zoom logic
      const scrollEl = document.getElementById('mermaid-scroll-container');
      if (scrollEl) {
        let isDown = false;
        let startX, startY;
        let scrollLeft, scrollTop;

        scrollEl.addEventListener('mousedown', (e) => {
          // Only trigger drag scroll on left click
          if (e.button !== 0) return;
          isDown = true;
          scrollEl.style.cursor = 'grabbing';
          startX = e.pageX - scrollEl.offsetLeft;
          startY = e.pageY - scrollEl.offsetTop;
          scrollLeft = scrollEl.scrollLeft;
          scrollTop = scrollEl.scrollTop;
        });

        scrollEl.addEventListener('mouseleave', () => {
          isDown = false;
          scrollEl.style.cursor = 'grab';
        });

        scrollEl.addEventListener('mouseup', () => {
          isDown = false;
          scrollEl.style.cursor = 'grab';
        });

        scrollEl.addEventListener('mousemove', (e) => {
          if (!isDown) return;
          e.preventDefault();
          const x = e.pageX - scrollEl.offsetLeft;
          const y = e.pageY - scrollEl.offsetTop;
          const walkX = (x - startX) * 1.5;
          const walkY = (y - startY) * 1.5;
          scrollEl.scrollLeft = scrollLeft - walkX;
          scrollEl.scrollTop = scrollTop - walkY;
        });

        // Ctrl + Mouse Wheel to zoom
        scrollEl.addEventListener('wheel', (e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
              mermaidScale = Math.min(3.0, mermaidScale + 0.15);
            } else {
              mermaidScale = Math.max(0.2, mermaidScale - 0.15);
            }
            updateScale();
          }
        }, { passive: false });
      }

      const btnZoomIn = document.getElementById('btn-zoom-in');
      if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
          mermaidScale = Math.min(3.0, mermaidScale + 0.15);
          updateScale();
        });
      }

      const btnZoomOut = document.getElementById('btn-zoom-out');
      if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
          mermaidScale = Math.max(0.2, mermaidScale - 0.15);
          updateScale();
        });
      }

      const btnZoomReset = document.getElementById('btn-zoom-reset');
      if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => {
          mermaidScale = 1.0;
          updateScale();
        });
      }

      const btnDownloadMermaid = document.getElementById('btn-download-mermaid');
      if (btnDownloadMermaid) {
        btnDownloadMermaid.addEventListener('click', () => {
          const blob = new Blob([mermaidCode], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'codebase_graph.mermaid';
          a.click();
          URL.revokeObjectURL(url);
        });
      }

      const btnDownloadSvg = document.getElementById('btn-download-svg');
      if (btnDownloadSvg) {
        btnDownloadSvg.addEventListener('click', () => {
          const svgEl = document.querySelector('#mermaid-graph svg');
          if (svgEl) {
            const serializer = new XMLSerializer();
            let source = serializer.serializeToString(svgEl);
            if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
              source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'codebase_graph.svg';
            a.click();
            URL.revokeObjectURL(url);
          } else {
            vscode.postMessage({ command: 'showError', data: 'Rendered SVG not found yet. Please wait for graph rendering.' });
          }
        });
      }
    }
  }

  // Initial render
  render(currentMemory, currentMermaidCode);

  // Listen for updates from extension
  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'update') {
      currentMemory = msg.data.mem;
      currentMermaidCode = msg.data.mermaidCode;
      render(currentMemory, currentMermaidCode);
    }
  });

  // Signal that we are ready to receive the state
  vscode.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
