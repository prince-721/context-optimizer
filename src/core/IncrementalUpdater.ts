import * as path from 'path';
import { MemoryManager, FileRecord } from './MemoryManager';
import { ProjectScanner, ScannedFile } from './ProjectScanner';
import { FileAnalyzer } from './FileAnalyzer';
import { readFileSafe, getExtension } from '../utils/fileUtils';
import { sha256 } from '../utils/constants';
import { logger } from '../utils/logger';

export interface UpdateResult {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  totalProcessed: number;
}

/**
 * Incrementally updates the project memory.
 * Only re-analyzes files whose SHA-256 hash has changed since the last analysis.
 */
export class IncrementalUpdater {
  constructor(
    private memoryManager: MemoryManager,
    private scanner: ProjectScanner,
    private analyzer: FileAnalyzer
  ) {}

  /**
   * Scan the project and analyze only changed files.
   * Returns a summary of what was updated.
   */
  async update(onProgress?: (current: number, total: number, fileName: string) => void): Promise<UpdateResult> {
    const scanResult = await this.scanner.scan();
    const allFiles = scanResult.files;

    const result: UpdateResult = { added: 0, updated: 0, unchanged: 0, skipped: 0, totalProcessed: 0 };

    // Process critical + high priority files thoroughly, others lightly
    const prioritized = [
      ...allFiles.filter(f => f.priority === 'critical' || f.priority === 'high'),
      ...allFiles.filter(f => f.priority === 'medium'),
      ...allFiles.filter(f => f.priority === 'low').slice(0, 100), // Cap low-priority
    ];

    for (let i = 0; i < prioritized.length; i++) {
      const file = prioritized[i];
      onProgress?.(i + 1, prioritized.length, path.basename(file.absolutePath));

      try {
        const content = await readFileSafe(file.absolutePath);
        if (!content) { result.skipped++; continue; }

        const newHash = sha256(content);
        const existing = this.memoryManager.getFileRecord(file.relativePath);

        if (existing && existing.hash === newHash) {
          result.unchanged++;
          continue;
        }

        const record = await this.analyzer.analyzeFile(file);
        if (!record) { result.skipped++; continue; }

        this.memoryManager.upsertFileRecord(record);

        if (existing) {
          result.updated++;
        } else {
          result.added++;
        }
      } catch (err) {
        logger.warn(`IncrementalUpdater: Failed to process ${file.relativePath}`);
        result.skipped++;
      }

      result.totalProcessed++;
    }

    // Update structural metadata
    const mem = this.memoryManager.get();
    mem.structure.rootFolders = scanResult.rootFolders;
    mem.structure.mainEntryPoints = scanResult.mainEntryPoints;
    mem.structure.totalFiles = scanResult.totalFiles;
    mem.structure.analyzedFiles = result.added + result.updated + result.unchanged;
    this.memoryManager.save();

    logger.success(
      `Update complete: +${result.added} new, ~${result.updated} updated, =${result.unchanged} unchanged, ✗${result.skipped} skipped`
    );

    return result;
  }

  /** Check if a single file has changed and update it if so */
  async updateSingleFile(absolutePath: string, relativePath: string): Promise<boolean> {
    const content = await readFileSafe(absolutePath);
    if (!content) return false;

    const newHash = sha256(content);
    const existing = this.memoryManager.getFileRecord(relativePath);

    if (existing && existing.hash === newHash) return false;

    // Re-scan just this file
    const ext = getExtension(absolutePath);

    // Create a minimal ScannedFile for the analyzer
    const scannedFile: ScannedFile = {
      absolutePath,
      relativePath,
      priority: 'medium',
      extension: ext,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      language: ext.toUpperCase(),
    };

    const record = await this.analyzer.analyzeFile(scannedFile);
    if (record) {
      this.memoryManager.upsertFileRecord(record);
      return true;
    }
    return false;
  }
}
