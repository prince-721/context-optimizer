import * as path from 'path';
import { walkDirectory, readFileSafe, relativePath, isTextFile } from '../utils/fileUtils';
import { ApiEndpoint } from '../core/MemoryManager';
import { logger } from '../utils/logger';

const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'java', 'php', 'cs', 'rs']);

function getExt(p: string): string {
  return path.extname(p).toLowerCase().replace('.', '');
}

export class ApiDetector {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async detect(): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    const seen = new Set<string>();

    const files = walkDirectory(this.workspaceRoot).filter(
      f => CODE_EXTENSIONS.has(getExt(f)) && isTextFile(f)
    );

    for (const file of files) {
      const content = await readFileSafe(file);
      if (!content) continue;

      const relPath = relativePath(this.workspaceRoot, file);
      const found = this.extractEndpoints(content, relPath);

      for (const ep of found) {
        const key = `${ep.method}:${ep.path}`;
        if (!seen.has(key)) {
          seen.add(key);
          endpoints.push(ep);
        }
      }
    }

    // Sort: GET first, then POST, PUT, PATCH, DELETE
    const methodOrder: Record<string, number> = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
    endpoints.sort((a, b) => {
      const ma = methodOrder[a.method] ?? 99;
      const mb = methodOrder[b.method] ?? 99;
      if (ma !== mb) return ma - mb;
      return a.path.localeCompare(b.path);
    });

    logger.info(`ApiDetector: Found ${endpoints.length} API endpoints`);
    return endpoints;
  }

  private extractEndpoints(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Express / Fastify / Hono: app.get('/path', ...) or router.post('/path', ...)
      const expressMatch = line.match(
        /(?:app|router|server|api|v1|v2)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/i
      );
      if (expressMatch) {
        endpoints.push({
          method: expressMatch[1].toUpperCase(),
          path: this.normalizePath(expressMatch[2]),
          description: this.extractDescription(lines, i),
          file: filePath,
        });
        continue;
      }

      // Next.js App Router: export async function GET/POST(...)
      const nextMatch = line.match(/^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\s*\(/);
      if (nextMatch) {
        const routePath = this.nextjsPathFromFile(filePath);
        endpoints.push({
          method: nextMatch[1],
          path: routePath,
          description: `Next.js route handler in ${filePath}`,
          file: filePath,
        });
        continue;
      }

      // FastAPI: @app.get('/path') or @router.post('/path')
      const fastapiMatch = line.match(/@(?:app|router)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (fastapiMatch) {
        endpoints.push({
          method: fastapiMatch[1].toUpperCase(),
          path: this.normalizePath(fastapiMatch[2]),
          description: this.extractDescription(lines, i + 1),
          file: filePath,
        });
        continue;
      }

      // NestJS decorators: @Get('/path'), @Post('/path')
      const nestMatch = line.match(/@(Get|Post|Put|Patch|Delete|Head)\s*\(\s*['"`]?([^'"`)\s]*)['"`]?\s*\)/);
      if (nestMatch) {
        endpoints.push({
          method: nestMatch[1].toUpperCase(),
          path: this.normalizePath(nestMatch[2] || '/'),
          description: `NestJS endpoint in ${filePath}`,
          file: filePath,
        });
        continue;
      }

      // Laravel: Route::get('/path', ...) or Route::post('/path', ...)
      const laravelMatch = line.match(/Route::(get|post|put|patch|delete|any)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (laravelMatch) {
        endpoints.push({
          method: laravelMatch[1].toUpperCase(),
          path: this.normalizePath(laravelMatch[2]),
          description: `Laravel route in ${filePath}`,
          file: filePath,
        });
      }
    }

    return endpoints;
  }

  private normalizePath(p: string): string {
    if (!p.startsWith('/')) p = '/' + p;
    return p.replace(/\/+/g, '/');
  }

  private nextjsPathFromFile(filePath: string): string {
    // Convert file path like app/api/users/route.ts to /api/users
    const normalized = filePath.replace(/\\/g, '/');
    const match = normalized.match(/app\/(.*?)\/route\.[jt]sx?$/);
    if (match) return '/' + match[1];
    const pagesMatch = normalized.match(/pages\/(api\/.*?)\.[jt]sx?$/);
    if (pagesMatch) return '/' + pagesMatch[1];
    return '/' + path.basename(filePath, path.extname(filePath));
  }

  private extractDescription(lines: string[], lineIndex: number): string {
    // Look at the line before for a JSDoc comment
    for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 3); i--) {
      const line = lines[i].trim();
      if (line.startsWith('*') || line.startsWith('//')) {
        return line.replace(/^[/*\s]+/, '').slice(0, 80);
      }
    }
    return '';
  }
}
