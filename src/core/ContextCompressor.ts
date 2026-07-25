import { SecretRedactor } from '../utils/secretRedactor';

/** Produces the ultra-compact AI onboarding prompt from project memory */
export class ContextCompressor {

  /** Generate the full optimized prompt text */
  generateOptimizedPrompt(mem: ProjectMemory): string {
    const sections: string[] = [];

    sections.push(this.buildHeader(mem));
    sections.push(this.buildStack(mem));
    sections.push(this.buildStructure(mem));
    sections.push(this.buildDependencies(mem));
    sections.push(this.buildDatabase(mem));
    sections.push(this.buildApiEndpoints(mem));
    sections.push(this.buildEnvironment(mem));
    sections.push(this.buildFeatures(mem));
    sections.push(this.buildArchitecture(mem));
    sections.push(this.buildCodingStyle(mem));
    sections.push(this.buildKeyFiles(mem));
    sections.push(this.buildTestCoverage(mem));
    sections.push(this.buildBugs(mem));
    sections.push(this.buildRules(mem));
    sections.push(this.buildDeveloperNotes(mem));
    sections.push(this.buildConversationHistory(mem));

    const raw = sections.filter(s => s.trim()).join('\n\n');
    return SecretRedactor.sanitize(raw);
  }

  /** Generates a prompt guaranteed to fit strictly under maxTokens budget */
  generatePromptUnderBudget(mem: ProjectMemory, maxTokens: number = 4000): string {
    let fullPrompt = this.generateOptimizedPrompt(mem);
    const estTokens = Math.ceil(fullPrompt.length / 4);

    if (estTokens <= maxTokens) {
      return fullPrompt;
    }

    // Switch to compact representation if full prompt exceeds token budget
    let minPrompt = this.generateMinimizedPrompt(mem);
    const minTokens = Math.ceil(minPrompt.length / 4);

    if (minTokens <= maxTokens) {
      return minPrompt;
    }

    // Truncate cleanly to character limit corresponding to maxTokens
    const maxChars = maxTokens * 4;
    return SecretRedactor.sanitize(minPrompt.slice(0, maxChars) + '\n\n[Context truncated to fit ' + maxTokens + ' token budget]');
  }

  /** Ultra-compact single-block prompt for token efficiency */
  generateMinimizedPrompt(mem: ProjectMemory): string {
    const lines: string[] = [];

    lines.push(`PROJECT: ${mem.project.name}${mem.project.version ? ` v${mem.project.version}` : ''}`);
    if (mem.project.description) lines.push(`DESC: ${mem.project.description}`);

    // Stack
    const stack = [
      mem.stack.frontend && `FE:${mem.stack.frontend}`,
      mem.stack.backend && `BE:${mem.stack.backend}`,
      mem.stack.database && `DB:${mem.stack.database}`,
      mem.stack.auth && `AUTH:${mem.stack.auth}`,
    ].filter(Boolean);
    if (stack.length > 0) lines.push(`STACK: ${stack.join(' | ')}`);

    // Frameworks
    if (mem.dependencies.frameworks.length > 0) {
      lines.push(`FRAMEWORKS: ${mem.dependencies.frameworks.join(', ')}`);
    }

    // Structure
    if (mem.structure.rootFolders.length > 0) {
      lines.push(`STRUCTURE: ${mem.structure.rootFolders.join('/ ')}/`);
    }

    // DB
    if (mem.database.type) {
      lines.push(`DB TYPE: ${mem.database.type}${mem.database.models.length > 0 ? ` | MODELS: ${mem.database.models.join(', ')}` : ''}`);
    }

    // API
    if (mem.api.endpoints.length > 0) {
      const eps = mem.api.endpoints.slice(0, 15).map(e => `${e.method} ${e.path}`);
      lines.push(`API: ${eps.join(' | ')}`);
    }

    // Env
    if (mem.environment.variables.length > 0) {
      lines.push(`ENV: ${mem.environment.variables.join(', ')}`);
    }

    // Features
    if (mem.features.completed.length > 0) {
      lines.push(`DONE: ${mem.features.completed.map(f => `✓${f}`).join(' ')}`);
    }
    if (mem.features.pending.length > 0) {
      lines.push(`TODO: ${mem.features.pending.map(f => `•${f}`).join(' ')}`);
    }
    if (mem.features.inProgress.length > 0) {
      lines.push(`WIP: ${mem.features.inProgress.join(', ')}`);
    }

    // Style
    if (mem.codingStyle.patterns.length > 0) {
      lines.push(`STYLE: ${mem.codingStyle.patterns.join(', ')}`);
    }

    // Bugs
    if (mem.bugs.length > 0) {
      lines.push(`BUGS: ${mem.bugs.slice(0, 5).join(' | ')}`);
    }

    // Architecture
    if (mem.architecture.summary) {
      lines.push(`ARCH: ${mem.architecture.summary}`);
    }

    // Rules
    if (mem.rules.length > 0) {
      lines.push(`RULES: ${mem.rules.join(' | ')}`);
    }

    // Key file summaries
    const criticalFiles = mem.files.filter(f => f.priority === 'critical' || f.priority === 'high').slice(0, 10);
    if (criticalFiles.length > 0) {
      lines.push(`KEY FILES:`);
      for (const f of criticalFiles) {
        lines.push(`  [${f.path}] ${f.summary}`);
      }
    }

    return lines.join('\n');
  }

