// src/utils/tokenizer.ts

/**
 * Rough token estimation using GPT-style tokenization heuristics.
 * 1 token ≈ 4 characters for English text.
 * Symbols and code may differ; we bias slightly conservative.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count words and punctuation segments separately
  const words = text.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const word of words) {
    // Long words or code tokens get split further
    if (word.length <= 4) count += 1;
    else if (word.length <= 8) count += 2;
    else count += Math.ceil(word.length / 4);
  }
  return Math.max(1, count);
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function calcSavings(original: number, compressed: number): number {
  if (original === 0) return 0;
  return Math.round(((original - compressed) / original) * 1000) / 10;
}
