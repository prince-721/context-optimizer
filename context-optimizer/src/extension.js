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
exports.activate = activate;
exports.deactivate = deactivate;
// src/extension.ts
const vscode = __importStar(require("vscode"));
const MemoryManager_1 = require("./services/MemoryManager");
const Exporter_1 = require("./services/Exporter");
const StorageService_1 = require("./services/StorageService");
const GitWatcher_1 = require("./services/GitWatcher");
const DashboardPanel_1 = require("./webview/DashboardPanel");
const TreeProviders_1 = require("./providers/TreeProviders");
const tokenizer_1 = require("./utils/tokenizer");
let memoryManager;
let exporter;
let storage;
let gitWatcher;
const summaryProvider = new TreeProviders_1.SummaryProvider();
const featuresProvider = new TreeProviders_1.FeaturesProvider();
const filesProvider = new TreeProviders_1.FilesProvider();
const tokensProvider = new TreeProviders_1.TokensProvider();
function activate(context) {
    memoryManager = new MemoryManager_1.MemoryManager(context);
    exporter = new Exporter_1.Exporter();
    storage = new StorageService_1.StorageService(context);
    gitWatcher = new GitWatcher_1.GitWatcher(memoryManager);
    // Register tree views
    vscode.window.createTreeView('contextOptimizer.summary', { treeDataProvider: summaryProvider });
    vscode.window.createTreeView('contextOptimizer.features', { treeDataProvider: featuresProvider });
    vscode.window.createTreeView('contextOptimizer.files', { treeDataProvider: filesProvider });
    vscode.window.createTreeView('contextOptimizer.tokens', { treeDataProvider: tokensProvider });
    // Refresh tree views when memory updates
    memoryManager.onDidUpdate(memory => {
        summaryProvider.refresh(memory);
        featuresProvider.refresh(memory);
        filesProvider.refresh(memory);
        tokensProvider.refresh(memory);
        if (DashboardPanel_1.DashboardPanel.currentPanel) {
            DashboardPanel_1.DashboardPanel.currentPanel.update(memory);
        }
    });
    // Initialize from saved memory if available
    const existing = memoryManager.getMemory();
    if (existing.projectName) {
        summaryProvider.refresh(existing);
        featuresProvider.refresh(existing);
        filesProvider.refresh(existing);
        tokensProvider.refresh(existing);
    }
    // Auto-update on file save
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (doc) => {
        const config = vscode.workspace.getConfiguration('contextOptimizer');
        if (!config.get('autoUpdate'))
            return;
        // Debounce: only update if saved file is relevant
        const folders = vscode.workspace.workspaceFolders;
        if (!folders)
            return;
        await memoryManager.updateContext();
    }));
    // ─── Commands ─────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.generateContext', async () => {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('Context Optimizer: Please open a workspace first.');
            return;
        }
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Context Optimizer', cancellable: false }, async (progress) => {
            await memoryManager.generateContext(progress);
            const mem = memoryManager.getMemory();
            vscode.window.showInformationMessage(`✅ Context generated! Saved ${mem.tokenStats.savedPercent}% tokens (${(0, tokenizer_1.formatTokenCount)(mem.tokenStats.original)} → ${(0, tokenizer_1.formatTokenCount)(mem.tokenStats.compressed)})`);
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.updateContext', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Updating context…', cancellable: false }, async () => {
            await memoryManager.updateContext();
            vscode.window.showInformationMessage('✅ Context updated (changed files only).');
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.exportPrompt', async () => {
        const memory = memoryManager.getMemory();
        if (!memory.projectName) {
            const go = await vscode.window.showWarningMessage('No context generated yet. Generate first?', 'Generate Now', 'Cancel');
            if (go === 'Generate Now')
                await vscode.commands.executeCommand('contextOptimizer.generateContext');
            return;
        }
        const format = exporter.export(memory);
        const choice = await vscode.window.showQuickPick([
            { label: '📝 context.md', detail: 'Markdown — readable, great for Claude/ChatGPT', value: 'markdown' },
            { label: '📄 optimized_prompt.txt', detail: 'Ultra-compressed — maximum token savings', value: 'prompt' },
            { label: '📦 context.json', detail: 'Full structured JSON', value: 'json' },
            { label: '🗜 context.min.json', detail: 'Minified JSON — smallest size', value: 'minJson' },
            { label: '📂 Export All Files', detail: 'Write all formats to .context-optimizer/', value: 'all' },
        ], { placeHolder: 'Choose export format' });
        if (!choice)
            return;
        if (choice.value === 'all') {
            try {
                const files = storage.exportToWorkspace(format);
                const msg = await vscode.window.showInformationMessage(`✅ Exported ${files.length} files to .context-optimizer/`, 'Open Folder');
                if (msg === 'Open Folder') {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(files[0]));
                }
            }
            catch (e) {
                vscode.window.showErrorMessage(`Export failed: ${e}`);
            }
            return;
        }
        // Copy to clipboard
        let content = '';
        if (choice.value === 'markdown')
            content = format.markdown;
        else if (choice.value === 'prompt')
            content = format.optimizedPrompt;
        else if (choice.value === 'json')
            content = format.json;
        else if (choice.value === 'minJson')
            content = format.minJson;
        await vscode.env.clipboard.writeText(content);
        vscode.window.showInformationMessage(`✅ Copied to clipboard! Paste into any AI assistant.`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.showTokenSavings', () => {
        const { tokenStats } = memoryManager.getMemory();
        vscode.window.showInformationMessage(`📊 Token Savings: Original ${(0, tokenizer_1.formatTokenCount)(tokenStats.original)} → Compressed ${(0, tokenizer_1.formatTokenCount)(tokenStats.compressed)} = ${tokenStats.savedPercent}% saved (${(0, tokenizer_1.formatTokenCount)(tokenStats.original - tokenStats.compressed)} tokens eliminated)`, { modal: true });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.resetMemory', async () => {
        const confirm = await vscode.window.showWarningMessage('Reset all Context Optimizer memory for this project? This cannot be undone.', { modal: true }, 'Reset', 'Cancel');
        if (confirm !== 'Reset')
            return;
        memoryManager.reset();
        vscode.window.showInformationMessage('Context Optimizer memory reset.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.openDashboard', () => {
        DashboardPanel_1.DashboardPanel.createOrShow(context, memoryManager.getMemory());
    }));
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.addNote', async () => {
        const note = await vscode.window.showInputBox({ prompt: 'Add developer note', placeHolder: 'e.g. Always validate dates on backend' });
        if (note) {
            memoryManager.addNote(note);
            vscode.window.showInformationMessage('Note added to project memory.');
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.generateReadme', async () => {
        const memory = memoryManager.getMemory();
        if (!memory.projectName) {
            vscode.window.showWarningMessage('Generate context first.');
            return;
        }
        const readme = exporter.generateReadme(memory);
        await vscode.env.clipboard.writeText(readme);
        const action = await vscode.window.showInformationMessage('✅ README generated and copied to clipboard!', 'Save to README.md');
        if (action === 'Save to README.md' && vscode.workspace.workspaceFolders) {
            const root = vscode.workspace.workspaceFolders[0].uri;
            const readmePath = vscode.Uri.joinPath(root, 'README.md');
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(readmePath, encoder.encode(readme));
            vscode.window.showInformationMessage('README.md written to workspace root.');
        }
    }));
    // Register bonus AI analysis commands inline
    context.subscriptions.push(vscode.commands.registerCommand('contextOptimizer.analyzeProject', async () => {
        const result = memoryManager.analyzeForIssues();
        const lines = [
            `🔍 Project Analysis Results\n`,
            `Potential Duplicates (${result.duplicates.length}):`,
            ...result.duplicates.map(d => `  • ${d}`),
            `\nPossibly Unused Files (${result.unusedFiles.length}):`,
            ...result.unusedFiles.slice(0, 5).map(f => `  • ${f}`),
            `\nFiles Missing Documentation (${result.missingDocs.length}):`,
            ...result.missingDocs.slice(0, 5).map(f => `  • ${f}`),
        ];
        const channel = vscode.window.createOutputChannel('Context Optimizer Analysis');
        channel.clear();
        channel.appendLine(lines.join('\n'));
        channel.show();
    }));
    context.subscriptions.push(gitWatcher);
    // Status bar item
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'contextOptimizer.openDashboard';
    statusBar.text = '$(database) Context Optimizer';
    statusBar.tooltip = 'Open Context Optimizer Dashboard';
    statusBar.show();
    context.subscriptions.push(statusBar);
    // Update status bar with token info when memory updates
    memoryManager.onDidUpdate(mem => {
        if (mem.tokenStats.savedPercent > 0) {
            statusBar.text = `$(database) ${mem.tokenStats.savedPercent}% saved`;
        }
    });
    console.log('Context Optimizer activated.');
}
function deactivate() {
    gitWatcher?.dispose();
}
//# sourceMappingURL=extension.js.map