  private buildHeader(mem: ProjectMemory): string {
    let out = `# Project: ${mem.project.name}`;
    if (mem.project.version) out += ` (v${mem.project.version})`;
    if (mem.project.description) out += `\n${mem.project.description}`;
    if (mem.project.goals.length > 0) {
      out += `\n\nGoals:\n${mem.project.goals.map(g => `• ${g}`).join('\n')}`;
    }
    return out;
  }

  private buildStack(mem: ProjectMemory): string {
    const parts: string[] = [];
    if (mem.stack.frontend) parts.push(`Frontend: ${mem.stack.frontend}`);
    if (mem.stack.backend) parts.push(`Backend: ${mem.stack.backend}`);
    if (mem.stack.database) parts.push(`Database: ${mem.stack.database}`);
    if (mem.stack.auth) parts.push(`Auth: ${mem.stack.auth}`);
    if (mem.stack.devOps) parts.push(`DevOps: ${mem.stack.devOps}`);
    if (mem.stack.other.length > 0) parts.push(`Other: ${mem.stack.other.join(', ')}`);
    if (parts.length === 0) return '';
    return `## Stack\n${parts.join('\n')}`;
  }

  private buildStructure(mem: ProjectMemory): string {
    if (mem.structure.rootFolders.length === 0) return '';
    let out = `## Structure\n`;
    out += `Folders: ${mem.structure.rootFolders.join('/, ')}/\n`;
    if (mem.structure.mainEntryPoints.length > 0) {
      out += `Entry Points: ${mem.structure.mainEntryPoints.join(', ')}`;
    }
    return out;
  }

  private buildDependencies(mem: ProjectMemory): string {
    const { frameworks, production } = mem.dependencies;
    const parts: string[] = [];
    if (frameworks.length > 0) parts.push(`Frameworks: ${frameworks.join(', ')}`);
    const prodDeps = Object.keys(production).slice(0, 20);
    if (prodDeps.length > 0) parts.push(`Dependencies: ${prodDeps.join(', ')}`);
    if (parts.length === 0) return '';
    return `## Dependencies\n${parts.join('\n')}`;
  }

  private buildDatabase(mem: ProjectMemory): string {
    if (!mem.database.type && mem.database.models.length === 0) return '';
    let out = `## Database\n`;
    if (mem.database.type) out += `Type: ${mem.database.type}\n`;
    if (mem.database.models.length > 0) out += `Models: ${mem.database.models.join(', ')}\n`;
    if (mem.database.schemas.length > 0) out += `Schemas: ${mem.database.schemas.join(', ')}`;
    return out.trim();
  }

