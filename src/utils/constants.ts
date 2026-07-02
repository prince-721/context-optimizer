import * as crypto from 'crypto';

/** Default ignore patterns — mirrors .gitignore conventions + build artifacts */
export const DEFAULT_IGNORE_PATTERNS: string[] = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.cache',
  '.next',
  '.nuxt',
  'out',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.turbo',
  '.vercel',
  'public/assets',
  '*.log',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.webp',
  '*.mp4',
  '*.mp3',
  '*.wav',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.pdf',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/** File priority levels */
export type FilePriority = 'critical' | 'high' | 'medium' | 'low' | 'ignore';

/** Files/patterns considered critical (analyzed deeply) */
export const CRITICAL_FILE_PATTERNS: string[] = [
  'package.json',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'pyproject.toml',
  'README.md',
  'readme.md',
  '.env.example',
  '.env.sample',
  'schema.prisma',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
];

/** High-priority file patterns */
export const HIGH_PRIORITY_PATTERNS: string[] = [
  // Routes / API
  '**/routes/**/*.{js,ts,py}',
  '**/api/**/*.{js,ts,py}',
  '**/controllers/**/*.{js,ts,py}',
  // Config
  '**/config/**/*.{js,ts,json}',
  '**/*.config.{js,ts,mjs}',
  // DB
  '**/models/**/*.{js,ts,py}',
  '**/schema/**/*.{js,ts,sql}',
  '**/migrations/**/*.{js,ts,sql}',
  // Auth
  '**/auth/**/*.{js,ts,py}',
  '**/middleware/**/*.{js,ts,py}',
  // Entry points
  '**/index.{js,ts,py}',
  '**/app.{js,ts,py}',
  '**/main.{js,ts,py}',
  '**/server.{js,ts,py}',
];

/** Memory storage subdirectory name */
export const MEMORY_DIR = '.vscode/context-optimizer';
export const MEMORY_FILE = 'memory.json';
export const EXPORTS_DIR = 'exports';

/** Memory schema version */
export const MEMORY_VERSION = '1.0.0';

/** Max file size to analyze (in bytes) */
export const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512KB

/** Token estimation: approximate chars per token */
export const CHARS_PER_TOKEN = 4;

/** Compute SHA-256 hash of a string */
export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format token count to human-readable string */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

/** Supported language frameworks detection map */
export const FRAMEWORK_HINTS: Record<string, string[]> = {
  'React': ['react', 'react-dom', '@types/react'],
  'Vue': ['vue', '@vue/core', 'nuxt'],
  'Angular': ['@angular/core', '@angular/cli'],
  'Next.js': ['next'],
  'Svelte': ['svelte', '@sveltejs/kit'],
  'Express': ['express'],
  'Fastify': ['fastify'],
  'Hono': ['hono'],
  'NestJS': ['@nestjs/core'],
  'Django': ['django'],
  'FastAPI': ['fastapi'],
  'Flask': ['flask'],
  'Laravel': ['laravel/framework'],
  'Spring': ['spring-boot-starter'],
  'Tailwind CSS': ['tailwindcss'],
  'Prisma': ['@prisma/client', 'prisma'],
  'Mongoose': ['mongoose'],
  'TypeORM': ['typeorm'],
  'Drizzle': ['drizzle-orm'],
  'Supabase': ['@supabase/supabase-js'],
  'Firebase': ['firebase', 'firebase-admin'],
  'GraphQL': ['graphql', 'apollo-server', '@apollo/server'],
  'tRPC': ['@trpc/server'],
  'Socket.io': ['socket.io', 'socket.io-client'],
};
