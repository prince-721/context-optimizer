import * as path from 'path';
import * as fs from 'fs';
import { MemoryManager } from '../core/MemoryManager';
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
   * Generates a Mermaid.js markdown graph of the codebase
   * showing token usage, priority classification, and recent changes.
   */
  async export(): Promise<string> {
    const mem = this.memoryManager.get();
    const workspaceRoot = getWorkspaceRoot() ?? mem.meta.workspaceRoot ?? '';
    const outputPath = path.join(this.memoryManager.getExportsDir(), 'context_graph.md');

    const fileNodes: FileNode[] = [];
    
    // 1. Gather all file nodes with actual token counts and check modification state
    for (const f of mem.files) {
      const absolutePath = path.join(workspaceRoot, f.path);
      let tokens = 0;
      let isModified = false;

      try {
        const content = await readFileSafe(absolutePath);
        if (content) {
          tokens = this.tokenCounter.count(content);
        } else if (f.size) {
          tokens = Math.ceil(f.size / 4); // fallback approximation
        }

        // Check if modified in the last 24 hours
        if (fs.existsSync(absolutePath)) {
          const stats = fs.statSync(absolutePath);
          const now = Date.now();
          const diffHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);
          isModified = diffHours <= 24;
        }
      } catch {
        if (f.size) {
          tokens = Math.ceil(f.size / 4);
        }
      }

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

    // 3. Generate Mermaid diagram text
    let mermaid = '```mermaid\nflowchart LR\n';
    
    // Add subgraphs and style definitions
    const styles: string[] = [];
    const relations: string[] = [];

    const getSafeId = (relPath: string): string => {
      if (!relPath) return 'root_node';
      return 'node_' + relPath.replace(/[^a-zA-Z0-9]/g, '_');
    };

    const renderNode = (node: DirectoryNode, indent: string): string => {
      let out = '';
      const parentId = getSafeId(node.relativePath);

      // Render subdirs
      for (const [name, subdir] of node.subdirs.entries()) {
        const subdirId = getSafeId(subdir.relativePath);
        
        out += `${indent}subgraph ${subdirId}_sub [" "]\n`;
        out += `${indent}  ${subdirId}["📂 ${name}"]\n`;
        out += renderNode(subdir, indent + '  ');
        out += `${indent}end\n`;

        // Link parent to child directory (outside of subgraph block to compile correctly)
        relations.push(`  ${parentId} --> ${subdirId}`);

        // Add folder styling
        styles.push(`  style ${subdirId} fill:#eff6ff,stroke:#2563eb,stroke-width:1.5px,color:#1d4ed8`);
        // Add subgraph container styling (dashed border with clean white/gray background)
        styles.push(`  style ${subdirId}_sub fill:#fafafa,stroke:#e2e8f0,stroke-width:1px,stroke-dasharray:3 3`);
      }

      // Render files
      for (const f of node.files) {
        const fileId = getSafeId(f.relativePath);
        const changeLabel = f.isModified ? ' 🔥 [NEW/MOD]' : '';
        const nodeLabel = `${f.name}\\n(${f.tokenCount} tokens)${changeLabel}`;

        out += `${indent}${fileId}["📄 ${nodeLabel}"]\n`;

        // Link folder to file
        relations.push(`  ${parentId} --> ${fileId}`);

        // Add priority color styles
        if (f.isModified) {
          styles.push(`  style ${fileId} fill:#fef2f2,stroke:#ef4444,stroke-width:2.5px,color:#991b1b`);
        } else if (f.priority === 'critical') {
          styles.push(`  style ${fileId} fill:#fff1f2,stroke:#f43f5e,stroke-width:2px,color:#9f1239`);
        } else if (f.priority === 'high') {
          styles.push(`  style ${fileId} fill:#fff7ed,stroke:#f97316,stroke-width:1.5px,color:#9a3412`);
        } else if (f.priority === 'medium') {
          styles.push(`  style ${fileId} fill:#fefce8,stroke:#ca8a04,stroke-width:1px,color:#854d0e`);
        } else {
          styles.push(`  style ${fileId} fill:#f8fafc,stroke:#64748b,stroke-width:1px,color:#334155`);
        }
      }

      return out;
    };

    // Render root folder node
    const rootId = getSafeId(rootDir.relativePath);
    mermaid += `  ${rootId}["🏠 ${rootDir.name}"]\n`;
    styles.push(`  style ${rootId} fill:#faf5ff,stroke:#a855f7,stroke-width:2.5px,color:#6b21a8`);

    mermaid += renderNode(rootDir, '  ');
    
    // Add relationships
    mermaid += '\n  %% Directory Relationships\n';
    mermaid += relations.join('\n') + '\n';

    // Add style applications
    mermaid += '\n  %% Priority Nodes Styles\n';
    mermaid += styles.join('\n') + '\n';

    // Add Link Styles
    mermaid += '\n  %% Link Styles\n';
    mermaid += '  linkStyle default stroke:#64748b,stroke-width:1px,fill:none\n';
    mermaid += '```\n';

    // 4. Assemble full markdown file content
    const markdownContent = `# 📊 Codebase Visual Context Graph

This report provides a visual overview of your project structure, token sizes, file priorities, and recent changes.

> [!TIP]
> Press **Ctrl+Shift+V** (or **Cmd+Shift+V** on macOS) in VS Code to open the Markdown Preview and view this diagram interactively.

## 🎨 Legend
* 🏠 **Purple Node**: Root workspace folder.
* 📂 **Sub-borders**: Directory nesting boundaries.
* 🔴 **Red Nodes**: Critical files (manifests, configs, schemas).
* 🟠 **Orange Nodes**: High priority files (APIs, routes, entry points).
* 🟡 **Yellow Nodes**: Medium priority files (modules, helper classes, models).
* ⚪ **Gray Nodes**: Low priority files (tests, local utilities, styling).
* 🔥 **[NEW/MOD] Tag**: Files modified or added within the last 24 hours.

---

## 📈 Visual Project Flow

${mermaid}
`;

    writeTextFile(outputPath, markdownContent);
    return outputPath;
  }
}
