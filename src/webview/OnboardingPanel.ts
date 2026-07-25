import * as vscode from 'vscode';

export class OnboardingPanel {
  public static currentPanel: OnboardingPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): OnboardingPanel {
    const column = vscode.ViewColumn.One;

    if (OnboardingPanel.currentPanel) {
      OnboardingPanel.currentPanel.panel.reveal(column);
      return OnboardingPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'contextOptimizer.onboarding',
      '👋 Welcome to Context Optimizer',
      column,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
      }
    );

    OnboardingPanel.currentPanel = new OnboardingPanel(panel);
    return OnboardingPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage((message: { command: string }) => {
      if (message.command === 'generateFirstContext') {
        this.panel.dispose();
        vscode.commands.executeCommand('contextOptimizer.generateContext');
      }
    }, undefined, this.disposables);

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  public dispose(): void {
    OnboardingPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) x.dispose();
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 80vh;
    }
    .slide-card {
      max-width: 580px; width: 100%;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      border-radius: 12px; padding: 32px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      display: none; flex-direction: column; gap: 16px; align-items: center; text-align: center;
    }
    .slide-card.active { display: flex; }
    .icon-hero { font-size: 48px; margin-bottom: 8px; }
    h2 { margin: 0; font-size: 22px; color: var(--vscode-editor-foreground); }
    p { color: var(--vscode-descriptionForeground); font-size: 14px; line-height: 1.6; margin: 0; }
    .bullet-list { text-align: left; width: 100%; font-size: 13px; display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
    .bullet-item { display: flex; align-items: center; gap: 10px; }
    .nav-row { display: flex; justify-content: space-between; width: 100%; margin-top: 20px; align-items: center; }
    .dots { display: flex; gap: 8px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--vscode-descriptionForeground); opacity: 0.3; }
    .dot.active { opacity: 1; background: var(--vscode-button-background); }
    button {
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 6px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 13px;
    }
    button.secondary {
      background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.2));
    }
    button.primary-large {
      font-size: 16px; padding: 14px 28px; background: linear-gradient(135deg, #7c3aed, #3b82f6); color: #fff; margin-top: 12px;
    }
  </style>
</head>
<body>
  <!-- Slide 1 -->
  <div class="slide-card active" id="slide-1">
    <div class="icon-hero">💸</div>
    <h2>Stop Wasting Thousands of AI Tokens</h2>
    <p>Every time you open a new AI chat session or switch assistants (Claude, ChatGPT, Gemini, Copilot), you waste <b>38,000+ raw tokens</b> re-explaining your project from scratch.</p>
    <div class="nav-row">
      <div></div>
      <div class="dots"><div class="dot active"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
      <button onclick="nextSlide(2)">Next →</button>
    </div>
  </div>

  <!-- Slide 2 -->
  <div class="slide-card" id="slide-2">
    <div class="icon-hero">🧠</div>
    <h2>Automated AST & Code Structure Memory</h2>
    <p>Context Optimizer scans your project in milliseconds and builds a compact memory containing:</p>
    <div class="bullet-list">
      <div class="bullet-item">⚡ <b>AST Summaries:</b> Function signatures, param types, return types, Props</div>
      <div class="bullet-item">📦 <b>Dependencies & Tech Stack:</b> React, Node, Express, Mongoose, etc.</div>
      <div class="bullet-item">🌐 <b>API Routes & Env Vars:</b> Automatic detection without exposing secrets</div>
      <div class="bullet-item">🗄️ <b>Database Schemas:</b> Mongoose & Prisma model relationships</div>
    </div>
    <div class="nav-row">
      <button class="secondary" onclick="nextSlide(1)">← Back</button>
      <div class="dots"><div class="dot"></div><div class="dot active"></div><div class="dot"></div><div class="dot"></div></div>
      <button onclick="nextSlide(3)">Next →</button>
    </div>
  </div>

  <!-- Slide 3 -->
  <div class="slide-card" id="slide-3">
    <div class="icon-hero">🔮</div>
    <h2>Export Prompts & Interactive Visual Graphs</h2>
    <p>Export your compressed context in one click or inspect your project visually:</p>
    <div class="bullet-list">
      <div class="bullet-item">📤 <b>Prompt Exporter:</b> 2,100-token compressed onboarding prompt</div>
      <div class="bullet-item">🔮 <b>Interactive Force Graph:</b> Physics-based dependency visualizer</div>
      <div class="bullet-item">📊 <b>Mermaid Flowcharts:</b> Exportable diagram graphics</div>
      <div class="bullet-item">📜 <b>Decision Log:</b> Track session choices in your sidebar</div>
    </div>
    <div class="nav-row">
      <button class="secondary" onclick="nextSlide(2)">← Back</button>
      <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot active"></div><div class="dot"></div></div>
      <button onclick="nextSlide(4)">Next →</button>
    </div>
  </div>

  <!-- Slide 4 -->
  <div class="slide-card" id="slide-4">
    <div class="icon-hero">🚀</div>
    <h2>Ready to Optimize Your Context?</h2>
    <p>Click below to run your first project scan and compress your codebase memory instantly.</p>
    <button class="primary-large" onclick="generateFirstContext()">⚡ Generate My First Context</button>
    <div class="nav-row" style="margin-top:24px;">
      <button class="secondary" onclick="nextSlide(3)">← Back</button>
      <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot active"></div></div>
      <div></div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function nextSlide(num) {
      document.querySelectorAll('.slide-card').forEach(s => s.classList.remove('active'));
      document.getElementById('slide-' + num).classList.add('active');
    }

    function generateFirstContext() {
      vscode.postMessage({ command: 'generateFirstContext' });
    }
  </script>
</body>
</html>`;
  }
}
