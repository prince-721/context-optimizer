import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../utils/logger';

export type GitCommitCallback = (commitMsg: string) => void;

/**
 * Watches .git/COMMIT_EDITMSG for new commits and fires a callback.
 * This is the most reliable way to detect git commits without running git CLI.
 */
export class GitWatcher {
  private watcher: vscode.FileSystemWatcher | null = null;
  private workspaceRoot: string;
  private callbacks: GitCommitCallback[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /** Start watching for git commits */
  start(): void {
    const commitMsgPattern = new vscode.RelativePattern(
      this.workspaceRoot,
      '.git/COMMIT_EDITMSG'
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(commitMsgPattern, true, false, true);

    this.watcher.onDidChange(async (uri) => {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const commitMsg = doc.getText().trim();
        logger.info(`Git commit detected: ${commitMsg.split('\n')[0]}`);
        for (const cb of this.callbacks) {
          cb(commitMsg);
        }
      } catch (err) {
        logger.warn('GitWatcher: Could not read commit message');
      }
    });

    logger.info('GitWatcher started');
  }

  /** Register a callback for commit events */
  onCommit(callback: GitCommitCallback): void {
    this.callbacks.push(callback);
  }

  /** Stop watching */
  stop(): void {
    this.watcher?.dispose();
    this.watcher = null;
    this.callbacks = [];
    logger.info('GitWatcher stopped');
  }

  dispose(): void {
    this.stop();
  }
}
