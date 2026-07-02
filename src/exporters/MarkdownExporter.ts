import * as path from 'path';
import { MemoryManager } from '../core/MemoryManager';
import { ContextCompressor } from '../core/ContextCompressor';
import { writeTextFile } from '../utils/fileUtils';

export class MarkdownExporter {
  constructor(
    private memoryManager: MemoryManager,
    private compressor: ContextCompressor
  ) {}

  export(): string {
    const mem = this.memoryManager.get();
    const outputPath = path.join(this.memoryManager.getExportsDir(), 'context.md');
    const content = this.compressor.generateOptimizedPrompt(mem);
    writeTextFile(outputPath, content);
    return outputPath;
  }
}