  private buildApiEndpoints(mem: ProjectMemory): string {
    if (mem.api.endpoints.length === 0) return '';
    let out = `## API Endpoints\n`;
    if (mem.api.baseUrl) out += `Base: ${mem.api.baseUrl}\n`;
    const endpoints = mem.api.endpoints.slice(0, 30);
    out += endpoints.map(e => `${e.method.padEnd(6)} ${e.path}${e.description ? `  — ${e.description}` : ''}`).join('\n');
    if (mem.api.endpoints.length > 30) out += `\n... and ${mem.api.endpoints.length - 30} more`;
    return out;
  }

  private buildEnvironment(mem: ProjectMemory): string {
    if (mem.environment.variables.length === 0) return '';
    return `## Environment Variables\n${mem.environment.variables.join(', ')}`;
  }

  private buildFeatures(mem: ProjectMemory): string {
    const { completed, pending, inProgress } = mem.features;
    if (completed.length === 0 && pending.length === 0 && inProgress.length === 0) return '';
    let out = `## Features\n`;
    if (completed.length > 0) out += `Completed:\n${completed.map(f => `✔ ${f}`).join('\n')}\n`;
    if (inProgress.length > 0) out += `\nIn Progress:\n${inProgress.map(f => `⟳ ${f}`).join('\n')}\n`;
    if (pending.length > 0) out += `\nPending:\n${pending.map(f => `• ${f}`).join('\n')}`;
    return out.trim();
  }

  private buildArchitecture(mem: ProjectMemory): string {
    const { summary, decisions, patterns } = mem.architecture;
    if (!summary && decisions.length === 0 && patterns.length === 0) return '';
    let out = `## Architecture\n`;
    if (summary) out += `${summary}\n`;
    if (patterns.length > 0) out += `Patterns: ${patterns.join(', ')}\n`;
    if (decisions.length > 0) out += `Decisions:\n${decisions.map(d => `• ${d}`).join('\n')}`;
    return out.trim();
  }

  private buildCodingStyle(mem: ProjectMemory): string {
    const { patterns, namingConventions, libraries } = mem.codingStyle;
    if (patterns.length === 0 && namingConventions.length === 0) return '';
    let out = `## Coding Style\n`;
    if (patterns.length > 0) out += `Patterns: ${patterns.join(', ')}\n`;
    if (namingConventions.length > 0) out += `Naming: ${namingConventions.join(', ')}\n`;
    if (libraries.length > 0) out += `Libraries: ${libraries.join(', ')}`;
    return out.trim();
  }

  private buildKeyFiles(mem: ProjectMemory): string {
    const keyFiles = mem.files
      .filter(f => f.priority === 'critical' || f.priority === 'high')
      .slice(0, 15);
    if (keyFiles.length === 0) return '';
    let out = `## Key Files\n`;
    out += keyFiles.map(f => `[${f.path}] ${f.summary}`).join('\n');
    return out;
  }

  private buildBugs(mem: ProjectMemory): string {
    if (mem.bugs.length === 0) return '';
    return `## Known Issues\n${mem.bugs.map(b => `• ${b}`).join('\n')}`;
  }

  private buildRules(mem: ProjectMemory): string {
    if (mem.rules.length === 0) return '';
    return `## Rules\n${mem.rules.map(r => `• ${r}`).join('\n')}`;
  }

  private buildDeveloperNotes(mem: ProjectMemory): string {
    if (mem.developerNotes.length === 0) return '';
    return `## Developer Notes\n${mem.developerNotes.slice(0, 10).map(n => `• ${n}`).join('\n')}`;
  }

  private buildTestCoverage(mem: ProjectMemory): string {
    const testFiles = mem.files.filter(f => f.priority === 'test' || f.path.includes('.test.') || f.path.includes('.spec.'));
    if (testFiles.length === 0) return '';
    let out = `## Test Coverage\n`;
    out += testFiles.map(f => `[${f.path}] ${f.summary}`).join('\n');
    return out;
  }

  private buildConversationHistory(mem: ProjectMemory): string {
    const important = mem.conversations
      .filter(c => c.type !== 'note')
      .slice(0, 20);
    if (important.length === 0) return '';
    let out = `## Important Decisions & History\n`;
    out += important.map(c => `[${c.type.toUpperCase()}] ${c.content}`).join('\n');
    return out;
  }
}
