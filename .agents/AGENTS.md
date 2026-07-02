# Context Optimizer Project Rules

## Project Overview
This repository contains the **Context Optimizer** VS Code extension, which automatically scans, caches, and compresses codebase structures into token-optimized AI prompts.

## Technology Stack
- **Core:** TypeScript, Node.js, VS Code Extension API.
- **Bundling:** Fast CJS bundling using `esbuild` ([esbuild.js](file:///d:/context-optimizer/esbuild.js)).
- **Key Dependencies:** `gpt-tokenizer`, `ignore`, `micromatch`.

## Coding Style & Patterns
- Keep logic modular. Separate concerns into `src/core` (caching, scanning, compression) and `src/analyzers` (static language & route analysis).
- Respect file exclusion settings and file priority classifications (`critical`, `high`, `medium`, `low`) during code modifications.
- When adding commands, ensure they are registered in both `package.json` contributes/commands and `src/extension.ts`.
- Maintain fast build execution. The main production entry point is `dist/extension.js`, which is generated via `npm run build`.

## AI Context Optimization
- The extension exports compressed summaries to the `.vscode/context-optimizer/exports/` directory.
- Refer to `exports/context.md` or `exports/optimized_prompt.txt` to align prompt context when starting development sessions.
