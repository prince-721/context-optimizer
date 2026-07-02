import * as path from 'path';
import * as fs from 'fs';
import { readFileSafe } from '../utils/fileUtils';
import { logger } from '../utils/logger';

export class EnvAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async analyze(): Promise<string[]> {
    const candidates = [
      '.env.example',
      '.env.sample',
      '.env.local.example',
      '.env.template',
      '.env.schema',
    ];

    for (const candidate of candidates) {
      const filePath = path.join(this.workspaceRoot, candidate);
      if (fs.existsSync(filePath)) {
        const vars = await this.parseEnvFile(filePath);
        if (vars.length > 0) {
          logger.info(`EnvAnalyzer: Found ${vars.length} variables in ${candidate}`);
          return vars;
        }
      }
    }

    // If no .env.example exists, try scanning .env (names only, strip values)
    const envPath = path.join(this.workspaceRoot, '.env');
    if (fs.existsSync(envPath)) {
      const vars = await this.parseEnvFile(envPath);
      logger.info(`EnvAnalyzer: Inferred ${vars.length} variables from .env (values omitted for security)`);
      return vars;
    }

    return [];
  }

  private async parseEnvFile(filePath: string): Promise<string[]> {
    const content = await readFileSafe(filePath);
    if (!content) return [];

    const variables: string[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const varName = trimmed.slice(0, eqIdx).trim();
      if (varName && /^[A-Z_][A-Z0-9_]*$/i.test(varName)) {
        variables.push(varName);
      }
    }
    return variables;
  }
}
