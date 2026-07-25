import * as path from 'path';
import * as fs from 'fs';
import { MemoryManager, ProjectMemory } from '../core/MemoryManager';
import { readFileSafe, getWorkspaceRoot } from '../utils/fileUtils';

export interface GraphNode {
  id: string;
  name: string;
  type: 'root' | 'folder' | 'file' | 'component' | 'api' | 'backend' | 'database' | 'env' | 'docker' | 'cicd' | 'deployment';
  path: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  tokenCount?: number;
  isModified?: boolean;
  summary?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'contains' | 'defines' | 'references' | 'uses';
}

export interface FlowGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const componentImportsCache = new Map<string, string[]>();

export class FlowGraphExporter {
  constructor(private memoryManager: MemoryManager) {}

  async getGraphData(): Promise<FlowGraphData> {
    const mem = this.memoryManager.get();
    const workspaceRoot = getWorkspaceRoot() ?? mem.meta.workspaceRoot ?? process.cwd();
    const workspaceFolderName = path.basename(workspaceRoot);

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    const addNode = (node: GraphNode) => {
      if (!nodeIds.has(node.id)) {
        nodeIds.add(node.id);
        nodes.push(node);
      }
    };

    const addEdge = (source: string, target: string, type: 'contains' | 'defines' | 'references' | 'uses') => {
      const id = `edge_${source}_${target}_${type}`;
      if (!edgeIds.has(id) && source !== target) {
        edgeIds.add(id);
        edges.push({ id, source, target, type });
      }
    };

    const getSafeId = (relPath: string): string => {
      if (!relPath) return 'root_node';
      return 'node_' + relPath.replace(/[^a-zA-Z0-9]/g, '_');
    };

    // 1. Root Node
    const rootId = 'root_node';
    addNode({
      id: rootId,
      name: workspaceFolderName || 'Workspace Root',
      type: 'root',
      path: '',
    });

    // 2. Obtain File Records from Memory or Direct Directory Scan
    let fileRecords = mem.files || [];
    if (fileRecords.length <= 1 && workspaceRoot && fs.existsSync(workspaceRoot)) {
      fileRecords = [];
      const scanDir = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
            if (entry.name.startsWith('.') && entry.name !== '.env') continue;
            if (['node_modules', 'dist', 'out', 'build', '.git', '.vscode'].includes(entry.name)) continue;
            if (entry.isDirectory()) {
              scanDir(fullPath);
            } else if (entry.isFile()) {
              const stat = fs.statSync(fullPath);
              fileRecords.push({
                path: relPath,
                size: stat.size,
                priority: 'medium',
                hash: '',
                lastAnalyzed: stat.mtime.toISOString(),
                summary: `${entry.name} file in workspace`
              });
            }
          }
        } catch {}
      };
      scanDir(workspaceRoot);
    }

    // 3. Process File Records
    for (const f of fileRecords) {
      if (!f || !f.path) continue;
      let normalizedPath = f.path.replace(/\\/g, '/');
      if (normalizedPath.endsWith('.js.map')) continue;

      const absolutePath = path.join(workspaceRoot, f.path);
      let tokens = f.size ? Math.ceil(f.size / 4) : 10;
      let isModified = false;

      if (f.lastAnalyzed) {
        try {
          const mtime = new Date(f.lastAnalyzed).getTime();
          const diffHours = (Date.now() - mtime) / (1000 * 60 * 60);
          isModified = diffHours <= 24;
        } catch {}
      }

      // Categorize node
      let fileType: GraphNode['type'] = 'file';
      const lowercasePath = normalizedPath.toLowerCase();

      if (lowercasePath.includes('dockerfile') || lowercasePath.includes('docker-compose') || lowercasePath.endsWith('.docker')) {
        fileType = 'docker';
      } else if (lowercasePath.startsWith('.github/workflows/') || lowercasePath.includes('.gitlab-ci') || lowercasePath.includes('jenkinsfile')) {
        fileType = 'cicd';
      } else if (lowercasePath.endsWith('vercel.json') || lowercasePath.endsWith('netlify.toml') || lowercasePath.endsWith('render.yaml') || lowercasePath.endsWith('fly.toml')) {
        fileType = 'deployment';
      } else if (lowercasePath.includes('.env')) {
        fileType = 'env';
      } else if (lowercasePath.endsWith('.tsx') || lowercasePath.endsWith('.jsx')) {
        fileType = 'component';
      } else if (lowercasePath.includes('schema.prisma') || lowercasePath.includes('models/') || lowercasePath.includes('schemas/')) {
        fileType = 'database';
      } else if (lowercasePath.includes('services/') || lowercasePath.includes('controllers/') || lowercasePath.includes('handlers/')) {
        fileType = 'backend';
      } else if (lowercasePath.includes('/api/') || lowercasePath.startsWith('api/')) {
        fileType = 'api';
      }

      // Parent folders hierarchy
      const parts = normalizedPath.split('/');
      let currentParentId = rootId;

      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join('/');
        const folderId = getSafeId(folderPath);
        
        addNode({
          id: folderId,
          name: parts[i],
          type: 'folder',
          path: folderPath,
        });

        addEdge(currentParentId, folderId, 'contains');
        currentParentId = folderId;
      }

      // File Node
      const fileId = getSafeId(normalizedPath);
      addNode({
        id: fileId,
        name: path.basename(normalizedPath),
        type: fileType,
        path: normalizedPath,
        priority: f.priority,
        tokenCount: tokens,
        isModified,
        summary: f.summary,
      });

      addEdge(currentParentId, fileId, 'contains');

      // Scan component imports
      if ((fileType === 'component' || fileType === 'file') && f.size && f.size < 150000) {
        let imports: string[] = [];
        const cacheKey = f.hash || normalizedPath;
        if (componentImportsCache.has(cacheKey)) {
          imports = componentImportsCache.get(cacheKey)!;
        } else {
          try {
            const content = await readFileSafe(absolutePath);
            if (content) {
              const lines = content.split(/\r?\n/).slice(0, 80).join('\n');
              const importRegex = /import\s+(?:[\w\s{},*]+)\s+from\s+['"]([^'"]+)['"]/g;
              let match;
              while ((match = importRegex.exec(lines)) !== null) {
                imports.push(match[1]);
              }
              componentImportsCache.set(cacheKey, imports);
            }
          } catch {}
        }

        for (const importVal of imports) {
          if (importVal.startsWith('.') || importVal.startsWith('@/')) {
            let resolvedRelPath = '';
            if (importVal.startsWith('.')) {
              const absoluteImport = path.resolve(path.dirname(absolutePath), importVal);
              resolvedRelPath = path.relative(workspaceRoot, absoluteImport).replace(/\\/g, '/');
            } else {
              resolvedRelPath = importVal.replace('@/', 'src/').replace(/\\/g, '/');
            }

            for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
              const checkPath = resolvedRelPath + ext;
              if (fileRecords.some(mf => mf.path.replace(/\\/g, '/') === checkPath)) {
                addEdge(fileId, getSafeId(checkPath), 'uses');
                break;
              }
            }
          }
        }
      }
    }

    // 4. Scan API Endpoints from Memory
    if (mem.api && mem.api.endpoints) {
      for (const ep of mem.api.endpoints) {
        const apiNodeId = `api_endpoint_${ep.method}_${ep.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        addNode({
          id: apiNodeId,
          name: `${ep.method} ${ep.path}`,
          type: 'api',
          path: ep.path,
        });

        if (ep.file) {
          const fileId = getSafeId(ep.file.replace(/\\/g, '/'));
          addEdge(fileId, apiNodeId, 'defines');
        }
      }
    }

    // 5. Scan Env Vars from Memory
    if (mem.environment && mem.environment.variables) {
      for (const envVar of mem.environment.variables) {
        const envNodeId = `env_var_${envVar}`;
        addNode({
          id: envNodeId,
          name: envVar,
          type: 'env',
          path: `.env -> ${envVar}`,
        });

        const envFiles = nodes.filter(n => n.type === 'env' && n.name.startsWith('.env'));
        for (const envFile of envFiles) {
          addEdge(envFile.id, envNodeId, 'defines');
        }
      }
    }

    // 6. Scan DB Models from Memory
    if (mem.database && mem.database.models) {
      for (const model of mem.database.models) {
        const dbNodeId = `db_model_${model}`;
        addNode({
          id: dbNodeId,
          name: model,
          type: 'database',
          path: `Database Model: ${model}`,
        });

        const schemaFiles = nodes.filter(n => n.type === 'database' && n.name.includes('schema'));
        for (const schemaFile of schemaFiles) {
          addEdge(schemaFile.id, dbNodeId, 'defines');
        }
      }
    }

    return { nodes, edges };
  }
}
