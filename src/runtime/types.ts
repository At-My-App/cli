import type {
  CompiledSchema,
  MigrationChange,
  MigrationPlan,
  SchemaDocument,
  ValidationResult,
} from "@atmyapp/structure";
import type { LogEntry } from "../cli/logger";
import type { OutputDefinition } from "../cli/types/migrate";

export type CanonicalModuleFormat = "ts" | "js" | "json";

export interface CompileCanonicalSourceInput {
  filename: string;
  code: string;
  format?: CanonicalModuleFormat;
}

export interface CompileCanonicalSourceResult {
  schema?: SchemaDocument;
  compiled?: CompiledSchema;
  output?: OutputDefinition;
  validation: ValidationResult;
  diff?: MigrationChange[];
  migrationPlan?: MigrationPlan;
  logs: LogEntry[];
  warnings: string[];
  errors: string[];
  timings: {
    loadMs: number;
    validateMs: number;
    compileMs: number;
    totalMs: number;
  };
}

export interface RunCanonicalMigrateInput {
  schema: SchemaDocument;
  config?: Record<string, unknown>;
  dryRun?: boolean;
  upload?: boolean;
  url?: string;
  token?: string;
  fetchImplementation?: typeof fetch;
  verbose?: boolean;
}

export interface UploadStructureInput {
  output: OutputDefinition;
  url: string;
  token?: string;
  clear?: UploadStructureClearRequest;
  fetchImplementation?: typeof fetch;
}

export interface UploadStructureConflictIssue {
  kind: string;
  collectionName?: string;
  definitionName?: string;
  columnName?: string;
  entryCount?: number;
  blobCount?: number;
  message: string;
}

export interface UploadStructureClearRequest {
  collections: string[];
  contentFiles: string[];
  columns: Array<{
    collection: string;
    columns: string[];
  }>;
}

export interface UploadStructureConflictPrompt {
  title: string;
  message: string;
  actionType: string;
  definitionName?: string;
  fieldPath?: string;
}

export interface UploadStructureConflict {
  code: string;
  branch: string;
  issues: UploadStructureConflictIssue[];
  suggestedClear: UploadStructureClearRequest;
  migration?: {
    changes: unknown[];
    actions: unknown[];
    prompts: UploadStructureConflictPrompt[];
    blocking: boolean;
  };
}

export interface UploadStructureResult {
  success: boolean;
  status?: number;
  body?: string;
  error?: string;
  parsed?: unknown;
  conflict?: UploadStructureConflict;
}

export interface RunCanonicalMigrateResult {
  output: OutputDefinition;
  upload?: UploadStructureResult;
  logs: LogEntry[];
  warnings: string[];
  errors: string[];
  timings: {
    generateMs: number;
    uploadMs: number;
    totalMs: number;
  };
}
