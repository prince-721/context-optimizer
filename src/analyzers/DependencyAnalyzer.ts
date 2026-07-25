import * as path from 'path';
import { readFileSafe } from '../utils/fileUtils';
import { FRAMEWORK_HINTS } from '../utils/constants';
import { ProjectMemory } from '../core/MemoryManager';
import { logger } from '../utils/logger';

interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export class DependencyAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async analyze(): Promise<Partial<ProjectMemory>> {
    const result: Partial<ProjectMemory> = {
      dependencies: { production: {}, development: {}, frameworks: [] },
      project: { name: '', description: '', goals: [], version: '' },
      stack: { frontend: '', backend: '', database: '', auth: '', devOps: '', other: [] },
      features: { completed: [], pending: [], inProgress: [] },
    };

    // Try package.json (Node.js)
    await this.analyzePackageJson(result);

    // Try requirements.txt (Python)
    await this.analyzeRequirements(result);

    // Try Cargo.toml (Rust)
    await this.analyzeCargo(result);

    // Try go.mod (Go)
    await this.analyzeGoMod(result);

    // Try README feature extraction
    await this.analyzeReadmeFeatures(result);

    return result;
  }

  private async analyzePackageJson(result: Partial<ProjectMemory>): Promise<void> {
    const pkgPath = path.join(this.workspaceRoot, 'package.json');
    const content = await readFileSafe(pkgPath);
    if (!content) return;

    try {
      const pkg = JSON.parse(content) as PackageJson;

      if (result.project) {
        result.project.name = pkg.name ?? path.basename(this.workspaceRoot);
        result.project.version = pkg.version ?? '';
        result.project.description = pkg.description ?? '';
      }

      const prod = pkg.dependencies ?? {};
      const dev = pkg.devDependencies ?? {};
      const scripts = pkg.scripts ?? {};

      if (result.dependencies) {
        result.dependencies.production = prod;
        result.dependencies.development = dev;
        result.dependencies.frameworks = this.detectFrameworks({ ...prod, ...dev });
      }

      // Infer stack from frameworks & dependencies
      this.inferStack(result, { ...prod, ...dev });

      // Auto-extract features from package.json scripts
      this.extractFeaturesFromScripts(result, scripts);

      logger.info(`DependencyAnalyzer: Parsed package.json for "${pkg.name}"`);
    } catch (err) {
      logger.warn('DependencyAnalyzer: Failed to parse package.json');
    }
  }

  private extractFeaturesFromScripts(result: Partial<ProjectMemory>, scripts: Record<string, string>): void {
    if (!result.features) return;

    const scriptNames = Object.keys(scripts);
    const completedSet = new Set(result.features.completed || []);
    const pendingSet = new Set(result.features.pending || []);

    if (scriptNames.includes('build') || scriptNames.includes('package') || scriptNames.includes('compile')) {
      completedSet.add('Build Pipeline & Code Compilation');
    }
    if (scriptNames.includes('test')) {
      completedSet.add('Automated Test Suite Runner');
    }
    if (scriptNames.includes('lint')) {
      completedSet.add('Static Code Analysis & Linting');
    }
    if (scriptNames.includes('dev') || scriptNames.includes('watch') || scriptNames.includes('start')) {
      completedSet.add('Local Dev Environment Setup');
    }

    result.features.completed = Array.from(completedSet);
    result.features.pending = Array.from(pendingSet);
  }

  private async analyzeReadmeFeatures(result: Partial<ProjectMemory>): Promise<void> {
    const readmePath = path.join(this.workspaceRoot, 'README.md');
    const content = await readFileSafe(readmePath);
    if (!content || !result.features) return;

    const completedSet = new Set(result.features.completed || []);
    const pendingSet = new Set(result.features.pending || []);

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Checkbox features
      const checkedMatch = trimmed.match(/^-\s*\[x\]\s*(.+)/i);
      if (checkedMatch) {
        completedSet.add(checkedMatch[1].replace(/[*`_]/g, '').trim());
      }
      const uncheckedMatch = trimmed.match(/^-\s*\[\s*\]\s*(.+)/i);
      if (uncheckedMatch) {
        pendingSet.add(uncheckedMatch[1].replace(/[*`_]/g, '').trim());
      }
    }

    result.features.completed = Array.from(completedSet);
    result.features.pending = Array.from(pendingSet);
  }

  private async analyzeRequirements(result: Partial<ProjectMemory>): Promise<void> {
    const reqPath = path.join(this.workspaceRoot, 'requirements.txt');
    const content = await readFileSafe(reqPath);
    if (!content) return;

    const packages: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [name, version] = trimmed.split('==');
      if (name) packages[name.trim()] = version?.trim() ?? '*';
    }

    if (result.dependencies) {
      Object.assign(result.dependencies.production, packages);
    }

    // Detect Python frameworks
    const allPkgs = Object.keys(packages);
    if (allPkgs.some(p => p.toLowerCase() === 'fastapi')) {
      if (result.stack) result.stack.backend = 'Python FastAPI';
    } else if (allPkgs.some(p => p.toLowerCase() === 'django')) {
      if (result.stack) result.stack.backend = 'Python Django';
    } else if (allPkgs.some(p => p.toLowerCase() === 'flask')) {
      if (result.stack) result.stack.backend = 'Python Flask';
    } else if (result.stack && !result.stack.backend) {
      result.stack.backend = 'Python';
    }
  }

  private async analyzeCargo(result: Partial<ProjectMemory>): Promise<void> {
    const cargoPath = path.join(this.workspaceRoot, 'Cargo.toml');
    const content = await readFileSafe(cargoPath);
    if (!content) return;

    const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
    const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);

    if (result.project) {
      if (nameMatch && !result.project.name) result.project.name = nameMatch[1];
      if (versionMatch && !result.project.version) result.project.version = versionMatch[1];
    }
    if (result.stack) result.stack.backend = 'Rust';
  }

  private async analyzeGoMod(result: Partial<ProjectMemory>): Promise<void> {
    const goModPath = path.join(this.workspaceRoot, 'go.mod');
    const content = await readFileSafe(goModPath);
    if (!content) return;

    const moduleMatch = content.match(/^module\s+(.+)/m);
    if (moduleMatch && result.project && !result.project.name) {
      result.project.name = moduleMatch[1].split('/').pop() ?? moduleMatch[1];
    }
    if (result.stack) result.stack.backend = 'Go';
  }

  private detectFrameworks(allDeps: Record<string, string>): string[] {
    const detected: string[] = [];
    for (const [framework, hints] of Object.entries(FRAMEWORK_HINTS)) {
      if (hints.some(hint => allDeps[hint] !== undefined)) {
        detected.push(framework);
      }
    }
    return detected;
  }

  private inferStack(result: Partial<ProjectMemory>, allDeps: Record<string, string>): void {
    if (!result.stack) return;

    const deps = Object.keys(allDeps);

    // Frontend
    if (deps.includes('next')) result.stack.frontend = 'Next.js (React)';
    else if (deps.includes('nuxt')) result.stack.frontend = 'Nuxt.js (Vue)';
    else if (deps.includes('@sveltejs/kit')) result.stack.frontend = 'SvelteKit';
    else if (deps.includes('react-dom') || deps.includes('react')) result.stack.frontend = 'React';
    else if (deps.includes('vue')) result.stack.frontend = 'Vue.js';
    else if (deps.includes('@angular/core')) result.stack.frontend = 'Angular';
    else if (deps.includes('svelte')) result.stack.frontend = 'Svelte';
    else if (deps.includes('@types/vscode') || deps.includes('vscode')) result.stack.frontend = 'VS Code API / Webviews';
    else if (deps.includes('electron')) result.stack.frontend = 'Electron Desktop UI';
    else result.stack.frontend = 'Vanilla HTML/CSS/JS';

    if (deps.includes('tailwindcss') && result.stack.frontend) {
      result.stack.frontend += ' + Tailwind CSS';
    }

    // Backend
    if (!result.stack.backend) {
      if (deps.includes('@nestjs/core')) result.stack.backend = 'Node.js NestJS';
      else if (deps.includes('express')) result.stack.backend = 'Node.js Express';
      else if (deps.includes('fastify')) result.stack.backend = 'Node.js Fastify';
      else if (deps.includes('hono')) result.stack.backend = 'Node.js Hono';
      else if (deps.includes('@types/vscode') || deps.includes('vscode')) result.stack.backend = 'Node.js + VS Code Extension Engine (TypeScript)';
      else if (deps.includes('typescript')) result.stack.backend = 'Node.js (TypeScript)';
      else result.stack.backend = 'Node.js (JavaScript)';
    }

    // Database
    if (deps.includes('mongoose')) result.stack.database = 'MongoDB (Mongoose)';
    else if (deps.includes('@prisma/client') || deps.includes('prisma')) result.stack.database = 'Prisma ORM';
    else if (deps.includes('typeorm')) result.stack.database = 'TypeORM';
    else if (deps.includes('drizzle-orm')) result.stack.database = 'Drizzle ORM';
    else if (deps.includes('@supabase/supabase-js')) result.stack.database = 'Supabase';
    else if (deps.includes('firebase')) result.stack.database = 'Firebase';
    else if (deps.includes('pg')) result.stack.database = 'PostgreSQL';
    else if (deps.includes('mysql2') || deps.includes('mysql')) result.stack.database = 'MySQL';
    else if (deps.includes('sqlite3') || deps.includes('better-sqlite3')) result.stack.database = 'SQLite';
    else result.stack.database = 'File System JSON Storage';

    // Auth
    if (deps.includes('jsonwebtoken') || deps.includes('jose')) result.stack.auth = 'JWT';
    else if (deps.includes('passport')) result.stack.auth = 'Passport.js';
    else if (deps.includes('next-auth') || deps.includes('@auth/core')) result.stack.auth = 'NextAuth';
    else if (deps.includes('@clerk/nextjs') || deps.includes('@clerk/clerk-sdk-node')) result.stack.auth = 'Clerk';
    else if (deps.includes('firebase-admin')) result.stack.auth = 'Firebase Auth';

    // DevOps
    if (deps.includes('docker')) result.stack.devOps = 'Docker';
    else if (deps.includes('esbuild')) result.stack.devOps = 'esbuild Fast Bundler';
    else if (deps.includes('vite')) result.stack.devOps = 'Vite Build System';
    else if (deps.includes('webpack')) result.stack.devOps = 'Webpack Bundler';
  }
}
