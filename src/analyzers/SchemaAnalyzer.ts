import * as path from 'path';
import { walkDirectory, readFileSafe, relativePath, isTextFile } from '../utils/fileUtils';
import { logger } from '../utils/logger';

export interface SchemaResult {
  type: string;
  models: string[];
  schemas: string[];
}

export class SchemaAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async analyze(): Promise<SchemaResult> {
    const result: SchemaResult = { type: '', models: [], schemas: [] };

    // 1. Prisma
    const prismaResult = await this.analyzePrisma();
    if (prismaResult.models.length > 0) {
      return { ...prismaResult };
    }

    // 2. Mongoose schemas
    const mongooseResult = await this.analyzeMongoose();
    if (mongooseResult.models.length > 0) {
      return { ...mongooseResult };
    }

    // 3. TypeORM entities
    const typeormResult = await this.analyzeTypeORM();
    if (typeormResult.models.length > 0) {
      return { ...typeormResult };
    }

    // 4. Drizzle
    const drizzleResult = await this.analyzeDrizzle();
    if (drizzleResult.models.length > 0) {
      return { ...drizzleResult };
    }

    // 5. SQL files
    const sqlResult = await this.analyzeSqlFiles();
    if (sqlResult.models.length > 0) {
      return { ...sqlResult };
    }

    // 6. SQLAlchemy (Python)
    const sqlalchemyResult = await this.analyzeSqlAlchemy();
    if (sqlalchemyResult.models.length > 0) {
      return { ...sqlalchemyResult };
    }

    return result;
  }

  private async analyzePrisma(): Promise<SchemaResult> {
    const prismaPath = path.join(this.workspaceRoot, 'prisma', 'schema.prisma');
    const content = await readFileSafe(prismaPath);
    if (!content) {
      // Try root
      const rootContent = await readFileSafe(path.join(this.workspaceRoot, 'schema.prisma'));
      if (!rootContent) return { type: '', models: [], schemas: [] };
      return this.parsePrismaContent(rootContent);
    }
    return this.parsePrismaContent(content);
  }

  private parsePrismaContent(content: string): SchemaResult {
    const models = [...content.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]);
    const dbMatch = content.match(/provider\s*=\s*"(\w+)"/);
    const db = dbMatch?.[1] ?? 'unknown';
    const dbName = db === 'postgresql' ? 'PostgreSQL' : db === 'mysql' ? 'MySQL' : db === 'sqlite' ? 'SQLite' : db;
    logger.info(`SchemaAnalyzer: Prisma schema with ${models.length} models`);
    return { type: `Prisma (${dbName})`, models, schemas: [] };
  }

  private async analyzeMongoose(): Promise<SchemaResult> {
    const files = walkDirectory(this.workspaceRoot)
      .filter(f => /\.(ts|js)$/.test(f) && isTextFile(f));

    const models: string[] = [];
    const schemas: string[] = [];

    for (const file of files) {
      const content = await readFileSafe(file);
      if (!content || !content.includes('mongoose')) continue;

      // new Schema({...})
      const schemaMatches = [...content.matchAll(/(?:const|let|var)\s+(\w+(?:Schema|Model))\s*=\s*new\s+(?:mongoose\.)?Schema/g)];
      for (const m of schemaMatches) schemas.push(m[1]);

      // mongoose.model('ModelName', ...)
      const modelMatches = [...content.matchAll(/mongoose\.model\s*\(\s*['"`](\w+)['"`]/g)];
      for (const m of modelMatches) models.push(m[1]);

      // model<Interface>('ModelName', ...)  — TypeScript generic form
      const tsModelMatches = [...content.matchAll(/model<\w+>\s*\(\s*['"`](\w+)['"`]/g)];
      for (const m of tsModelMatches) {
        if (!models.includes(m[1])) models.push(m[1]);
      }
    }

    if (models.length === 0 && schemas.length === 0) return { type: '', models: [], schemas: [] };
    logger.info(`SchemaAnalyzer: Mongoose — ${models.length} models, ${schemas.length} schemas`);
    return { type: 'MongoDB (Mongoose)', models: [...new Set(models)], schemas: [...new Set(schemas)] };
  }

  private async analyzeTypeORM(): Promise<SchemaResult> {
    const files = walkDirectory(this.workspaceRoot)
      .filter(f => /\.(ts|js)$/.test(f) && isTextFile(f));

    const entities: string[] = [];

    for (const file of files) {
      const content = await readFileSafe(file);
      if (!content || !content.includes('@Entity')) continue;

      const classMatches = [...content.matchAll(/@Entity[^]*?class\s+(\w+)/g)];
      for (const m of classMatches) entities.push(m[1]);
    }

    if (entities.length === 0) return { type: '', models: [], schemas: [] };
    logger.info(`SchemaAnalyzer: TypeORM — ${entities.length} entities`);
    return { type: 'TypeORM', models: [...new Set(entities)], schemas: [] };
  }

  private async analyzeDrizzle(): Promise<SchemaResult> {
    const files = walkDirectory(this.workspaceRoot)
      .filter(f => /\.(ts|js)$/.test(f) && isTextFile(f));

    const tables: string[] = [];

    for (const file of files) {
      const content = await readFileSafe(file);
      if (!content || !content.includes('drizzle-orm')) continue;

      // pgTable('users', {...}) or mysqlTable('users', {...})
      const tableMatches = [...content.matchAll(/(?:pg|mysql|sqlite)Table\s*\(\s*['"`](\w+)['"`]/g)];
      for (const m of tableMatches) tables.push(m[1]);
    }

    if (tables.length === 0) return { type: '', models: [], schemas: [] };
    logger.info(`SchemaAnalyzer: Drizzle — ${tables.length} tables`);
    return { type: 'Drizzle ORM', models: [...new Set(tables)], schemas: [] };
  }

  private async analyzeSqlFiles(): Promise<SchemaResult> {
    const files = walkDirectory(this.workspaceRoot)
      .filter(f => f.endsWith('.sql') && isTextFile(f));

    const tables: string[] = [];

    for (const file of files) {
      const content = await readFileSafe(file);
      if (!content) continue;

      const matches = [...content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?/gi)];
      for (const m of matches) tables.push(m[1]);
    }

    if (tables.length === 0) return { type: '', models: [], schemas: [] };
    logger.info(`SchemaAnalyzer: SQL — ${tables.length} tables`);
    return { type: 'SQL', models: [...new Set(tables)], schemas: [] };
  }

  private async analyzeSqlAlchemy(): Promise<SchemaResult> {
    const files = walkDirectory(this.workspaceRoot)
      .filter(f => f.endsWith('.py') && isTextFile(f));

    const models: string[] = [];

    for (const file of files) {
      const content = await readFileSafe(file);
      if (!content || !content.includes('Base')) continue;

      // class User(Base):
      const classMatches = [...content.matchAll(/class\s+(\w+)\s*\(\s*(?:db\.Model|Base|DeclarativeBase)\s*\)/g)];
      for (const m of classMatches) models.push(m[1]);
    }

    if (models.length === 0) return { type: '', models: [], schemas: [] };
    logger.info(`SchemaAnalyzer: SQLAlchemy — ${models.length} models`);
    return { type: 'SQLAlchemy', models: [...new Set(models)], schemas: [] };
  }
}
