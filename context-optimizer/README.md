# Context Optimizer — VS Code Extension

> **Stop re-explaining your project to every AI.**  
> Automatically compress project context to save 80–95% of tokens when switching AI assistants.

---

## The Problem

Every time you start a new chat with ChatGPT, Claude, Cursor, or any AI assistant, you waste thousands of tokens just explaining what your project *is*. Context Optimizer solves this permanently.

## What It Does

Context Optimizer continuously watches your project and builds a structured memory of everything an AI needs to understand it — then compresses it into an ultra-dense prompt you can paste into any AI in seconds.

**Before:** 38,000 tokens to explain your project  
**After:** 2,100 tokens — a 94.5% reduction

---

## Features

### 🧠 Project Memory
Automatically extracts and maintains:
- Project name, framework, language
- Folder structure (smart — ignores `node_modules`, `dist`, etc.)
- Dependencies and libraries with purposes
- Database type and ORM
- API endpoints (auto-detected from route files)
- Environment variables (from `.env.example`)
- Coding style and conventions
- Completed features, pending tasks
- Known bugs with severity
- Architecture decisions
- Developer notes
- Git history

### ⚡ Smart Summarization
Files are summarized intelligently instead of sent in full:
- `package.json` → dependencies, scripts, name
- Route files → `GET /api/users, POST /auth/login, …`
- Schema files → model names
- Components → exported functions, hooks used
- Config files → key settings

### 📊 Token Savings Display
Real-time statistics:
```
Original:    38,400 tokens
Compressed:   2,100 tokens
Saved:           94.5%
```

### 📤 One-Click Export
Four output formats:
- `context.md` — Markdown, great for Claude/ChatGPT
- `context.json` — Full structured data
- `context.min.json` — Minified, smallest footprint
- `optimized_prompt.txt` — Ultra-compressed, AI-ready

### 🔀 Git Integration
On every commit:
- Context updates automatically
- `feat:` commits auto-mark features as completed
- Architecture changes detected by keyword

### 🌐 AI Provider Agnostic
The exported prompt works with:
ChatGPT · Claude · Gemini · Cursor · Windsurf · Antigravity · GitHub Copilot · Any LLM

### 🔒 100% Local
- No cloud
- No telemetry
- No data collection
- Everything stored in VS Code's local extension storage

---

## Commands

| Command | Description |
|---------|-------------|
| `Generate Context` | Full scan of project, build complete memory |
| `Update Context` | Incremental update (changed files only) |
| `Export Prompt` | Copy to clipboard or write files |
| `Show Token Savings` | Display current compression stats |
| `Reset Memory` | Clear all stored memory for this project |
| `Open Dashboard` | Visual dashboard with full project overview |
| `Add Developer Note` | Add a note that persists in project memory |
| `Generate README` | Auto-generate README from project memory |

---

## Activity Bar

Click the database icon in the activity bar to access:
- **Project Summary** — name, framework, language, database
- **Features** — completed, pending, and known bugs
- **Important Files** — high/medium priority with summaries
- **Token Savings** — live compression statistics

---

## Dashboard

Open the full dashboard with `Ctrl+Shift+P → Context Optimizer: Open Dashboard` to see:
- Complete project overview card
- Token savings donut chart
- Completed / pending features
- API endpoints
- Architecture decisions
- Known bugs
- Recent git history

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `contextOptimizer.autoUpdate` | `true` | Update context on file save |
| `contextOptimizer.gitIntegration` | `true` | Update on git commits |
| `contextOptimizer.ignorePatterns` | `[node_modules, dist, …]` | Files/folders to ignore |
| `contextOptimizer.maxFileSizeKB` | `100` | Max file size to analyze |
| `contextOptimizer.compressionLevel` | `standard` | `light` / `standard` / `aggressive` |

---

## File Priority

**High Priority** (always summarized):
- `package.json`, `tsconfig.json`, `README.md`
- `.env.example`
- Schema files, route files, config files
- `app.ts`, `main.ts`, `server.ts`, `index.ts`
- Auth files, middleware, Dockerfile

**Medium Priority** (summarized up to limit):
- `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs` files

**Ignored** (never processed):
- `node_modules/`, `dist/`, `build/`, `.cache/`
- Images, videos, fonts, lock files, generated files

---

## Example Output

```
# Project: AI Health Tracker
Framework: Next.js (TypeScript)
DB: MongoDB via Mongoose
Libs: react[UI framework], mongoose[MongoDB ODM], jsonwebtoken[JWT auth], bcryptjs[Password hashing], axios[HTTP client], tailwindcss[Utility CSS framework]

Done: ✔Login, ✔Signup, ✔Diet Planner, ✔Water Tracker
Pending: •Sleep Tracker, •Chatbot, •Exercise Module

APIs: POST /auth/login, POST /auth/signup, GET /diet, POST /diet, GET /water, POST /water

Style: Functional Components, Async/Await, React Hooks

Bugs: [medium]Diet recommendation occasionally duplicates meals.

Key Files:
  package.json: Package: ai-health-tracker@1.0.0. Deps: next, react, mongoose, jsonwebtoken, bcryptjs
  src/routes/auth.ts: Routes: POST /login, POST /signup
  src/models/User.ts: Prisma schema. Models: [User, Session, Diet, Water]

Rules: Never rewrite completed modules. Maintain existing folder structure. Use camelCase naming.
```

---

## Installation

```bash
# Clone or download
cd context-optimizer
npm install
npm run compile

# Then press F5 in VS Code to launch Extension Development Host
```

To package:
```bash
npm install -g @vscode/vsce
vsce package
# Produces context-optimizer-1.0.0.vsix
code --install-extension context-optimizer-1.0.0.vsix
```

---

## Architecture

```
src/
├── extension.ts          # Entry point, command registration
├── types.ts              # All TypeScript interfaces
├── services/
│   ├── MemoryManager.ts  # Core orchestrator
│   ├── FileScanner.ts    # File discovery & priority ranking
│   ├── Summarizer.ts     # Per-file summarization engine
│   ├── Exporter.ts       # Output format generation
│   ├── StorageService.ts # Local persistence
│   └── GitWatcher.ts     # Git commit monitoring
├── providers/
│   └── TreeProviders.ts  # Activity bar tree views
└── webview/
    └── DashboardPanel.ts # Visual dashboard HTML
```

---

## License

MIT
