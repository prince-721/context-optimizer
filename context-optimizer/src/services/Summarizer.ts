// src/services/Summarizer.ts
import * as path from 'path';
import {
  ApiEndpoint,
  DatabaseInfo,
  DependencyInfo,
  EnvVariable,
  FunctionSummary,
  CodingStyle,
  Library,
} from '../types';

export class Summarizer {
  summarizeFile(filePath: string, content: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath).toLowerCase();

    if (name === 'package.json') return this.summarizePackageJson(content);
    if (name.endsWith('.env.example') || name === '.env') return this.summarizeEnv(content);
    if (name === 'readme.md') return this.summarizeReadme(content);
    if (ext === '.prisma') return this.summarizePrisma(content);
    if (name.includes('schema') && (ext === '.sql' || ext === '.js' || ext === '.ts')) return this.summarizeSchema(content);
    if (name.includes('route') || name.includes('router')) return this.summarizeRoutes(content);
    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') return this.summarizeCode(content, filePath);
    if (ext === '.json') return this.summarizeJson(content);
    if (ext === '.yml' || ext === '.yaml') return this.summarizeYaml(content, filePath);

    // Generic: first 500 chars stripped of whitespace
    const stripped = content.replace(/\s+/g, ' ').trim();
    return stripped.length > 300 ? stripped.slice(0, 300) + '…' : stripped;
  }

  private summarizePackageJson(content: string): string {
    try {
      const pkg = JSON.parse(content);
      const deps = Object.keys(pkg.dependencies ?? {}).join(', ');
      const scripts = Object.keys(pkg.scripts ?? {}).join(', ');
      return `Package: ${pkg.name}@${pkg.version}. Main: ${pkg.main ?? 'index.js'}. Scripts: [${scripts}]. Deps: ${deps || 'none'}.`;
    } catch {
      return 'package.json (parse error)';
    }
  }

  private summarizeEnv(content: string): string {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const keys = lines.map(l => l.split('=')[0].trim()).filter(Boolean);
    return `Env vars: ${keys.join(', ')}`;
  }

  private summarizeReadme(content: string): string {
    const lines = content.split('\n');
    const headings = lines.filter(l => l.startsWith('#')).slice(0, 6).map(h => h.replace(/^#+\s*/, '').trim());
    const first = lines.find(l => l.trim() && !l.startsWith('#'))?.slice(0, 150) ?? '';
    return `README sections: ${headings.join(' › ')}. ${first}`;
  }

  private summarizePrisma(content: string): string {
    const models = [...content.matchAll(/model\s+(\w+)\s*\{/g)].map(m => m[1]);
    const enums = [...content.matchAll(/enum\s+(\w+)\s*\{/g)].map(m => m[1]);
    return `Prisma schema. Models: [${models.join(', ')}]. Enums: [${enums.join(', ')}].`;
  }

  private summarizeSchema(content: string): string {
    const tables = [...content.matchAll(/(?:CREATE TABLE|Schema\(['"]?)(\w+)/gi)].map(m => m[1]);
    if (tables.length) return `DB schema. Tables/models: [${tables.join(', ')}].`;
    return 'Database schema file.';
  }

  private summarizeRoutes(content: string): string {
    const routes: string[] = [];
    const patterns = [
      /router\.(get|post|put|patch|delete|use)\(['"]([^'"]+)['"]/gi,
      /app\.(get|post|put|patch|delete|use)\(['"]([^'"]+)['"]/gi,
      /@(Get|Post|Put|Patch|Delete)\(['"]([^'"]+)['"]/gi,
    ];
    for (const p of patterns) {
      let m: RegExpExecArray | null;
      while ((m = p.exec(content)) !== null) {
        routes.push(`${m[1].toUpperCase()} ${m[2]}`);
        if (routes.length >= 20) break;
      }
    }
    return routes.length
      ? `Routes: ${routes.join(', ')}`
      : 'Router file — no explicit routes detected.';
  }

  private summarizeCode(content: string, filePath: string): string {
    const parts: string[] = [];

    // Detect imports
    const imports = [...content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g)].map(m => m[1]).slice(0, 8);
    if (imports.length) parts.push(`Uses: ${imports.join(', ')}`);

    // Detect exports / class names / function names
    const classes = [...content.matchAll(/(?:export\s+)?class\s+(\w+)/g)].map(m => m[1]);
    const functions = [...content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)].map(m => m[1]);
    const arrows = [...content.matchAll(/export\s+const\s+(\w+)\s*=/g)].map(m => m[1]);

    if (classes.length) parts.push(`Classes: [${classes.join(', ')}]`);
    if (functions.length) parts.push(`Functions: [${functions.slice(0, 10).join(', ')}]`);
    if (arrows.length) parts.push(`Exports: [${arrows.slice(0, 10).join(', ')}]`);

    // JSX components
    const jsx = content.includes('return (') && (content.includes('.tsx') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx'));
    if (jsx) parts.push('React component');

    return parts.length ? parts.join('. ') + '.' : `Code file (${Math.ceil(content.split('\n').length)} lines).`;
  }

  private summarizeJson(content: string): string {
    try {
      const obj = JSON.parse(content);
      const keys = Object.keys(obj).slice(0, 10);
      return `JSON: {${keys.join(', ')}${keys.length === 10 ? '…' : ''}}`;
    } catch {
      return 'JSON file.';
    }
  }

  private summarizeYaml(content: string, filePath: string): string {
    const topKeys = content.split('\n').filter(l => l.match(/^[a-zA-Z]/)).slice(0, 8).map(l => l.split(':')[0].trim());
    return `YAML (${path.basename(filePath)}): [${topKeys.join(', ')}]`;
  }

  extractDependencies(packageJsonContent: string): DependencyInfo {
    try {
      const pkg = JSON.parse(packageJsonContent);
      return {
        runtime: pkg.dependencies ?? {},
        dev: pkg.devDependencies ?? {},
        packageManager: pkg.packageManager?.split('@')[0] ?? 'npm',
      };
    } catch {
      return { runtime: {}, dev: {}, packageManager: 'npm' };
    }
  }

  detectFramework(deps: DependencyInfo): string {
    const d = { ...deps.runtime, ...deps.dev };
    if (d['next']) return 'Next.js';
    if (d['nuxt']) return 'Nuxt.js';
    if (d['@angular/core']) return 'Angular';
    if (d['svelte']) return 'Svelte';
    if (d['react']) return d['react-native'] ? 'React Native' : 'React';
    if (d['vue']) return 'Vue.js';
    if (d['express']) return 'Express.js';
    if (d['fastify']) return 'Fastify';
    if (d['@nestjs/core']) return 'NestJS';
    if (d['django'] || d['flask'] || d['fastapi']) return 'Python';
    if (d['spring-boot']) return 'Spring Boot';
    return 'Unknown';
  }

  extractApiEndpoints(content: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const patterns = [
      /router\.(get|post|put|patch|delete)\(['"]([^'"]+)['"],/gi,
      /app\.(get|post|put|patch|delete)\(['"]([^'"]+)['"],/gi,
      /@(Get|Post|Put|Patch|Delete)\(['"]([^'"]+)['"]\)/gi,
    ];

    for (const pattern of patterns) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(content)) !== null) {
        const authRequired = content.toLowerCase().includes('auth') || content.toLowerCase().includes('jwt') || content.toLowerCase().includes('protect');
        endpoints.push({
          method: m[1].toUpperCase(),
          path: m[2],
          description: '',
          auth: authRequired,
        });
        if (endpoints.length >= 50) return endpoints;
      }
    }
    return endpoints;
  }

  extractEnvVars(content: string): EnvVariable[] {
    return content
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#'))
      .map(l => {
        const [key, ...rest] = l.split('=');
        const comment = l.includes('#') ? l.split('#')[1]?.trim() : '';
        return {
          key: key.trim(),
          description: comment || rest.join('=').trim() || 'No description',
          required: !l.includes('optional') && !comment?.toLowerCase().includes('optional'),
        };
      })
      .filter(v => v.key);
  }

  extractFunctions(content: string, filePath: string): FunctionSummary[] {
    const results: FunctionSummary[] = [];
    const pattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      results.push({
        name: m[1],
        file: filePath,
        description: '',
        params: m[2].split(',').map(p => p.trim()).filter(Boolean),
        returns: 'unknown',
      });
      if (results.length >= 20) break;
    }
    return results;
  }

  detectCodingStyle(content: string): Partial<CodingStyle> {
    const style: Partial<CodingStyle> = { patterns: [] };
    if (content.includes('async') && content.includes('await')) {
      style.asyncStyle = 'Async/Await';
    } else if (content.includes('.then(')) {
      style.asyncStyle = 'Promises';
    }
    if (content.includes('React.FC') || content.includes(': FC') || content.match(/const \w+ = \(\)/)) {
      style.components = 'Functional Components';
    } else if (content.includes('extends Component') || content.includes('extends React.Component')) {
      style.components = 'Class Components';
    }
    if (content.includes('useState') || content.includes('useEffect')) {
      style.patterns!.push('React Hooks');
    }
    if (content.includes('redux') || content.includes('useDispatch')) {
      style.stateManagement = 'Redux';
    } else if (content.includes('zustand') || content.includes('create(')) {
      style.stateManagement = 'Zustand';
    } else if (content.includes('useContext') || content.includes('createContext')) {
      style.stateManagement = 'Context API';
    }
    return style;
  }

  extractLibraries(deps: DependencyInfo): Library[] {
    const known: Record<string, string> = {
      react: 'UI framework',
      'react-dom': 'React DOM renderer',
      next: 'Full-stack React framework',
      express: 'HTTP server',
      mongoose: 'MongoDB ODM',
      prisma: 'Type-safe ORM',
      sequelize: 'SQL ORM',
      jsonwebtoken: 'JWT auth',
      bcrypt: 'Password hashing',
      bcryptjs: 'Password hashing',
      axios: 'HTTP client',
      '@tanstack/react-query': 'Server state management',
      'react-query': 'Server state management',
      zod: 'Schema validation',
      yup: 'Schema validation',
      tailwindcss: 'Utility CSS framework',
      sass: 'CSS preprocessor',
      'styled-components': 'CSS-in-JS',
      redux: 'State management',
      zustand: 'Lightweight state management',
      typescript: 'Type-safe JavaScript',
      jest: 'Testing framework',
      vitest: 'Vite testing framework',
      dotenv: 'Env file loader',
      cors: 'CORS middleware',
      helmet: 'Security headers',
      socket: 'WebSockets',
      'socket.io': 'Real-time events',
      stripe: 'Payment processing',
      nodemailer: 'Email sending',
      multer: 'File upload handling',
      sharp: 'Image processing',
    };
    return Object.entries({ ...deps.runtime, ...deps.dev })
      .filter(([name]) => known[name])
      .map(([name, version]) => ({ name, version: String(version), purpose: known[name] }));
  }

  detectDatabase(deps: DependencyInfo): DatabaseInfo {
    const d = { ...deps.runtime, ...deps.dev };
    if (d['mongoose'] || d['mongodb']) return { type: 'MongoDB', schemas: [], orm: 'Mongoose' };
    if (d['prisma'] || d['@prisma/client']) return { type: 'Prisma (SQL)', schemas: [], orm: 'Prisma' };
    if (d['sequelize']) return { type: 'SQL', schemas: [], orm: 'Sequelize' };
    if (d['pg'] || d['postgres']) return { type: 'PostgreSQL', schemas: [], orm: 'pg' };
    if (d['mysql'] || d['mysql2']) return { type: 'MySQL', schemas: [], orm: 'mysql2' };
    if (d['sqlite3'] || d['better-sqlite3']) return { type: 'SQLite', schemas: [], orm: 'sqlite3' };
    if (d['firebase'] || d['firebase-admin']) return { type: 'Firebase Firestore', schemas: [] };
    if (d['@supabase/supabase-js']) return { type: 'Supabase (PostgreSQL)', schemas: [] };
    if (d['redis'] || d['ioredis']) return { type: 'Redis', schemas: [] };
    return { type: 'Unknown', schemas: [] };
  }
}
