import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Context Optimizer');
  }
  return outputChannel;
}

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

export const logger = {
  info(message: string): void {
    getChannel().appendLine(`[${timestamp()}] ℹ️  ${message}`);
  },
  success(message: string): void {
    getChannel().appendLine(`[${timestamp()}] ✅ ${message}`);
  },
  warn(message: string): void {
    getChannel().appendLine(`[${timestamp()}] ⚠️  ${message}`);
  },
  error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : String(err ?? '');
    getChannel().appendLine(`[${timestamp()}] ❌ ${message}${detail ? `: ${detail}` : ''}`);
  },
  show(): void {
    getChannel().show();
  },
  dispose(): void {
    outputChannel?.dispose();
    outputChannel = undefined;
  },
};
