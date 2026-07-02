# 🧠 Context Optimizer

> Automatically compresses your project into an optimized AI prompt — saving up to 95% of tokens when switching AI assistants or starting new chats.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## The Problem

Every time you switch AI accounts or start a new chat, you waste **thousands of tokens** re-explaining your project from scratch.

## The Solution

Context Optimizer continuously watches your project and maintains a **compressed memory**. With one click, generate an optimized prompt that gives any AI assistant full project understanding in under 2,100 tokens (vs. 38,400+ raw).

---

## Features

### 🔍 Smart Project Analysis
- Auto-detects **framework, stack, database, authentication**
- Reads `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`
- Detects **API routes** (Express, Fastify, Next.js, FastAPI, NestJS, Laravel)
- Scans **database schemas** (Prisma, Mongoose, TypeORM, Drizzle, SQL)
- Reads **env variable names** (never values — security first)

### 📊 Token Savings Dashboard
- Live dashboard showing original vs. compressed token count
- **Up to 95% token reduction**
- Status bar with live savings percentage

### 📁 File Priority Ranking
| Priority | Examples |
|---|---|
| 🔴 Critical | `package.json`, `README.md`, `.env.example`, `schema.prisma` |
| 🟠 High | Routes, controllers, models, config, entry points |
| 🟡 Medium | Components, services, hooks, stores |
| ⚪ Low | Tests, utilities |
| ❌ Ignored | `node_modules`, `dist`, `build`, images, videos |

### 📤 One-Click Export (4 formats)
- `context.md` — human-readable structured summary
- `context.json` — full machine-readable memory
- `context.min.json` — minified JSON with abbreviated keys
- `optimized_prompt.txt` — ultra-compact AI onboarding prompt

### ⚡ Incremental Updates
- SHA-256 file hashing — only re-analyzes **changed files**
- Auto-updates on file save and git commit

### 🔌 AI Provider Agnostic
Works with **ChatGPT, Claude, Gemini, Cursor, Windsurf, GitHub Copilot, Antigravity**, and any LLM.

### 🔎 Code Quality Detection
- Duplicate function detection across files
- Unused file detection
- Dead export detection

### 📝 README Generator
Auto-generates a full project README from your memory.

---

## Commands

| Command | Description |
|---|---|
| `Generate Context` | Full project analysis from scratch |
| `Update Context` | Incremental update (changed files only) |
| `Export Optimized Prompt` | Export all 4 formats |
| `Export as Markdown` | Export `context.md` |
| `Export as JSON` | Export `context.json` + `context.min.json` |
| `Show Token Savings` | Display savings report |
| `Open Dashboard` | Open the live dashboard |
| `Reset Memory` | Clear all memory |
| `Add Developer Note` | Log a decision, TODO, or bug fix |
| `Add Project Rule` | Add an AI behavior rule |
| `Detect Duplicate/Dead Code` | Run code quality analysis |
| `Generate README` | Auto-generate project README |

---

## Example Output

```
PROJECT: AI Health Tracker v2.1.0
DESC: Full-stack health tracking application

STACK: FE:React + Tailwind | BE:Node.js Express | DB:MongoDB (Mongoose) | AUTH:JWT

FRAMEWORKS: React, Express, Mongoose, Tailwind CSS

API: GET /api/users | POST /login | POST /signup | GET /diet | POST /diet
     GET /water | GET /sleep | GET /exercise

ENV: PORT, MONGODB_URI, JWT_SECRET, NODE_ENV

DONE: ✓Login ✓Signup ✓Diet Planner ✓Water Tracker ✓Profile
TODO: •Sleep Tracker •Chatbot •Exercise Module •Analytics Dashboard

STYLE: Functional Components, Hooks, Async/Await, RESTful

BUGS: Diet recommendation occasionally duplicates meals.

RULES: Never rewrite completed modules. | Maintain existing folder structure.
```

---

## Storage

All data is stored **locally** in your workspace:
```
.vscode/context-optimizer/
  memory.json          ← Project memory
  exports/
    context.md
    context.json
    context.min.json
    optimized_prompt.txt
    optimized_prompt.min.txt
```

**No cloud. No telemetry. No data collection.**

---

## Installation

### From VSIX
```bash
# Build the extension
cd context-optimizer
npm install
npm run package

# Install
code --install-extension context-optimizer-1.0.0.vsix
```

### Development
```bash
npm install
npm run build
# Press F5 in VS Code to launch Extension Development Host
```

---

## Requirements

- VS Code 1.85.0+
- Node.js 18+ (for building)

---

## License

MIT © Context Optimizer Contributors
