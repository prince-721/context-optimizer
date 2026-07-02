import * as path from 'path';
import { MemoryManager, ProjectMemory } from '../core/MemoryManager';
import { writeJsonFile, ensureDir } from '../utils/fileUtils';

export class JsonExporter {
  constructor(private memoryManager: MemoryManager) {}

  exportFull(): string {
    const mem = this.memoryManager.get();
    const outputPath = path.join(this.memoryManager.getExportsDir(), 'context.json');
    writeJsonFile(outputPath, mem, true);
    return outputPath;
  }

  exportMinified(): string {
    const mem = this.memoryManager.get();
    const mini = this.buildMinified(mem);
    const outputPath = path.join(this.memoryManager.getExportsDir(), 'context.min.json');
    writeJsonFile(outputPath, mini, false);
    return outputPath;
  }

  private buildMinified(mem: ProjectMemory): object {
    return {
      name: mem.project.name,
      v: mem.project.version,
      stack: {
        fe: mem.stack.frontend,
        be: mem.stack.backend,
        db: mem.stack.database,
        auth: mem.stack.auth,
      },
      fw: mem.dependencies.frameworks,
      api: mem.api.endpoints.map(e => ({ m: e.method, p: e.path, d: e.description })),
      env: mem.environment.variables,
      dbModels: mem.database.models,
      done: mem.features.completed,
      todo: mem.features.pending,
      wip: mem.features.inProgress,
      bugs: mem.bugs,
      style: mem.codingStyle.patterns,
      rules: mem.rules,
      notes: mem.developerNotes.slice(0, 10),
      arch: mem.architecture.summary,
      decisions: mem.architecture.decisions,
      keyFiles: mem.files
        .filter(f => f.priority === 'critical' || f.priority === 'high')
        .map(f => ({ p: f.path, s: f.summary }))
        .slice(0, 20),
      tokens: mem.meta.tokenEstimate,
      updated: mem.meta.lastUpdated,
    };
  }
}
