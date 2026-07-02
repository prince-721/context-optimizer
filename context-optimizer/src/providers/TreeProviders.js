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
exports.TokensProvider = exports.FilesProvider = exports.FeaturesProvider = exports.SummaryProvider = void 0;
// src/providers/TreeProviders.ts
const vscode = __importStar(require("vscode"));
const tokenizer_1 = require("../utils/tokenizer");
class TreeItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState = vscode.TreeItemCollapsibleState.None, iconPath, tooltip, command) {
        super(label, collapsibleState);
        this.description = description;
        this.iconPath = iconPath;
        this.tooltip = tooltip;
        this.command = command;
    }
}
// ─── Summary Provider ─────────────────────────────────────────────────────────
class SummaryProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    memory = null;
    refresh(memory) {
        this.memory = memory;
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) { return element; }
    getChildren(element) {
        if (!this.memory)
            return [new TreeItem('Run "Generate Context" to start', '', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('info'))];
        if (element)
            return [];
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
exports.SummaryProvider = SummaryProvider;
// ─── Features Provider ────────────────────────────────────────────────────────
class FeaturesProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    memory = null;
    refresh(memory) {
        this.memory = memory;
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(e) { return e; }
    getChildren(element) {
        if (!this.memory)
            return [];
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
exports.FeaturesProvider = FeaturesProvider;
// ─── Files Provider ───────────────────────────────────────────────────────────
class FilesProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    memory = null;
    refresh(memory) {
        this.memory = memory;
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(e) { return e; }
    getChildren(element) {
        if (!this.memory)
            return [];
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
exports.FilesProvider = FilesProvider;
// ─── Tokens Provider ──────────────────────────────────────────────────────────
class TokensProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    memory = null;
    refresh(memory) {
        this.memory = memory;
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(e) { return e; }
    getChildren(element) {
        if (!this.memory)
            return [];
        const { tokenStats } = this.memory;
        if (!element) {
            return [
                new TreeItem((0, tokenizer_1.formatTokenCount)(tokenStats.original), 'original tokens', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('symbol-numeric')),
                new TreeItem((0, tokenizer_1.formatTokenCount)(tokenStats.compressed), 'compressed tokens', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('arrow-down')),
                new TreeItem(`${tokenStats.savedPercent}%`, 'tokens saved', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('sparkle')),
                new TreeItem(`${(0, tokenizer_1.formatTokenCount)(tokenStats.original - tokenStats.compressed)}`, 'tokens eliminated', vscode.TreeItemCollapsibleState.None, new vscode.ThemeIcon('trash')),
            ];
        }
        return [];
    }
}
exports.TokensProvider = TokensProvider;
//# sourceMappingURL=TreeProviders.js.map