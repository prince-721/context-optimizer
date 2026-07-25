# Changelog

All notable changes to the **Context Optimizer** extension will be documented in this file.

## [1.0.0] - 2026-07-24

### Initial Release & Major Upgrades
- 🧠 **AST-Based Code Summarizer (`ts-morph`)**: Precise extraction of TypeScript function signatures, parameter & return types, React component `Props` interfaces, class methods, and exported symbols.
- 💬 **Decision Log Sidebar**: Minimalist interactive chat sidebar for real-time logging of architectural decisions, completed tasks, TODOs, and bug fixes.
- 📊 **Memory Diff View**: Visual comparison output channel ("Context Optimizer — What Changed") tracking added/removed files, feature promotions, and token savings deltas.
- 👋 **Interactive Onboarding Walkthrough**: 4-slide introductory guide highlighting token waste savings, AST features, and prompt exports.
- ⚡ **AI-Powered File Summarizer**: Groq LLM-assisted semantic one-sentence summarization for complex files (>50 lines) with SHA-256 hash caching.
- 🧪 **Test File Coverage Analysis**: Priority analysis tier for `*.test.ts`, `*.spec.ts`, and `__tests__` suites with exported test coverage summaries.
- 🌐 **Multi-Root Workspace Support**: Unified monorepo and multi-root folder scanning.
- 📥 **AI Chat Conversation Importer**: Direct bulk import and automatic classification of pasted AI chat session logs into structured project memory.
- 🔮 **Interactive Force Graph & Flowcharts**: Physics-based dependency network and SVG flowchart codebase visualizers with filter controls.
