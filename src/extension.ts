import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Core
import { MemoryManager } from './core/MemoryManager';
import { ProjectScanner } from './core/ProjectScanner';
import { FileAnalyzer } from './core/FileAnalyzer';
import { ContextCompressor } from './core/ContextCompressor';
import { TokenCounter } from './core/TokenCounter';
import { GitWatcher } from './core/GitWatcher';
import { IncrementalUpdater } from './core/IncrementalUpdater';

// Analyzers
import { DependencyAnalyzer } from './analyzers/DependencyAnalyzer';
import { ApiDetector } from './analyzers/ApiDetector';
import { EnvAnalyzer } from './analyzers/EnvAnalyzer';
import { SchemaAnalyzer } from './analyzers/SchemaAnalyzer';
import { DuplicateDetector } from './analyzers/DuplicateDetector';
import { ReadmeGenerator } from './analyzers/ReadmeGenerator';

// Providers
import { SummaryTreeProvider, FilesTreeProvider, StatsTreeProvider } from './providers/ContextTreeProvider';
import { DashboardPanel } from './providers/DashboardPanel';

// Exporters
import { MarkdownExporter } from './exporters/MarkdownExporter';
import { JsonExporter } from './exporters/JsonExporter';
import { PromptExporter } from './exporters/PromptExporter';
import { GraphExporter } from './exporters/GraphExporter';

// Utils
import { logger } from './utils/logger';
import { getWorkspaceRoot, ensureDir } from './utils/fileUtils';
import { callGroqChatCompletion } from './utils/groqClient';

// ─── Extension State ──────────────────────────────────────────────────────────

let memoryManager: MemoryManager | undefined;
let scanner: ProjectScanner | undefined;
let analyzer: FileAnalyzer | undefined;
let compressor: ContextCompressor | undefined;
let tokenCounter: TokenCounter | undefined;
let gitWatcher: GitWatcher | undefined;
let updater: IncrementalUpdater | undefined;

