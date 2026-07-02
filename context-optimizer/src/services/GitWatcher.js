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
exports.GitWatcher = void 0;
// src/services/GitWatcher.ts
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class GitWatcher {
    manager;
    disposables = [];
    gitHeadPath = null;
    lastHead = '';
    interval = null;
    constructor(manager) {
        this.manager = manager;
        const config = vscode.workspace.getConfiguration('contextOptimizer');
        if (!config.get('gitIntegration'))
            return;
        this.setupWatcher();
    }
    setupWatcher() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders)
            return;
        const gitDir = path.join(folders[0].uri.fsPath, '.git');
        if (!fs.existsSync(gitDir))
            return;
        this.gitHeadPath = path.join(gitDir, 'COMMIT_EDITMSG');
        // Poll every 10 seconds for new commits
        this.interval = setInterval(() => this.checkForNewCommit(), 10_000);
    }
    async checkForNewCommit() {
        if (!this.gitHeadPath || !fs.existsSync(this.gitHeadPath))
            return;
        try {
            const msg = fs.readFileSync(this.gitHeadPath, 'utf-8').trim();
            if (msg && msg !== this.lastHead && !msg.startsWith('#')) {
                this.lastHead = msg;
                const hash = this.readHead();
                this.manager.addGitEntry(hash, msg, []);
                await this.manager.updateContext();
            }
        }
        catch { /* ignore */ }
    }
    readHead() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders)
            return 'unknown';
        const headFile = path.join(folders[0].uri.fsPath, '.git', 'HEAD');
        try {
            const ref = fs.readFileSync(headFile, 'utf-8').trim();
            if (ref.startsWith('ref: ')) {
                const refPath = path.join(folders[0].uri.fsPath, '.git', ref.replace('ref: ', ''));
                if (fs.existsSync(refPath))
                    return fs.readFileSync(refPath, 'utf-8').trim().slice(0, 7);
            }
            return ref.slice(0, 7);
        }
        catch {
            return 'unknown';
        }
    }
    dispose() {
        if (this.interval)
            clearInterval(this.interval);
        this.disposables.forEach(d => d.dispose());
    }
}
exports.GitWatcher = GitWatcher;
//# sourceMappingURL=GitWatcher.js.map