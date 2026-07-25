import * as vscode from 'vscode';
import { MemoryManager, ConversationNote } from '../core/MemoryManager';

export class DecisionChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'contextOptimizer.decisionChat';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly memoryManager: MemoryManager
  ) {
    memoryManager.onDidChange(() => {
      this.updateView();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((message: { command: string; text?: string }) => {
      if (message.command === 'addEntry' && message.text) {
        this.handleAddEntry(message.text);
      }
    });

    this.updateView();
  }

  public classifyText(text: string): ConversationNote['type'] {
    const lower = text.toLowerCase();
    if (/\b(decided|chose|using|went with|adopted)\b/.test(lower)) return 'decision';
    if (/\b(done|completed|finished|shipped)\b/.test(lower)) return 'completed';
    if (/\b(todo|need to|should|next|planned)\b/.test(lower)) return 'todo';
    if (/\b(bug|broken|fixed|issue|crash)\b/.test(lower)) return 'bugfix';
    if (/\b(rejected|decided against|scrapped|dropped|canceled)\b/.test(lower)) return 'rejection';
    return 'note';
  }

  private handleAddEntry(rawText: string): void {
    const text = rawText.trim();
    if (!text) return;

    const type = this.classifyText(text);
    const mem = this.memoryManager.get();

    // Auto-promote features/bugs
    if (type === 'completed') {
      if (!mem.features.completed.includes(text)) {
        mem.features.completed.unshift(text);
      }
    } else if (type === 'todo') {
      if (!mem.features.pending.includes(text)) {
        mem.features.pending.unshift(text);
      }
    } else if (type === 'bugfix') {
      if (text.toLowerCase().includes('fixed') || text.toLowerCase().includes('resolve')) {
        mem.bugs = mem.bugs.filter(b => !text.toLowerCase().includes(b.toLowerCase()));
      } else if (!mem.bugs.includes(text)) {
        mem.bugs.push(text);
      }
    } else if (type === 'decision') {
      if (!mem.architecture.decisions.includes(text)) {
        mem.architecture.decisions.unshift(text);
      }
    }

    const note: ConversationNote = {
      date: new Date().toISOString(),
      type,
      content: text,
    };

    this.memoryManager.addNote(note);
    this.updateView();
  }

  private updateView(): void {
    if (!this._view) return;
    const mem = this.memoryManager.get();
    this._view.webview.postMessage({
      command: 'update',
      conversations: mem.conversations || [],
    });
  }

  private getHtml(): string {
    const mem = this.memoryManager.get();
    const conversationsJson = JSON.stringify(mem.conversations || []);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 12px);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      margin: 0; padding: 10px;
      display: flex; flex-direction: column; height: 95vh;
    }
    .header-title {
      font-weight: 700; text-transform: uppercase; font-size: 11px;
      letter-spacing: 0.5px; color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    .log-container {
      flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
      padding-right: 4px; margin-bottom: 10px;
    }
    .entry-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 6px; padding: 8px 10px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .entry-header {
      display: flex; justify-content: space-between; align-items: center;
    }
    .badge {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      padding: 2px 6px; border-radius: 4px; color: #fff;
    }
    .badge-decision { background: #8b5cf6; }
    .badge-completed { background: #10b981; }
    .badge-todo { background: #3b82f6; }
    .badge-bugfix { background: #ef4444; }
    .badge-rejection { background: #f59e0b; }
    .badge-note { background: #6b7280; }
    .time { font-size: 10px; color: var(--vscode-descriptionForeground); }
    .content { word-break: break-word; line-height: 1.4; }
    
    .input-container {
      display: flex; gap: 6px; border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      padding-top: 8px;
    }
    input[type="text"] {
      flex: 1; background: var(--vscode-input-background);
      color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px; padding: 6px 8px; outline: none; font-size: 12px;
    }
    input[type="text"]:focus {
      border-color: var(--vscode-focusBorder);
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; padding: 6px 12px;
      font-weight: 600; cursor: pointer; font-size: 11px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="header-title">📜 Decision & Action Log</div>
  <div class="log-container" id="log"></div>

  <div class="input-container">
    <input type="text" id="chat-input" placeholder="e.g. Decided to use Zustand, todo add tests..."/>
    <button id="send-btn">Log</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let history = ${conversationsJson};

    function formatDate(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    }

    function render() {
      const container = document.getElementById('log');
      if (!history || history.length === 0) {
        container.innerHTML = '<div style="color:var(--vscode-descriptionForeground);font-style:italic;padding:10px 0;">No entries logged yet. Type a decision or task below!</div>';
        return;
      }
      container.innerHTML = history.map(item => \`
        <div class="entry-card">
          <div class="entry-header">
            <span class="badge badge-\${item.type}">\${item.type}</span>
            <span class="time">\${formatDate(item.date)}</span>
          </div>
          <div class="content">\${escapeHtml(item.content)}</div>
        </div>
      \`).join('');
    }

    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    document.getElementById('send-btn').addEventListener('click', () => {
      const input = document.getElementById('chat-input');
      if (input.value.trim()) {
        vscode.postMessage({ command: 'addEntry', text: input.value.trim() });
        input.value = '';
      }
    });

    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('send-btn').click();
      }
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'update') {
        history = msg.conversations;
        render();
      }
    });

    render();
  </script>
</body>
</html>`;
  }
}
