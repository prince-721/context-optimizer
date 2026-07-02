import { ProjectMemory } from '../core/MemoryManager';

export class ReadmeGenerator {
  generate(mem: ProjectMemory): string {
    const lines: string[] = [];

    lines.push(`# ${mem.project.name}`);
    if (mem.project.description) lines.push(`\n> ${mem.project.description}`);
    lines.push('');

    // Badges
    if (mem.project.version) {
      lines.push(`![Version](https://img.shields.io/badge/version-${mem.project.version}-blue)`);
    }
    lines.push('');

    // Table of Contents
    lines.push('## Table of Contents');
    lines.push('- [Overview](#overview)');
    lines.push('- [Tech Stack](#tech-stack)');
    if (mem.api.endpoints.length > 0) lines.push('- [API Endpoints](#api-endpoints)');
    if (mem.database.models.length > 0) lines.push('- [Database](#database)');
    lines.push('- [Features](#features)');
    lines.push('- [Project Structure](#project-structure)');
    if (mem.environment.variables.length > 0) lines.push('- [Environment Variables](#environment-variables)');
    lines.push('- [Getting Started](#getting-started)');
    lines.push('');

    // Overview
    lines.push('## Overview');
    if (mem.architecture.summary) lines.push(mem.architecture.summary);
    if (mem.project.goals.length > 0) {
      lines.push('');
      lines.push('**Goals:**');
      for (const goal of mem.project.goals) lines.push(`- ${goal}`);
    }
    lines.push('');

    // Tech Stack
    lines.push('## Tech Stack');
    lines.push('');
    lines.push('| Layer | Technology |');
    lines.push('|---|---|');
    if (mem.stack.frontend) lines.push(`| Frontend | ${mem.stack.frontend} |`);
    if (mem.stack.backend) lines.push(`| Backend | ${mem.stack.backend} |`);
    if (mem.stack.database) lines.push(`| Database | ${mem.stack.database} |`);
    if (mem.stack.auth) lines.push(`| Authentication | ${mem.stack.auth} |`);
    if (mem.stack.devOps) lines.push(`| DevOps | ${mem.stack.devOps} |`);
    lines.push('');

    // Frameworks
    if (mem.dependencies.frameworks.length > 0) {
      lines.push('**Libraries & Frameworks:**');
      lines.push(mem.dependencies.frameworks.map(f => `\`${f}\``).join(' · '));
      lines.push('');
    }

    // API Endpoints
    if (mem.api.endpoints.length > 0) {
      lines.push('## API Endpoints');
      if (mem.api.baseUrl) lines.push(`Base URL: \`${mem.api.baseUrl}\``);
      lines.push('');
      lines.push('| Method | Endpoint | Description |');
      lines.push('|---|---|---|');
      for (const ep of mem.api.endpoints.slice(0, 30)) {
        lines.push(`| \`${ep.method}\` | \`${ep.path}\` | ${ep.description ?? ''} |`);
      }
      if (mem.api.endpoints.length > 30) lines.push(`\n_...and ${mem.api.endpoints.length - 30} more endpoints_`);
      lines.push('');
    }

    // Database
    if (mem.database.type || mem.database.models.length > 0) {
      lines.push('## Database');
      if (mem.database.type) lines.push(`**Type:** ${mem.database.type}`);
      if (mem.database.models.length > 0) {
        lines.push('');
        lines.push('**Models:**');
        for (const model of mem.database.models) lines.push(`- \`${model}\``);
      }
      lines.push('');
    }

    // Features
    lines.push('## Features');
    if (mem.features.completed.length > 0) {
      lines.push('');
      lines.push('### ✅ Completed');
      for (const f of mem.features.completed) lines.push(`- [x] ${f}`);
    }
    if (mem.features.inProgress.length > 0) {
      lines.push('');
      lines.push('### 🔄 In Progress');
      for (const f of mem.features.inProgress) lines.push(`- [ ] ${f} _(in progress)_`);
    }
    if (mem.features.pending.length > 0) {
      lines.push('');
      lines.push('### 📋 Pending');
      for (const f of mem.features.pending) lines.push(`- [ ] ${f}`);
    }
    lines.push('');

    // Project Structure
    lines.push('## Project Structure');
    lines.push('');
    lines.push('```');
    lines.push(`${mem.project.name}/`);
    for (const folder of mem.structure.rootFolders) {
      lines.push(`├── ${folder}/`);
    }
    if (mem.structure.mainEntryPoints.length > 0) {
      for (const ep of mem.structure.mainEntryPoints.slice(0, 5)) {
        lines.push(`├── ${ep}`);
      }
    }
    lines.push('```');
    lines.push('');

    // Environment Variables
    if (mem.environment.variables.length > 0) {
      lines.push('## Environment Variables');
      lines.push('');
      lines.push('Copy `.env.example` to `.env` and fill in the values:');
      lines.push('');
      lines.push('```env');
      for (const v of mem.environment.variables) lines.push(`${v}=your_value_here`);
      lines.push('```');
      lines.push('');
    }

    // Getting Started
    lines.push('## Getting Started');
    lines.push('');
    lines.push('```bash');
    lines.push('# Clone the repository');
    lines.push(`git clone <repository-url>`);
    lines.push('');
    lines.push('# Install dependencies');
    lines.push('npm install');
    lines.push('');
    lines.push('# Set up environment variables');
    if (mem.environment.variables.length > 0) lines.push('cp .env.example .env');
    lines.push('');
    lines.push('# Start the development server');
    lines.push('npm run dev');
    lines.push('```');
    lines.push('');

    // Known Issues
    if (mem.bugs.length > 0) {
      lines.push('## Known Issues');
      for (const bug of mem.bugs) lines.push(`- ${bug}`);
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push(`_README generated by [Context Optimizer](https://marketplace.visualstudio.com/items?itemName=context-optimizer) on ${new Date().toLocaleDateString()}_`);

    return lines.join('\n');
  }
}