let summaryProvider: SummaryTreeProvider | undefined;
let filesProvider: FilesTreeProvider | undefined;
let statsProvider: StatsTreeProvider | undefined;

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  logger.info('Context Optimizer activating...');

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    logger.warn('No workspace folder open. Context Optimizer requires an open folder.');
    return;
  }

  // ─── Initialize core services ─────────────────────────────────────────────

  const config = vscode.workspace.getConfiguration('contextOptimizer');
  const ignorePatterns = config.get<string[]>('ignorePatterns') ?? [];

  memoryManager = new MemoryManager(workspaceRoot);
  scanner = new ProjectScanner(workspaceRoot, ignorePatterns);
  analyzer = new FileAnalyzer();
  compressor = new ContextCompressor();
  tokenCounter = new TokenCounter();
  gitWatcher = new GitWatcher(workspaceRoot);
  updater = new IncrementalUpdater(memoryManager, scanner, analyzer);

  // Load existing memory
  memoryManager.load();

  // ─── Register Tree Views ───────────────────────────────────────────────────

  summaryProvider = new SummaryTreeProvider(memoryManager);
  filesProvider = new FilesTreeProvider(memoryManager);
  statsProvider = new StatsTreeProvider(memoryManager);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('contextOptimizer.summaryView', summaryProvider),
    vscode.window.registerTreeDataProvider('contextOptimizer.filesView', filesProvider),
    vscode.window.registerTreeDataProvider('contextOptimizer.statsView', statsProvider),
  );

  // ─── Register Commands ─────────────────────────────────────────────────────

  context.subscriptions.push(

    // 1. Generate Context — full analysis from scratch
    vscode.commands.registerCommand('contextOptimizer.generateContext', async () => {
      await runWithProgress('Generating Project Context...', async (progress) => {
        try {
          progress.report({ message: 'Scanning workspace...', increment: 5 });

          // Run all analyzers in parallel
          const [depResult, apiEndpoints, envVars, schemaResult] = await Promise.all([
            new DependencyAnalyzer(workspaceRoot).analyze(),
            new ApiDetector(workspaceRoot).detect(),
            new EnvAnalyzer(workspaceRoot).analyze(),
            new SchemaAnalyzer(workspaceRoot).analyze(),
          ]);

          progress.report({ message: 'Analyzing files...', increment: 20 });

          // Merge dependency analysis
          const mem = memoryManager!.get();
          if (depResult.project?.name) mem.project.name = depResult.project.name;
          if (depResult.project?.version) mem.project.version = depResult.project.version;
          if (depResult.project?.description) mem.project.description = depResult.project.description;
          if (depResult.stack) Object.assign(mem.stack, depResult.stack);
          if (depResult.dependencies) Object.assign(mem.dependencies, depResult.dependencies);

          // Merge API, env, schema
          mem.api.endpoints = apiEndpoints;
          mem.environment.variables = envVars;
          mem.database.type = schemaResult.type;
          mem.database.models = schemaResult.models;
          mem.database.schemas = schemaResult.schemas;

          progress.report({ message: 'Running incremental file analysis...', increment: 20 });

          // Run incremental file analysis
          const updateResult = await updater!.update((current, total, fileName) => {
            progress.report({
              message: `Analyzing ${fileName} (${current}/${total})`,
              increment: Math.floor(40 / total),
            });
          });

          progress.report({ message: 'Computing token savings...', increment: 10 });

          // Compute token stats
          const allFileContent = mem.files.map(f => f.summary).join('\n');
          const compressedPrompt = compressor!.generateMinimizedPrompt(mem);
          const stats = tokenCounter!.compare(allFileContent, compressedPrompt);

          mem.meta.tokenEstimate = {
            original: stats.originalTokens,
            compressed: stats.compressedTokens,
            savedPercent: stats.savedPercent,
          };

          // Automatically run AI Project overview generation if enabled
          const useAi = config.get<boolean>('useAiSummarization') ?? true;
          if (useAi) {
            try {
              progress.report({ message: 'Generating AI project overview...', increment: 5 });
              await generateAiArchitectureSummaryHelper();
            } catch (aiErr) {
              logger.warn(`AI architecture summary skipped: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`);
            }
          }

          memoryManager!.save();

          progress.report({ message: 'Done!', increment: 5 });

          const msg = `✅ Context generated!\n+${updateResult.added} new, ~${updateResult.updated} updated files\nTokens saved: ${stats.savedPercent}%`;
          vscode.window.showInformationMessage(msg, 'Open Dashboard', 'Export Prompt')
            .then(action => {
              if (action === 'Open Dashboard') vscode.commands.executeCommand('contextOptimizer.openDashboard');
              if (action === 'Export Prompt') vscode.commands.executeCommand('contextOptimizer.exportPrompt');
            });

        } catch (err) {
          logger.error('Generate Context failed', err);
          vscode.window.showErrorMessage(`Context Optimizer: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }),

    // 2. Update Context — incremental only
    vscode.commands.registerCommand('contextOptimizer.updateContext', async () => {
      await runWithProgress('Updating Context (incremental)...', async (progress) => {
        try {
          progress.report({ message: 'Checking for changes...', increment: 10 });
          const result = await updater!.update((current, total, fileName) => {
            progress.report({ message: `${fileName} (${current}/${total})`, increment: 0 });
          });
          progress.report({ message: 'Computing token savings...', increment: 20 });
          const mem = memoryManager!.get();
          const allContent = mem.files.map(f => f.summary).join('\n');
          const prompt = compressor!.generateMinimizedPrompt(mem);
          const stats = tokenCounter!.compare(allContent, prompt);
          mem.meta.tokenEstimate = { original: stats.originalTokens, compressed: stats.compressedTokens, savedPercent: stats.savedPercent };
          memoryManager!.save();
          vscode.window.showInformationMessage(
            `Context updated: +${result.added} added, ~${result.updated} changed, =${result.unchanged} unchanged`
          );
        } catch (err) {
          logger.error('Update Context failed', err);
          vscode.window.showErrorMessage(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }),

    // 3. Export Prompt — all 4 formats
    vscode.commands.registerCommand('contextOptimizer.exportPrompt', async () => {
      const mem = memoryManager!.get();
      if (mem.files.length === 0 && !mem.project.name) {
        const run = await vscode.window.showWarningMessage(
          'No context generated yet. Generate context first?', 'Yes', 'No'
        );
        if (run === 'Yes') await vscode.commands.executeCommand('contextOptimizer.generateContext');
        return;
      }

      try {
        const mkExporter = new MarkdownExporter(memoryManager!, compressor!);
        const jsonExporter = new JsonExporter(memoryManager!);
        const promptExporter = new PromptExporter(memoryManager!, compressor!);

        const mdPath = mkExporter.export();
        const jsonPath = jsonExporter.exportFull();
        const minJsonPath = jsonExporter.exportMinified();
        const promptPath = promptExporter.exportFull();
        promptExporter.exportMinimized();

        logger.success(`Exported: ${mdPath}, ${jsonPath}, ${minJsonPath}, ${promptPath}`);

        const action = await vscode.window.showInformationMessage(
          `✅ Exported 4 files to ${path.relative(workspaceRoot, path.dirname(promptPath))}`,
          'Open Prompt', 'Copy to Clipboard', 'Open Folder'
        );
        if (action === 'Open Prompt') {
          const doc = await vscode.workspace.openTextDocument(promptPath);
          await vscode.window.showTextDocument(doc);
        } else if (action === 'Copy to Clipboard') {
          await vscode.env.clipboard.writeText(promptExporter.getPromptText());
          vscode.window.showInformationMessage('✅ Prompt copied to clipboard!');
        } else if (action === 'Open Folder') {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(promptPath)));
        }
      } catch (err) {
        logger.error('Export failed', err);
        vscode.window.showErrorMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    // 4. Export Markdown
    vscode.commands.registerCommand('contextOptimizer.exportMarkdown', async () => {
      try {
        const exporter = new MarkdownExporter(memoryManager!, compressor!);
        const outputPath = exporter.export();
        const doc = await vscode.workspace.openTextDocument(outputPath);
        await vscode.window.showTextDocument(doc);
      } catch (err) {
        vscode.window.showErrorMessage(`Markdown export failed: ${err}`);
      }
    }),

    // 5. Export JSON
    vscode.commands.registerCommand('contextOptimizer.exportJson', async () => {
      try {
        const exporter = new JsonExporter(memoryManager!);
        exporter.exportFull();
        exporter.exportMinified();
        const exportsDir = memoryManager!.getExportsDir();
        vscode.window.showInformationMessage(`JSON exported to ${path.relative(workspaceRoot, exportsDir)}`);
      } catch (err) {
        vscode.window.showErrorMessage(`JSON export failed: ${err}`);
      }
    }),

    // 5.5. Export Context Graph
    vscode.commands.registerCommand('contextOptimizer.exportGraph', async () => {
      await runWithProgress('Generating Context Graph...', async (progress) => {
        try {
          const exporter = new GraphExporter(memoryManager!);
          const outputPath = await exporter.export();
          logger.success(`Context graph exported: ${outputPath}`);

          const action = await vscode.window.showInformationMessage(
            `✅ Visual graph exported to ${path.relative(workspaceRoot, outputPath)}`,
            'Open Preview', 'Open File'
          );
          if (action === 'Open Preview') {
            await vscode.commands.executeCommand('markdown.showPreviewToSide', vscode.Uri.file(outputPath));
          } else if (action === 'Open File') {
            const doc = await vscode.workspace.openTextDocument(outputPath);
            await vscode.window.showTextDocument(doc);
          }
        } catch (err) {
          logger.error('Graph export failed', err);
          vscode.window.showErrorMessage(`Graph export failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }),

    // 6. Show Token Savings
    vscode.commands.registerCommand('contextOptimizer.showTokenSavings', () => {
      const mem = memoryManager!.get();
      const stats = mem.meta.tokenEstimate;
      const saved = stats.original - stats.compressed;
      vscode.window.showInformationMessage(
        `📊 Token Savings Report\n` +
        `Original: ${stats.original.toLocaleString()} tokens\n` +
        `Compressed: ${stats.compressed.toLocaleString()} tokens\n` +
        `Saved: ${saved.toLocaleString()} tokens (${stats.savedPercent}%)`
      );
    }),

    // 7. Open Dashboard
    vscode.commands.registerCommand('contextOptimizer.openDashboard', () => {
      DashboardPanel.create(context.extensionUri, memoryManager!);
    }),

    // 8. Reset Memory
    vscode.commands.registerCommand('contextOptimizer.resetMemory', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Reset all project memory? This cannot be undone.',
        { modal: true },
        'Reset'
      );
      if (confirm === 'Reset') {
        memoryManager!.reset();
        vscode.window.showInformationMessage('✅ Memory reset. Run "Generate Context" to rebuild.');
      }
    }),

    // 9. Add Developer Note
    vscode.commands.registerCommand('contextOptimizer.addNote', async () => {
      const type = await vscode.window.showQuickPick(
        ['decision', 'todo', 'bugfix', 'requirement', 'rejection', 'note'],
        { placeHolder: 'Note type' }
      ) as 'decision' | 'todo' | 'bugfix' | 'requirement' | 'rejection' | 'note' | undefined;
      if (!type) return;

      const content = await vscode.window.showInputBox({
        prompt: 'Enter note content',
        placeHolder: 'Describe the decision, requirement, or note...',
      });
      if (!content) return;

      // Sync with project memory sections
      const mem = memoryManager!.get();
      if (type === 'todo') {
        if (!mem.features.pending.includes(content)) {
          mem.features.pending.push(content);
        }
      } else if (type === 'bugfix') {
        if (!mem.bugs.includes(content)) {
          mem.bugs.push(content);
        }
      } else if (type === 'decision') {
        if (!mem.architecture.decisions.includes(content)) {
          mem.architecture.decisions.push(content);
        }
      }

      memoryManager!.addNote({ date: new Date().toISOString(), type, content });
      vscode.window.showInformationMessage(`✅ ${type} note saved to memory`);
    }),

    // 10. Add Project Rule
    vscode.commands.registerCommand('contextOptimizer.addRule', async () => {
      const rule = await vscode.window.showInputBox({
        prompt: 'Add a project rule for the AI to follow',
        placeHolder: 'e.g. Never rewrite completed modules',
      });
      if (!rule) return;
      memoryManager!.addRule(rule);
      vscode.window.showInformationMessage(`✅ Rule added: "${rule}"`);
    }),

    // 11. Detect Duplicates
    vscode.commands.registerCommand('contextOptimizer.detectDuplicates', async () => {
      await runWithProgress('Scanning for duplicate/dead code...', async () => {
        const detector = new DuplicateDetector(workspaceRoot);
        const result = await detector.detect();

        const lines: string[] = ['# Code Quality Report\n'];

        if (result.duplicateFunctions.length > 0) {
          lines.push(`## Duplicate Functions (${result.duplicateFunctions.length})\n`);
          for (const d of result.duplicateFunctions) {
            lines.push(`- \`${d.name}\` — found in: ${d.files.join(', ')}`);
          }
          lines.push('');
        }

        if (result.unusedFiles.length > 0) {
          lines.push(`## Potentially Unused Files (${result.unusedFiles.length})\n`);
          for (const f of result.unusedFiles.slice(0, 20)) {
            lines.push(`- ${f}`);
          }
          lines.push('');
        }

        if (result.deadExports.length > 0) {
          lines.push(`## Dead Exports (${result.deadExports.length})\n`);
          for (const d of result.deadExports.slice(0, 15)) {
            lines.push(`- \`${d.name}\` in ${d.file}`);
          }
        }

        if (lines.length <= 2) {
          vscode.window.showInformationMessage('✅ No duplicates or dead code detected!');
          return;
        }

        const reportPath = path.join(memoryManager!.getOutputDir(), 'code-quality-report.md');
        fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
        const doc = await vscode.workspace.openTextDocument(reportPath);
        await vscode.window.showTextDocument(doc);
      });
    }),

    // 12. Generate README
    vscode.commands.registerCommand('contextOptimizer.generateReadme', async () => {
      const mem = memoryManager!.get();
      const generator = new ReadmeGenerator();
      const content = generator.generate(mem);

      const readmePath = path.join(workspaceRoot, 'README.generated.md');
      fs.writeFileSync(readmePath, content, 'utf8');

      const doc = await vscode.workspace.openTextDocument(readmePath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage('✅ README generated! Review and rename to README.md when ready.');
    }),

    // 13. Refresh tree views
    vscode.commands.registerCommand('contextOptimizer.refresh', () => {
      summaryProvider?.refresh();
      filesProvider?.refresh();
      statsProvider?.refresh();
    }),

    // 14. Open memory file
    vscode.commands.registerCommand('contextOptimizer.openMemoryFile', async () => {
      const memPath = memoryManager!.getMemoryPath();
      if (!fs.existsSync(memPath)) {
        vscode.window.showWarningMessage('No memory file found. Run "Generate Context" first.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(memPath);
      await vscode.window.showTextDocument(doc);
    }),

    // 15. Open file (used by tree view)
    vscode.commands.registerCommand('contextOptimizer.openFile', async (relativePath: string) => {
      const absPath = path.join(workspaceRoot, relativePath);
      if (fs.existsSync(absPath)) {
        const doc = await vscode.workspace.openTextDocument(absPath);
        await vscode.window.showTextDocument(doc);
      }
    }),

    // 16. Generate AI Architecture & Project Summary
    vscode.commands.registerCommand('contextOptimizer.generateAiArchitectureSummary', async () => {
      const config = vscode.workspace.getConfiguration('contextOptimizer');
      const useAi = config.get<boolean>('useAiSummarization') ?? true;
      if (!useAi) {
        vscode.window.showWarningMessage('AI Summarization is currently disabled in settings.');
        return;
      }

      await runWithProgress('Generating AI Project Overview...', async (progress) => {
        try {
          progress.report({ message: 'Analyzing metadata with Groq...' });
          await generateAiArchitectureSummaryHelper();
          vscode.window.showInformationMessage('✅ AI Project Summary and Architecture successfully generated!');
        } catch (err) {
          logger.error('Generate AI Architecture Summary failed', err);
          vscode.window.showErrorMessage(`AI Summary failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }),
  );

  // ─── Git Watcher ───────────────────────────────────────────────────────────

  const autoUpdateOnCommit = config.get<boolean>('autoUpdateOnCommit') ?? true;
  if (autoUpdateOnCommit) {
    gitWatcher.onCommit(async (commitMsg) => {
      const firstLine = commitMsg.split('\n')[0].trim();
      logger.info(`Git commit: ${firstLine}. Updating context...`);

      const mem = memoryManager!.get();

      // 1. Detect architecture changes from commit message
      const archKeywords = ['refactor', 'migrate', 'restructure', 'architect', 'redesign', 'move', 'rename'];
      const isArchChange = archKeywords.some(k => firstLine.toLowerCase().includes(k));
      if (isArchChange) {
        if (!mem.architecture.decisions.includes(firstLine)) {
          mem.architecture.decisions.unshift(firstLine);
        }
      }

      // 2. Auto-detect completed features from commit messages
      const doneKeywords = ['feat:', 'feature:', 'add:', 'implement:', 'complete:'];
      const isDone = doneKeywords.some(k => firstLine.toLowerCase().startsWith(k));
      let detectedFeature = '';
      if (isDone) {
        detectedFeature = firstLine.replace(/^(feat|feature|add|implement|complete):\s*/i, '').trim();
        if (detectedFeature) {
          // Remove from pending/inProgress if matches
          mem.features.pending = mem.features.pending.filter(f => f.toLowerCase() !== detectedFeature.toLowerCase());
          mem.features.inProgress = mem.features.inProgress.filter(f => f.toLowerCase() !== detectedFeature.toLowerCase());
          if (!mem.features.completed.includes(detectedFeature)) {
            mem.features.completed.unshift(detectedFeature);
          }
        }
      }

      // 3. Auto-detect fixed bugs
      const fixKeywords = ['fix:', 'bugfix:', 'patch:', 'resolve:'];
      const isFix = fixKeywords.some(k => firstLine.toLowerCase().startsWith(k));
      if (isFix) {
        const fixName = firstLine.replace(/^(fix|bugfix|patch|resolve):\s*/i, '').trim();
        if (fixName) {
          // Remove from bugs if matching
          mem.bugs = mem.bugs.filter(b => b.toLowerCase() !== fixName.toLowerCase() && !fixName.toLowerCase().includes(b.toLowerCase()));
          if (!mem.features.completed.includes(`Fix: ${fixName}`)) {
            mem.features.completed.unshift(`Fix: ${fixName}`);
          }
        }
      }

      // Add conversation entry
      memoryManager!.addNote({
        date: new Date().toISOString(),
        type: isArchChange ? 'decision' : isFix ? 'bugfix' : isDone ? 'todo' : 'note',
        content: `Git commit: ${firstLine}`,
      });

      // Save memory changes before updating context
      memoryManager!.save();

      await vscode.commands.executeCommand('contextOptimizer.updateContext');
    });
    gitWatcher.start();
    context.subscriptions.push({ dispose: () => gitWatcher!.dispose() });
  }

  // ─── File Save Watcher ─────────────────────────────────────────────────────

  const autoUpdateOnSave = config.get<boolean>('autoUpdateOnSave') ?? true;
  if (autoUpdateOnSave) {
    const saveWatcher = vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.uri.fsPath.includes('.vscode')) return;
      const rel = path.relative(workspaceRoot, doc.uri.fsPath).replace(/\\/g, '/');
      if (!rel || rel.startsWith('..')) return;
      await updater!.updateSingleFile(doc.uri.fsPath, rel);
    });
    context.subscriptions.push(saveWatcher);
  }

  // ─── Status Bar ───────────────────────────────────────────────────────────

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(sparkle) Context Optimizer';
  statusBar.tooltip = 'Click to open Context Optimizer Dashboard';
  statusBar.command = 'contextOptimizer.openDashboard';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Update status bar with token savings
  memoryManager.onDidChange(() => {
    const mem = memoryManager!.get();
    const pct = mem.meta.tokenEstimate.savedPercent;
    if (pct > 0) {
      statusBar.text = `$(sparkle) ${pct}% saved`;
      statusBar.tooltip = `Context Optimizer — ${pct}% token savings. Click to open dashboard.`;
    }
  });

  // ─── Done ─────────────────────────────────────────────────────────────────

  logger.success('Context Optimizer activated! Run "Context Optimizer: Generate Context" to start.');

  // Show welcome if first time
  if (!memoryManager.exists()) {
    vscode.window.showInformationMessage(
      '🧠 Context Optimizer is ready! Generate your first project context?',
      'Generate Now', 'Later'
    ).then(action => {
      if (action === 'Generate Now') {
        vscode.commands.executeCommand('contextOptimizer.generateContext');
      }
    });
  }
}

// ─── Deactivation ────────────────────────────────────────────────────────────

export function deactivate(): void {
  gitWatcher?.dispose();
  memoryManager?.dispose();
  logger.info('Context Optimizer deactivated.');
  logger.dispose();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runWithProgress(
  title: string,
  task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>
): Promise<void> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    task
  );
}

async function generateAiArchitectureSummaryHelper(): Promise<void> {
  if (!memoryManager) return;
  const mem = memoryManager.get();
  if (!mem.project.name && mem.files.length === 0) {
    throw new Error('Project context is empty. Please run "Generate Context" first.');
  }

  const systemPrompt = `You are a professional software architect. Analyze the provided project metadata and generate:
1. A concise, professional project description (1-2 sentences).
2. A high-level, clear project architecture and design overview (2-3 paragraphs max) detailing the tech stack, routing structure, database layout, environment configurations, and patterns used.
Format your output as a clean text response. Use markdown formatting inside the architecture overview if needed. Avoid conversational introduction or outro.
Provide the response in the following format:
---DESCRIPTION---
[description here]
---ARCHITECTURE---
[architecture overview here]`;

  const filesSummary = mem.files
    .filter(f => f.priority === 'critical' || f.priority === 'high')
    .slice(0, 15)
    .map(f => `- ${f.path}: ${f.summary}`)
    .join('\n');

  const userPrompt = `Project Name: ${mem.project.name}
Version: ${mem.project.version}
Tech Stack:
- Frontend: ${mem.stack.frontend || 'N/A'}
- Backend: ${mem.stack.backend || 'N/A'}
- Database: ${mem.stack.database || 'N/A'}
- Auth: ${mem.stack.auth || 'N/A'}
Frameworks/Libs: ${mem.dependencies.frameworks.join(', ')}
Total Files: ${mem.structure.totalFiles}
Root Folders: ${mem.structure.rootFolders.join(', ')}
API Endpoints:
${mem.api.endpoints.map(e => `- ${e.method} ${e.path}${e.description ? ` (${e.description})` : ''}`).slice(0, 15).join('\n')}
DB Models: ${mem.database.models.join(', ')}
Env Variables: ${mem.environment.variables.join(', ')}
Key Files:
${filesSummary}`;

  const response = await callGroqChatCompletion(systemPrompt, userPrompt);
  
  // Parse response
  let description = '';
  let architecture = '';

  const descIdx = response.indexOf('---DESCRIPTION---');
  const archIdx = response.indexOf('---ARCHITECTURE---');

  if (descIdx !== -1 && archIdx !== -1) {
    if (descIdx < archIdx) {
      description = response.substring(descIdx + '---DESCRIPTION---'.length, archIdx).trim();
      architecture = response.substring(archIdx + '---ARCHITECTURE---'.length).trim();
    } else {
      architecture = response.substring(archIdx + '---ARCHITECTURE---'.length, descIdx).trim();
      description = response.substring(descIdx + '---DESCRIPTION---'.length).trim();
    }
  } else {
    // Fallback if formatting was ignored
    const parts = response.split('\n\n');
    description = parts[0]?.trim() || '';
    architecture = parts.slice(1).join('\n\n').trim();
  }

  if (description) {
    mem.project.description = description;
  }
  if (architecture) {
    mem.architecture.summary = architecture;
  }

  memoryManager.save();
  summaryProvider?.refresh();
}
