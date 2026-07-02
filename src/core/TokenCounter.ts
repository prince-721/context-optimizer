import { CHARS_PER_TOKEN, formatTokens } from '../utils/constants';

export interface TokenStats {
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  savedPercent: number;
  originalFormatted: string;
  compressedFormatted: string;
  savedFormatted: string;
}

/**
 * Token counter using a simple character-based approximation.
 * Uses ~4 chars/token which is accurate for English/code content.
 * Falls back gracefully if gpt-tokenizer is unavailable.
 */
export class TokenCounter {
  private tokenizer: ((text: string) => number[]) | null = null;

  constructor() {
    // Try to load gpt-tokenizer for more accurate counts
    try {
      // Dynamic require to handle cases where the package may not be installed yet
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { encode } = require('gpt-tokenizer');
      this.tokenizer = encode;
    } catch {
      // Fallback to character estimation
      this.tokenizer = null;
    }
  }

  /** Count tokens in a string */
  count(text: string): number {
    if (!text) return 0;
    if (this.tokenizer) {
      try {
        return this.tokenizer(text).length;
      } catch {
        // fallback
      }
    }
    // Fallback: ~4 chars per token (reasonable approximation)
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /** Compute stats between original and compressed text */
  compare(originalText: string, compressedText: string): TokenStats {
    const original = this.count(originalText);
    const compressed = this.count(compressedText);
    const saved = Math.max(0, original - compressed);
    const savedPercent = original > 0 ? Math.round((saved / original) * 1000) / 10 : 0;

    return {
      originalTokens: original,
      compressedTokens: compressed,
      savedTokens: saved,
      savedPercent,
      originalFormatted: formatTokens(original),
      compressedFormatted: formatTokens(compressed),
      savedFormatted: formatTokens(saved),
    };
  }

  /** Format stats as a readable string */
  formatStats(stats: TokenStats): string {
    return (
      `Original: ${stats.originalFormatted} tokens\n` +
      `Compressed: ${stats.compressedFormatted} tokens\n` +
      `Saved: ${stats.savedFormatted} tokens (${stats.savedPercent}%)`
    );
  }
}
