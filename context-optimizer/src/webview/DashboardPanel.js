"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardPanel = void 0;
// src/webview/DashboardPanel.ts
const vscode = __importStar(require("vscode"));
const tokenizer_1 = require("../utils/tokenizer");
class DashboardPanel {
    static currentPanel;
    panel;
    disposables = [];
    static createOrShow(context, memory) {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            DashboardPanel.currentPanel.update(memory);
            return;
        }
        const panel = vscode.window.createWebviewPanel('contextOptimizerDashboard', 'Context Optimizer Dashboard', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        DashboardPanel.currentPanel = new DashboardPanel(panel, memory);
    }
    constructor(panel, memory) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml(memory);
        this.panel.onDidDispose(() => {
            DashboardPanel.currentPanel = undefined;
            this.disposables.forEach(d => d.dispose());
        }, null, this.disposables);
        this.panel.webview.onDidReceiveMessage(msg => {
            if (msg.command) {
                vscode.commands.executeCommand(`contextOptimizer.${msg.command}`);
            }
        }, null, this.disposables);
    }
    update(memory) {
        this.panel.webview.html = this.getHtml(memory);
    }
    getHtml(m) {
        const saved = m.tokenStats.savedPercent;
        const progressColor = saved >= 80 ? '#4ade80' : saved >= 50 ? '#facc15' : '#f87171';
        const completedItems = m.completedFeatures.map(f => `<div class="feature-item done"><span class="badge done">✓</span>${f.name}</div>`).join('');
        const pendingItems = m.pendingFeatures.map(f => `<div class="feature-item pending"><span class="badge pending">○</span>${f.name}</div>`).join('');
        const bugItems = m.knownBugs.map(b => `<div class="bug-item ${b.severity}"><span class="sev">[${b.severity}]</span> ${b.description}</div>`).join('');
        const recentChanges = m.gitHistory.slice(-5).reverse().map(g => `<div class="change-item"><code>${g.hash}</code> ${g.message}</div>`).join('');
        const apiList = m.apiEndpoints.slice(0, 10).map(ep => `<span class="endpoint"><span class="method ${ep.method.toLowerCase()}">${ep.method}</span> ${ep.path}</span>`).join('');
        const archItems = m.conversationLog.filter(e => e.type === 'architecture' || e.type === 'decision')
            .slice(-5).map(e => `<div class="arch-item"><span class="badge arch">${e.type}</span> ${e.content}</div>`).join('');
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Context Optimizer</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface2: #21262d;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --purple: #bc8cff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; padding: 0; }
  .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .header h1 .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
  .project-name { font-size: 13px; color: var(--muted); }
  .toolbar { display: flex; gap: 8px; }
  .btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.15s; }
  .btn:hover { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.primary:hover { background: #1f6feb; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; padding: 20px 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
  .card-title .icon { font-size: 14px; }
  .meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; }
  .meta-label { color: var(--muted); font-size: 12px; }
  .meta-value { font-size: 12px; font-weight: 500; }
  .token-ring { display: flex; align-items: center; gap: 16px; }
  .token-circle { width: 80px; height: 80px; border-radius: 50%; background: conic-gradient(${progressColor} 0% ${saved}%, var(--surface2) ${saved}% 100%); display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0; }
  .token-inner { width: 60px; height: 60px; border-radius: 50%; background: var(--surface); display: flex; align-items: center; justify-content: center; flex-direction: column; }
  .token-pct { font-size: 16px; font-weight: 700; color: ${progressColor}; }
  .token-label { font-size: 9px; color: var(--muted); }
  .token-stats { display: flex; flex-direction: column; gap: 4px; }
  .token-stat { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
  .token-stat .tk-label { color: var(--muted); }
  .token-stat .tk-value { font-weight: 600; font-variant-numeric: tabular-nums; }
  .feature-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
  .feature-item { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 4px 0; }
  .badge { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700; flex-shrink: 0; }
  .badge.done { background: rgba(63,185,80,0.2); color: var(--green); }
  .badge.pending { background: rgba(88,166,255,0.15); color: var(--accent); }
  .badge.arch { background: rgba(188,140,255,0.2); color: var(--purple); padding: 2px 6px; border-radius: 4px; width: auto; height: auto; }
  .endpoint { display: inline-flex; align-items: center; gap: 4px; background: var(--surface2); border: 1px solid var(--border); padding: 3px 8px; border-radius: 4px; font-size: 11px; margin: 2px; }
  .method { font-weight: 700; font-size: 10px; padding: 1px 4px; border-radius: 3px; }
  .method.get { color: #3fb950; }
  .method.post { color: #58a6ff; }
  .method.put { color: #d29922; }
  .method.patch { color: #bc8cff; }
  .method.delete { color: #f85149; }
  .bug-item { font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--border); display: flex; gap: 6px; align-items: flex-start; }
  .bug-item:last-child { border-bottom: none; }
  .sev { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
  .bug-item.high .sev { background: rgba(248,81,73,0.2); color: var(--red); }
  .bug-item.medium .sev { background: rgba(210,153,34,0.2); color: var(--yellow); }
  .bug-item.low .sev { background: rgba(88,166,255,0.15); color: var(--accent); }
  .change-item { font-size: 12px; padding: 4px 0; color: var(--muted); }
  .change-item code { font-size: 11px; background: var(--surface2); padding: 1px 4px; border-radius: 3px; color: var(--accent); }
  .arch-item { font-size: 12px; padding: 4px 0; display: flex; gap: 6px; align-items: flex-start; }
  .empty { color: var(--muted); font-size: 12px; font-style: italic; }
  .apis-wrap { display: flex; flex-wrap: wrap; gap: 2px; }
  .last-updated { font-size: 11px; color: var(--muted); padding: 0 24px 16px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1><span class="dot"></span> Context Optimizer</h1>
    <div class="project-name">${m.projectName || 'No project'} · ${m.framework || '?'} · ${m.language || '?'}</div>
  </div>
  <div class="toolbar">
    <button class="btn" onclick="send('generateContext')">⚡ Generate</button>
    <button class="btn" onclick="send('updateContext')">🔄 Update</button>
    <button class="btn primary" onclick="send('exportPrompt')">📤 Export</button>
    <button class="btn" onclick="send('generateReadme')">📝 README</button>
  </div>
</div>

<div class="grid">
  <!-- Overview -->
  <div class="card">
    <div class="card-title"><span class="icon">📋</span> Project Summary</div>
    <div class="meta-grid">
      <span class="meta-label">Name</span><span class="meta-value">${m.projectName || '—'}</span>
      <span class="meta-label">Framework</span><span class="meta-value">${m.framework || '—'}</span>
      <span class="meta-label">Language</span><span class="meta-value">${m.language || '—'}</span>
      <span class="meta-label">Database</span><span class="meta-value">${m.database.type || '—'}${m.database.orm ? ` (${m.database.orm})` : ''}</span>
      <span class="meta-label">Style</span><span class="meta-value">${m.codingStyle.components || '—'}</span>
      <span class="meta-label">Async</span><span class="meta-value">${m.codingStyle.asyncStyle || '—'}</span>
      ${m.codingStyle.stateManagement ? `<span class="meta-label">State</span><span class="meta-value">${m.codingStyle.stateManagement}</span>` : ''}
      <span class="meta-label">Files</span><span class="meta-value">${Object.keys(m.fileIndex).length} indexed</span>
    </div>
  </div>

  <!-- Token savings -->
  <div class="card">
    <div class="card-title"><span class="icon">⚡</span> Token Savings</div>
    <div class="token-ring">
      <div class="token-circle">
        <div class="token-inner">
          <div class="token-pct">${saved}%</div>
          <div class="token-label">saved</div>
        </div>
      </div>
      <div class="token-stats">
        <div class="token-stat"><span class="tk-label">Original</span><span class="tk-value">${(0, tokenizer_1.formatTokenCount)(m.tokenStats.original)}</span></div>
        <div class="token-stat"><span class="tk-label">Compressed</span><span class="tk-value">${(0, tokenizer_1.formatTokenCount)(m.tokenStats.compressed)}</span></div>
        <div class="token-stat"><span class="tk-label">Eliminated</span><span class="tk-value" style="color:${progressColor}">${(0, tokenizer_1.formatTokenCount)(m.tokenStats.original - m.tokenStats.compressed)}</span></div>
      </div>
    </div>
  </div>

  <!-- Completed features -->
  <div class="card">
    <div class="card-title"><span class="icon">✅</span> Completed Features</div>
    <div class="feature-list">
      ${completedItems || '<div class="empty">No completed features logged yet</div>'}
    </div>
  </div>

  <!-- Pending features -->
  <div class="card">
    <div class="card-title"><span class="icon">🔲</span> Pending Tasks</div>
    <div class="feature-list">
      ${pendingItems || '<div class="empty">No pending tasks logged</div>'}
    </div>
  </div>

  <!-- API Endpoints -->
  <div class="card">
    <div class="card-title"><span class="icon">🔌</span> API Endpoints (${m.apiEndpoints.length})</div>
    <div class="apis-wrap">
      ${apiList || '<div class="empty">No endpoints detected</div>'}
      ${m.apiEndpoints.length > 10 ? `<span class="endpoint" style="color:var(--muted)">+${m.apiEndpoints.length - 10} more</span>` : ''}
    </div>
  </div>

  <!-- Architecture -->
  <div class="card">
    <div class="card-title"><span class="icon">🏗</span> Architecture</div>
    <div class="feature-list">
      ${archItems || '<div class="empty">No architecture decisions logged</div>'}
    </div>
  </div>

  <!-- Known Bugs -->
  ${m.knownBugs.length > 0 ? `
  <div class="card">
    <div class="card-title"><span class="icon">🐛</span> Known Bugs</div>
    <div>${bugItems}</div>
  </div>` : ''}

  <!-- Recent Changes -->
  ${m.gitHistory.length > 0 ? `
  <div class="card">
    <div class="card-title"><span class="icon">🔀</span> Recent Changes</div>
    <div>${recentChanges}</div>
  </div>` : ''}
</div>

<div class="last-updated">Last updated: ${new Date(m.lastUpdated).toLocaleString()}</div>

<script>
  const vscode = acquireVsCodeApi();
  function send(command) { vscode.postMessage({ command }); }
</script>
</body>
</html>`;
    }
}
exports.DashboardPanel = DashboardPanel;
//# sourceMappingURL=DashboardPanel.js.map