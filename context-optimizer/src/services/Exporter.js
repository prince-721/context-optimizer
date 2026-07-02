"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Exporter = void 0;
const tokenizer_1 = require("../utils/tokenizer");
class Exporter {
    export(memory) {
        return {
            markdown: this.toMarkdown(memory),
            json: JSON.stringify(memory, null, 2),
            minJson: this.toMinJson(memory),
            optimizedPrompt: this.toOptimizedPrompt(memory),
        };
    }
    toOptimizedPrompt(m) {
        const lines = [];
        lines.push(`# Project: ${m.projectName}`);
        if (m.framework)
            lines.push(`Framework: ${m.framework} (${m.language})`);
        if (m.database.type && m.database.type !== 'Unknown') {
            lines.push(`DB: ${m.database.type}${m.database.orm ? ` via ${m.database.orm}` : ''}`);
        }
        if (m.libraries.length > 0) {
            const libs = m.libraries.map(l => `${l.name}[${l.purpose}]`).join(', ');
            lines.push(`Libs: ${libs}`);
        }
        if (m.completedFeatures.length > 0) {
            lines.push(`\nDone: ${m.completedFeatures.map(f => `✔${f.name}`).join(', ')}`);
        }
        if (m.pendingFeatures.length > 0) {
            lines.push(`Pending: ${m.pendingFeatures.map(f => `•${f.name}`).join(', ')}`);
        }
        if (m.apiEndpoints.length > 0) {
            const eps = m.apiEndpoints.slice(0, 15).map(e => `${e.method} ${e.path}`).join(', ');
            lines.push(`\nAPIs: ${eps}${m.apiEndpoints.length > 15 ? `…+${m.apiEndpoints.length - 15}` : ''}`);
        }
        if (m.environmentVariables.length > 0) {
            const keys = m.environmentVariables.map(e => e.key).join(', ');
            lines.push(`Env: ${keys}`);
        }
        if (m.codingStyle.components || m.codingStyle.asyncStyle) {
            const styleItems = [
                m.codingStyle.components,
                m.codingStyle.asyncStyle,
                ...m.codingStyle.patterns,
                m.codingStyle.stateManagement,
            ].filter(Boolean);
            lines.push(`\nStyle: ${styleItems.join(', ')}`);
        }
        if (m.knownBugs.length > 0) {
            lines.push(`\nBugs: ${m.knownBugs.map(b => `[${b.severity}]${b.description}`).join('; ')}`);
        }
        if (m.developerNotes.length > 0) {
            lines.push(`\nNotes: ${m.developerNotes.join('; ')}`);
        }
        // Key file summaries
        const highPriority = Object.entries(m.fileIndex)
            .filter(([, v]) => v.priority === 'high')
            .slice(0, 15);
        if (highPriority.length > 0) {
            lines.push('\nKey Files:');
            for (const [file, info] of highPriority) {
                lines.push(`  ${file}: ${info.summary}`);
            }
        }
        if (m.projectGoals.length > 0) {
            lines.push(`\nGoals: ${m.projectGoals.join('; ')}`);
        }
        // Recent decisions
        const decisions = m.conversationLog.filter(e => e.type === 'decision' || e.type === 'architecture').slice(-5);
        if (decisions.length > 0) {
            lines.push(`\nDecisions: ${decisions.map(d => d.content).join('; ')}`);
        }
        const rules = [];
        if (m.completedFeatures.length > 0)
            rules.push('Never rewrite completed modules.');
        if (m.folderStructure)
            rules.push('Maintain existing folder structure.');
        if (m.namingConvention)
            rules.push(`Use ${m.namingConvention} naming.`);
        if (rules.length > 0)
            lines.push(`\nRules: ${rules.join(' ')}`);
        return lines.join('\n');
    }
    toMarkdown(m) {
        const sections = [];
        sections.push(`# Context: ${m.projectName}`);
        sections.push(`> Generated: ${new Date(m.lastUpdated).toLocaleString()} | Tokens saved: ${m.tokenStats.savedPercent}%`);
        sections.push(`\n## Project Overview`);
        sections.push(`| Field | Value |`);
        sections.push(`|-------|-------|`);
        sections.push(`| Name | ${m.projectName} |`);
        sections.push(`| Framework | ${m.framework || 'Unknown'} |`);
        sections.push(`| Language | ${m.language || 'Unknown'} |`);
        sections.push(`| Database | ${m.database.type}${m.database.orm ? ` (${m.database.orm})` : ''} |`);
        if (m.completedFeatures.length > 0) {
            sections.push(`\n## ✅ Completed Features`);
            for (const f of m.completedFeatures) {
                sections.push(`- **${f.name}**: ${f.description}`);
            }
        }
        if (m.pendingFeatures.length > 0) {
            sections.push(`\n## 🔲 Pending Features`);
            for (const f of m.pendingFeatures) {
                sections.push(`- [ ] **${f.name}**: ${f.description}`);
            }
        }
        if (m.apiEndpoints.length > 0) {
            sections.push(`\n## 🔌 API Endpoints`);
            sections.push(`| Method | Path | Auth |`);
            sections.push(`|--------|------|------|`);
            for (const ep of m.apiEndpoints.slice(0, 30)) {
                sections.push(`| \`${ep.method}\` | \`${ep.path}\` | ${ep.auth ? '🔒' : '🌐'} |`);
            }
        }
        if (m.environmentVariables.length > 0) {
            sections.push(`\n## 🔐 Environment Variables`);
            for (const v of m.environmentVariables) {
                sections.push(`- \`${v.key}\` — ${v.description}${v.required ? ' _(required)_' : ' _(optional)_'}`);
            }
        }
        if (m.libraries.length > 0) {
            sections.push(`\n## 📦 Key Libraries`);
            for (const l of m.libraries) {
                sections.push(`- **${l.name}** ${l.version ? `(${l.version})` : ''}: ${l.purpose}`);
            }
        }
        sections.push(`\n## 🎨 Coding Style`);
        sections.push(`- Components: ${m.codingStyle.components}`);
        sections.push(`- Async: ${m.codingStyle.asyncStyle}`);
        if (m.codingStyle.stateManagement)
            sections.push(`- State: ${m.codingStyle.stateManagement}`);
        if (m.codingStyle.patterns.length)
            sections.push(`- Patterns: ${m.codingStyle.patterns.join(', ')}`);
        sections.push(`- Naming: ${m.namingConvention}`);
        if (m.knownBugs.length > 0) {
            sections.push(`\n## 🐛 Known Bugs`);
            for (const b of m.knownBugs) {
                sections.push(`- [${b.severity.toUpperCase()}] ${b.description}${b.file ? ` (\`${b.file}\`)` : ''}`);
            }
        }
        if (m.developerNotes.length > 0) {
            sections.push(`\n## 📝 Developer Notes`);
            for (const n of m.developerNotes)
                sections.push(`- ${n}`);
        }
        sections.push(`\n## 📁 Key Files`);
        const highFiles = Object.entries(m.fileIndex).filter(([, v]) => v.priority === 'high');
        for (const [file, info] of highFiles.slice(0, 20)) {
            sections.push(`- \`${file}\`: ${info.summary}`);
        }
        sections.push(`\n## 📊 Token Statistics`);
        sections.push(`| Metric | Value |`);
        sections.push(`|--------|-------|`);
        sections.push(`| Original Tokens | ${(0, tokenizer_1.formatTokenCount)(m.tokenStats.original)} |`);
        sections.push(`| Compressed Tokens | ${(0, tokenizer_1.formatTokenCount)(m.tokenStats.compressed)} |`);
        sections.push(`| Tokens Saved | ${m.tokenStats.savedPercent}% |`);
        if (m.gitHistory.length > 0) {
            sections.push(`\n## 🔀 Recent Git History`);
            for (const g of m.gitHistory.slice(-10).reverse()) {
                sections.push(`- \`${g.hash}\` ${g.message}`);
            }
        }
        return sections.join('\n');
    }
    toMinJson(m) {
        const mini = {
            p: m.projectName,
            f: m.framework,
            l: m.language,
            db: m.database.type,
            done: m.completedFeatures.map(f => f.name),
            todo: m.pendingFeatures.map(f => f.name),
            apis: m.apiEndpoints.slice(0, 20).map(e => `${e.method} ${e.path}`),
            env: m.environmentVariables.map(e => e.key),
            bugs: m.knownBugs.map(b => `[${b.severity}]${b.description}`),
            notes: m.developerNotes,
            libs: m.libraries.map(l => l.name),
            style: [m.codingStyle.components, m.codingStyle.asyncStyle, ...m.codingStyle.patterns].filter(Boolean),
            files: Object.entries(m.fileIndex)
                .filter(([, v]) => v.priority === 'high')
                .slice(0, 15)
                .reduce((acc, [k, v]) => ({ ...acc, [k]: v.summary }), {}),
            ts: { o: m.tokenStats.original, c: m.tokenStats.compressed, s: m.tokenStats.savedPercent },
        };
        return JSON.stringify(mini);
    }
    generateReadme(m) {
        const lines = [];
        lines.push(`# ${m.projectName}`);
        lines.push(`\n> Built with ${m.framework || 'unknown framework'} · ${m.language} · ${m.database.type}\n`);
        if (m.projectGoals.length > 0) {
            lines.push('## About');
            lines.push(m.projectGoals.join('\n'));
        }
        lines.push('\n## Tech Stack');
        lines.push(`- **Frontend/Framework:** ${m.framework}`);
        lines.push(`- **Language:** ${m.language}`);
        lines.push(`- **Database:** ${m.database.type}${m.database.orm ? ` (${m.database.orm})` : ''}`);
        if (m.libraries.length) {
            lines.push(`- **Key Libraries:** ${m.libraries.map(l => l.name).join(', ')}`);
        }
        if (m.environmentVariables.length > 0) {
            lines.push('\n## Environment Variables');
            lines.push('Create a `.env` file:\n```env');
            for (const v of m.environmentVariables) {
                lines.push(`${v.key}=     # ${v.description}`);
            }
            lines.push('```');
        }
        lines.push('\n## Features');
        for (const f of m.completedFeatures)
            lines.push(`- ✅ ${f.name}`);
        for (const f of m.pendingFeatures)
            lines.push(`- 🔲 ${f.name} _(pending)_`);
        if (m.apiEndpoints.length > 0) {
            lines.push('\n## API Endpoints');
            for (const ep of m.apiEndpoints.slice(0, 20)) {
                lines.push(`- \`${ep.method} ${ep.path}\`${ep.auth ? ' 🔒' : ''}`);
            }
        }
        lines.push('\n## Development');
        lines.push('```bash\n# Install dependencies');
        lines.push(`${m.dependencies.packageManager} install`);
        lines.push('\n# Start development server');
        if (m.dependencies.runtime['next'])
            lines.push(`${m.dependencies.packageManager} run dev`);
        else
            lines.push(`${m.dependencies.packageManager} start`);
        lines.push('```');
        lines.push(`\n---\n*README auto-generated by Context Optimizer on ${new Date().toLocaleDateString()}*`);
        return lines.join('\n');
    }
    generateOnboarding(m) {
        return `# Onboarding: ${m.projectName}

You are joining a ${m.framework} project built in ${m.language}.

## What this project does
${m.projectGoals.length ? m.projectGoals.join('\n') : '(No goals defined yet)'}

## Architecture at a glance
- **Frontend/Backend:** ${m.framework}
- **Database:** ${m.database.type}
- **Auth:** ${m.environmentVariables.find(e => e.key.toLowerCase().includes('jwt') || e.key.toLowerCase().includes('secret')) ? 'JWT-based' : 'Check auth files'}

## Completed features (do NOT rewrite)
${m.completedFeatures.map(f => `- ✅ ${f.name}: ${f.description}`).join('\n') || '(none yet)'}

## What needs to be built next
${m.pendingFeatures.map(f => `- 🔲 ${f.name}: ${f.description}`).join('\n') || '(none logged)'}

## Coding conventions
- Style: ${m.codingStyle.components}, ${m.codingStyle.asyncStyle}
- Naming: ${m.namingConvention}
- State: ${m.codingStyle.stateManagement || 'check source'}
- Patterns: ${m.codingStyle.patterns.join(', ') || 'none specified'}

## Known bugs to be aware of
${m.knownBugs.map(b => `- [${b.severity}] ${b.description}`).join('\n') || '(none logged)'}

## Developer notes
${m.developerNotes.join('\n') || '(none yet)'}

## Rules
1. Never rewrite completed modules without explicit instruction.
2. Maintain existing folder structure.
3. Follow established coding conventions above.
4. Check known bugs before starting related work.
`;
    }
}
exports.Exporter = Exporter;
//# sourceMappingURL=Exporter.js.map