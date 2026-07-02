// src/types.ts
export interface ProjectMemory {
  version: string;
  lastUpdated: string;
  projectName: string;
  framework: string;
  language: string;
  folderStructure: FolderNode;
  dependencies: DependencyInfo;
  database: DatabaseInfo;
  apiEndpoints: ApiEndpoint[];
  environmentVariables: EnvVariable[];
  architecture: string;
  importantFunctions: FunctionSummary[];
  completedFeatures: Feature[];
  pendingFeatures: Feature[];
  knownBugs: Bug[];
  codingStyle: CodingStyle;
  namingConvention: string;
  libraries: Library[];
  projectGoals: string[];
  developerNotes: string[];
  fileIndex: Record<string, FileSummary>;
  conversationLog: ConversationEntry[];
  tokenStats: TokenStats;
  gitHistory: GitEntry[];
}

export interface FolderNode {
  name: string;
  type: 'file' | 'folder';
  priority?: 'high' | 'medium' | 'low' | 'ignore';
  children?: FolderNode[];
}

export interface DependencyInfo {
  runtime: Record<string, string>;
  dev: Record<string, string>;
  packageManager: string;
}

export interface DatabaseInfo {
  type: string;
  schemas: string[];
  orm?: string;
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
}

export interface EnvVariable {
  key: string;
  description: string;
  required: boolean;
}

export interface FunctionSummary {
  name: string;
  file: string;
  description: string;
  params: string[];
  returns: string;
}

export interface Feature {
  name: string;
  description: string;
  files?: string[];
  completedAt?: string;
}

export interface Bug {
  description: string;
  file?: string;
  severity: 'low' | 'medium' | 'high';
  reported: string;
}

export interface CodingStyle {
  components: string;
  patterns: string[];
  asyncStyle: string;
  stateManagement?: string;
}

export interface Library {
  name: string;
  purpose: string;
  version?: string;
}

export interface FileSummary {
  path: string;
  priority: 'high' | 'medium' | 'low' | 'ignore';
  summary: string;
  hash: string;
  lastModified: string;
  tokens: number;
}

export interface ConversationEntry {
  type: 'decision' | 'architecture' | 'todo' | 'completed' | 'bugfix' | 'rejected' | 'requirement';
  content: string;
  timestamp: string;
}

export interface TokenStats {
  original: number;
  compressed: number;
  savedPercent: number;
  history: { date: string; original: number; compressed: number }[];
}

export interface GitEntry {
  hash: string;
  message: string;
  date: string;
  filesChanged: string[];
  architectureChange?: string;
}

export interface ExportFormat {
  markdown: string;
  json: string;
  minJson: string;
  optimizedPrompt: string;
}
