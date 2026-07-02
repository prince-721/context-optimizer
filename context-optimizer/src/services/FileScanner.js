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
exports.FileScanner = void 0;
// src/services/FileScanner.ts
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tokenizer_1 = require("../utils/tokenizer");
const crypto = __importStar(require("crypto"));
const HIGH_PRIORITY_PATTERNS = [
    /package\.json$/,
    /tsconfig.*\.json$/,
    /README\.md$/i,
    /\.env\.example$/,
    /schema\.(ts|js|prisma|sql|graphql)$/i,
    /model[s]?\.(ts|js)$/i,
    /route[s]?\.(ts|js)$/i,
    /router\.(ts|js)$/i,
    /config\.(ts|js|json)$/i,
    /app\.(ts|js|tsx|jsx)$/i,
    /main\.(ts|js|tsx|jsx)$/i,
    /index\.(ts|js|tsx|jsx)$/,
    /server\.(ts|js)$/i,
    /database\.(ts|js)$/i,
    /auth.*\.(ts|js|tsx|jsx)$/i,
    /middleware.*\.(ts|js)$/i,
    /prisma\/schema\.prisma$/,
    /Dockerfile$/,
    /docker-compose.*\.ya?ml$/,
];
const IGNORE_PATTERNS = [
    /node_modules/,
    /\.git\//,
    /dist\//,
    /build\//,
    /\.cache\//,
    /coverage\//,
    /\.nyc_output/,
    /logs?\//,
    /\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|pdf|woff|woff2|ttf|eot|ico)$/i,
    /\.(lock|map)$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
];
const MEDIUM_PRIORITY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.php', '.rb'];
const LOW_PRIORITY_EXTENSIONS = ['.md', '.yml', '.yaml', '.json', '.toml', '.ini', '.cfg', '.txt'];
class FileScanner {
    workspaceRoot;
    constructor() {
        const folders = vscode.workspace.workspaceFolders;
        this.workspaceRoot = folders?.[0]?.uri?.fsPath ?? '';
    }
    shouldIgnore(filePath) {
        const rel = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
        const config = vscode.workspace.getConfiguration('contextOptimizer');
        const customIgnore = config.get('ignorePatterns') ?? [];
        if (IGNORE_PATTERNS.some(p => p.test(rel)))
            return true;
        if (customIgnore.some(pattern => rel.includes(pattern)))
            return true;
        return false;
    }
    getPriority(filePath) {
        if (this.shouldIgnore(filePath))
            return 'ignore';
        const rel = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
        if (HIGH_PRIORITY_PATTERNS.some(p => p.test(rel)))
            return 'high';
        const ext = path.extname(filePath).toLowerCase();
        if (MEDIUM_PRIORITY_EXTENSIONS.includes(ext))
            return 'medium';
        if (LOW_PRIORITY_EXTENSIONS.includes(ext))
            return 'low';
        return 'ignore';
    }
    hashFile(filePath) {
        try {
            const content = fs.readFileSync(filePath);
            return crypto.createHash('md5').update(content).digest('hex');
        }
        catch {
            return '';
        }
    }
    readFile(filePath) {
        try {
            const config = vscode.workspace.getConfiguration('contextOptimizer');
            const maxKB = config.get('maxFileSizeKB') ?? 100;
            const stat = fs.statSync(filePath);
            if (stat.size > maxKB * 1024)
                return `[File too large: ${Math.round(stat.size / 1024)}KB]`;
            return fs.readFileSync(filePath, 'utf-8');
        }
        catch {
            return '';
        }
    }
    scanFolder(dir = this.workspaceRoot, depth = 0, maxDepth = 6) {
        const name = path.basename(dir);
        const node = { name, type: 'folder', children: [] };
        if (depth > maxDepth)
            return node;
        if (this.shouldIgnore(dir)) {
            node.priority = 'ignore';
            return node;
        }
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return node;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!this.shouldIgnore(fullPath)) {
                    node.children.push(this.scanFolder(fullPath, depth + 1, maxDepth));
                }
            }
            else {
                const priority = this.getPriority(fullPath);
                if (priority !== 'ignore') {
                    node.children.push({
                        name: entry.name,
                        type: 'file',
                        priority,
                    });
                }
            }
        }
        return node;
    }
    async getAllFiles(dir = this.workspaceRoot) {
        const result = [];
        const walk = (d) => {
            if (this.shouldIgnore(d))
                return;
            let entries;
            try {
                entries = fs.readdirSync(d, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const e of entries) {
                const full = path.join(d, e.name);
                if (e.isDirectory())
                    walk(full);
                else if (this.getPriority(full) !== 'ignore')
                    result.push(full);
            }
        };
        walk(dir);
        return result;
    }
    countOriginalTokens(files) {
        let total = 0;
        for (const f of files) {
            const content = this.readFile(f);
            total += (0, tokenizer_1.estimateTokens)(content);
        }
        return total;
    }
}
exports.FileScanner = FileScanner;
//# sourceMappingURL=FileScanner.js.map