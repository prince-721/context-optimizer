import * as path from 'path';
import * as fs from 'fs';
import { MemoryManager, ProjectMemory } from '../core/MemoryManager';
import { TokenCounter } from '../core/TokenCounter';
import { writeTextFile, readFileSafe, getWorkspaceRoot } from '../utils/fileUtils';

interface DirectoryNode {
  name: string;
  relativePath: string;
  subdirs: Map<string, DirectoryNode>;
  files: FileNode[];
}

interface FileNode {
  name: string;
  relativePath: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  tokenCount: number;
  isModified: boolean;
}

export class GraphExporter {
  private tokenCounter: TokenCounter;

  constructor(private memoryManager: MemoryManager) {
    this.tokenCounter = new TokenCounter();
  }

  /**
   * Generates a comprehensive markdown graph of the codebase
   * with both a structured ASCII tree (universally readable) and
   * an interactive Mermaid.js flowchart (for VS Code preview).
   */
  private async buildDirectoryTree(mem: ProjectMemory): Promise<{
    rootDir: DirectoryNode;
    fileNodes: FileNode[];
    totalOriginalTokens: number;
    totalFiles: number;
    modifiedFiles: number;
  }> {
    const workspaceRoot = getWorkspaceRoot() ?? mem.meta.workspaceRoot ?? '';
    const fileNodes: FileNode[] = [];
    let totalOriginalTokens = 0;
    let totalFiles = 0;
    let modifiedFiles = 0;
    
    // 1. Gather all file nodes, filtering out build artifacts (.js.map and duplicate .js files in src)
    const filePaths = new Set((mem.files || []).filter(f => f && f.path).map(f => f.path.replace(/\\/g, '/')));
    
    // Determine the workspace folder name so we can strip it from paths
    const workspaceFolderName = path.basename(workspaceRoot);

    for (const f of (mem.files || [])) {
      if (!f || !f.path) continue;
      let normalizedPath = f.path.replace(/\\/g, '/');

      // Flatten: strip the redundant leading folder that matches the workspace root
      if (workspaceFolderName && normalizedPath.startsWith(workspaceFolderName + '/')) {
        normalizedPath = normalizedPath.substring(workspaceFolderName.length + 1);
      }
      
      // Exclude source maps and compiled outputs that duplicate source typescript files
      if (normalizedPath.endsWith('.js.map')) continue;
      if (normalizedPath.endsWith('.js')) {
        const tsPath = normalizedPath.slice(0, -3) + '.ts';
        if (filePaths.has(tsPath)) continue;
      }

      let tokens = f.size ? Math.ceil(f.size / 4) : 0;
      let isModified = false;

      if (f.lastAnalyzed) {
        try {
          const mtime = new Date(f.lastAnalyzed).getTime();
          const diffHours = (Date.now() - mtime) / (1000 * 60 * 60);
          isModified = diffHours <= 24;
        } catch {}
      }

      totalOriginalTokens += tokens;
      totalFiles++;
      if (isModified) { modifiedFiles++; }

      fileNodes.push({
        name: path.basename(f.path),
        relativePath: f.path,
        priority: f.priority,
        tokenCount: tokens,
        isModified,
      });
    }

    // 2. Build Directory Tree
    const rootDir: DirectoryNode = {
      name: path.basename(workspaceRoot) || 'Root',
      relativePath: '',
      subdirs: new Map(),
      files: [],
    };

    for (const f of fileNodes) {
      const parts = f.relativePath.split(/[/\\]/);
      let current = rootDir;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current.subdirs.has(part)) {
          const relativeSubdirPath = current.relativePath ? `${current.relativePath}/${part}` : part;
          current.subdirs.set(part, {
            name: part,
            relativePath: relativeSubdirPath,
            subdirs: new Map(),
            files: [],
          });
        }
        current = current.subdirs.get(part)!;
      }
      current.files.push(f);
    }

    return { rootDir, fileNodes, totalOriginalTokens, totalFiles, modifiedFiles };
  }

  public generateMermaid(rootDir: DirectoryNode): string {
    let mermaid = 'flowchart LR\n';
    const relations: string[] = [];
    const classApplications: string[] = [];

    const getSafeId = (relPath: string): string => {
      if (!relPath) return 'root_node';
      return 'node_' + relPath.replace(/[^a-zA-Z0-9]/g, '_');
    };

    let totalNodesCount = 0;
    const MAX_MERMAID_NODES = 60; // Cap to prevent Mermaid size limit crash

    const renderMermaidNode = (node: DirectoryNode, indent: string): string => {
      let out = '';
      const parentId = getSafeId(node.relativePath);

      for (const [name, subdir] of node.subdirs.entries()) {
        if (totalNodesCount >= MAX_MERMAID_NODES) break;
        totalNodesCount++;

        const subdirId = getSafeId(subdir.relativePath);
        out += `${indent}${subdirId}["📂 ${name}"]\n`;
        relations.push(`  ${parentId} --> ${subdirId}`);
        classApplications.push(`  class ${subdirId} folderNode;`);
        out += renderMermaidNode(subdir, indent);
      }

      for (const f of node.files) {
        if (totalNodesCount >= MAX_MERMAID_NODES) break;
        totalNodesCount++;

        const fileId = getSafeId(f.relativePath);
        const changeLabel = f.isModified ? ' 🔥' : '';
        const cleanName = f.name.replace(/["'<>]/g, '');
        const nodeLabel = `${cleanName} (${f.tokenCount}t)${changeLabel}`;
        out += `${indent}${fileId}["📄 ${nodeLabel}"]\n`;
        relations.push(`  ${parentId} --> ${fileId}`);

        if (f.isModified) {
          classApplications.push(`  class ${fileId} modifiedNode;`);
        } else if (f.priority === 'critical') {
          classApplications.push(`  class ${fileId} criticalNode;`);
        } else if (f.priority === 'high') {
          classApplications.push(`  class ${fileId} highNode;`);
        } else if (f.priority === 'medium') {
          classApplications.push(`  class ${fileId} mediumNode;`);
        } else {
          classApplications.push(`  class ${fileId} lowNode;`);
        }
      }
      return out;
    };

    const rootId = getSafeId(rootDir.relativePath);
    mermaid += `  ${rootId}["🏠 ${rootDir.name}"]\n`;
    classApplications.push(`  class ${rootId} rootNode;`);
    
    mermaid += renderMermaidNode(rootDir, '  ');
    mermaid += '\n  %% Directory Relationships\n';
    mermaid += relations.join('\n') + '\n';
    
    mermaid += '\n  %% Style Class Definitions\n';
    mermaid += '  classDef rootNode fill:#2d1b4e,stroke:#a855f7,stroke-width:2.5px,color:#f3e8ff;\n';
    mermaid += '  classDef folderNode fill:#1e293b,stroke:#3b82f6,stroke-width:1.5px,color:#eff6ff;\n';
    mermaid += '  classDef criticalNode fill:#3b1313,stroke:#f43f5e,stroke-width:2px,color:#ffe4e6;\n';
    mermaid += '  classDef highNode fill:#3b2313,stroke:#f97316,stroke-width:1.5px,color:#ffedd5;\n';
    mermaid += '  classDef mediumNode fill:#143b13,stroke:#22c55e,stroke-width:1px,color:#dcfce7;\n';
    mermaid += '  classDef lowNode fill:#1e293b,stroke:#64748b,stroke-width:1px,color:#f1f5f9;\n';
    mermaid += '  classDef modifiedNode fill:#3b132c,stroke:#ef4444,stroke-width:2.5px,color:#fce7f3;\n';

    mermaid += '\n  %% Class Applications\n';
    mermaid += classApplications.join('\n') + '\n';
    mermaid += '\n  %% Link Styles\n';
    mermaid += '  linkStyle default stroke:#475569,stroke-width:1.2px,fill:none\n';
    return mermaid;
  }

  async getMermaidDiagram(): Promise<string> {
    const mem = this.memoryManager.get();
    const { rootDir } = await this.buildDirectoryTree(mem);
    return this.generateMermaid(rootDir);
  }

  /**
   * Generates a comprehensive markdown graph of the codebase
   * with both a structured ASCII tree (universally readable) and
   * an interactive Mermaid.js flowchart (for VS Code preview).
   */
  async export(): Promise<string> {
    const mem = this.memoryManager.get();
    const workspaceRoot = getWorkspaceRoot() ?? mem.meta.workspaceRoot ?? '';
    const outputPath = path.join(this.memoryManager.getExportsDir(), 'context_graph.md');

    const { rootDir, fileNodes, totalOriginalTokens, totalFiles, modifiedFiles } = await this.buildDirectoryTree(mem);

    // ═══════════════════════════════════════════════════════════
    // SECTION A: Structured ASCII Tree (renders everywhere)
    // ═══════════════════════════════════════════════════════════

    const getPriorityBadge = (priority: string, isModified: boolean): string => {
      if (isModified) return '🔥 Modified';
      switch (priority) {
        case 'critical': return '🔴 Critical';
        case 'high': return '🟠 High';
        case 'medium': return '🟡 Medium';
        default: return '⚪ Low';
      }
    };

    const padRight = (str: string, len: number): string => {
      const visLen = [...str].length;
      return str + ' '.repeat(Math.max(0, len - visLen));
    };

    const renderAsciiTree = (node: DirectoryNode, prefix: string, isLast: boolean): string => {
      let out = '';
      const children: Array<{ type: 'dir' | 'file'; name: string; node?: DirectoryNode; file?: FileNode }> = [];

      for (const [name, subdir] of node.subdirs.entries()) {
        children.push({ type: 'dir', name, node: subdir });
      }
      for (const f of node.files) {
        children.push({ type: 'file', name: f.name, file: f });
      }

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childIsLast = (i === children.length - 1);
        const connector = childIsLast ? '└── ' : '├── ';
        const nextPrefix = prefix + (childIsLast ? '    ' : '│   ');

        if (child.type === 'dir' && child.node) {
          const subdirFiles = this.countFilesInDir(child.node);
          const subdirTokens = this.countTokensInDir(child.node);
          out += `${prefix}${connector}📂 ${child.name}/ (${subdirFiles} files, ${subdirTokens.toLocaleString()} tokens)\n`;
          out += renderAsciiTree(child.node, nextPrefix, childIsLast);
        } else if (child.type === 'file' && child.file) {
          const f = child.file;
          const badge = getPriorityBadge(f.priority, f.isModified);
          const modTag = f.isModified ? ' 🔥' : '';
          out += `${prefix}${connector}📄 ${padRight(f.name, 30)} ${padRight(f.tokenCount.toLocaleString() + ' tokens', 14)} [${badge}]${modTag}\n`;
        }
      }
      return out;
    };

    const asciiTree = `🏠 ${rootDir.name}/\n` + renderAsciiTree(rootDir, '', true);

    // ═══════════════════════════════════════════════════════════
    // SECTION B: Summary Statistics
    // ═══════════════════════════════════════════════════════════

    const criticalCount = fileNodes.filter(f => f.priority === 'critical').length;
    const highCount = fileNodes.filter(f => f.priority === 'high').length;
    const mediumCount = fileNodes.filter(f => f.priority === 'medium').length;
    const lowCount = fileNodes.filter(f => f.priority === 'low').length;

    const statsTable = `| Metric | Value |
|:---|:---|
| **Total Files Tracked** | ${totalFiles} |
| **Total Original Tokens** | ${totalOriginalTokens.toLocaleString()} |
| **Files Modified (last 24h)** | ${modifiedFiles} |
| 🔴 Critical Priority | ${criticalCount} files |
| 🟠 High Priority | ${highCount} files |
| 🟡 Medium Priority | ${mediumCount} files |
| ⚪ Low Priority | ${lowCount} files |`;

    // ═══════════════════════════════════════════════════════════
    // SECTION C: Priority File Table
    // ═══════════════════════════════════════════════════════════

    const sortedFiles = [...fileNodes].sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const pa = priorityOrder[a.priority] ?? 4;
      const pb = priorityOrder[b.priority] ?? 4;
      if (pa !== pb) return pa - pb;
      return b.tokenCount - a.tokenCount;
    });

    let fileTable = `| File | Directory | Tokens | Priority | Modified |\n|:---|:---|---:|:---|:---|\n`;
    for (const f of sortedFiles) {
      const dir = path.dirname(f.relativePath) || '.';
      const badge = getPriorityBadge(f.priority, false);
      const mod = f.isModified ? '🔥 Yes' : '—';
      fileTable += `| 📄 ${f.name} | \`${dir}\` | ${f.tokenCount.toLocaleString()} | ${badge} | ${mod} |\n`;
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION D: Mermaid Flowchart (for VS Code preview)
    // ═══════════════════════════════════════════════════════════

    const mermaid = '```mermaid\n' + this.generateMermaid(rootDir) + '```\n';

    // ═══════════════════════════════════════════════════════════
    // ASSEMBLE FINAL MARKDOWN
    // ═══════════════════════════════════════════════════════════

    const markdownContent = `# 📊 Codebase Visual Context Graph

> Generated by **Context Optimizer** — Token-optimized AI context for your codebase.

---

## 📈 Project Summary

${statsTable}

---

## 🎨 Legend

| Symbol | Meaning |
|:---|:---|
| 🏠 | Root workspace folder |
| 📂 | Directory (folder) |
| 📄 | Source file |
| 🔴 Critical | Manifests, configs, schemas — always include in AI context |
| 🟠 High | Entry points, API routes, important modules |
| 🟡 Medium | Helper classes, utilities, models |
| ⚪ Low | Tests, generated files, styling |
| 🔥 Modified | Changed within the last 24 hours |

---

## 🌳 Structured Directory Tree

\`\`\`text
${asciiTree}\`\`\`

---

## 📋 All Files by Priority

${fileTable}

---

## 🔮 Interactive Flowchart (VS Code Markdown Preview)

> [!TIP]
> Press **Ctrl+Shift+V** (or **Cmd+Shift+V** on macOS) in VS Code to render this Mermaid diagram interactively.

${mermaid}
`;

    writeTextFile(outputPath, markdownContent);
    return outputPath;
  }

  /** Count total files recursively in a directory node */
  private countFilesInDir(node: DirectoryNode): number {
    let count = node.files.length;
    for (const subdir of node.subdirs.values()) {
      count += this.countFilesInDir(subdir);
    }
    return count;
  }

  /** Count total tokens recursively in a directory node */
  private countTokensInDir(node: DirectoryNode): number {
    let total = node.files.reduce((sum, f) => sum + f.tokenCount, 0);
    for (const subdir of node.subdirs.values()) {
      total += this.countTokensInDir(subdir);
    }
    return total;
  }
}
