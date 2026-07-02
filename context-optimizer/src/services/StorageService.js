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
exports.StorageService = void 0;
// src/services/StorageService.ts
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class StorageService {
    storagePath;
    memoryFile;
    constructor(context) {
        this.storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
        const workspaceId = this.getWorkspaceId();
        this.memoryFile = path.join(this.storagePath, `${workspaceId}.json`);
    }
    getWorkspaceId() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0)
            return 'default';
        const root = workspaceFolders[0].uri.fsPath;
        return Buffer.from(root).toString('base64').replace(/[/+=]/g, '_').slice(0, 64);
    }
    load() {
        try {
            if (!fs.existsSync(this.memoryFile))
                return null;
            const data = fs.readFileSync(this.memoryFile, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return null;
        }
    }
    save(memory) {
        fs.writeFileSync(this.memoryFile, JSON.stringify(memory, null, 2), 'utf-8');
    }
    delete() {
        if (fs.existsSync(this.memoryFile)) {
            fs.unlinkSync(this.memoryFile);
        }
    }
    exportToWorkspace(format) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders)
            throw new Error('No workspace open');
        const root = workspaceFolders[0].uri.fsPath;
        const exportDir = path.join(root, '.context-optimizer');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
        const files = [];
        const write = (name, content) => {
            const p = path.join(exportDir, name);
            fs.writeFileSync(p, content, 'utf-8');
            files.push(p);
        };
        write('context.md', format.markdown);
        write('context.json', format.json);
        write('context.min.json', format.minJson);
        write('optimized_prompt.txt', format.optimizedPrompt);
        return files;
    }
}
exports.StorageService = StorageService;
//# sourceMappingURL=StorageService.js.map