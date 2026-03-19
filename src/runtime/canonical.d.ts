import { type SchemaDocument } from "@atmyapp/structure";
import type { OutputDefinition } from "../cli/types/migrate";
import type { CompileCanonicalSourceInput, CompileCanonicalSourceResult, RunCanonicalMigrateInput, RunCanonicalMigrateResult, UploadStructureInput, UploadStructureResult } from "./types";
export declare function generateLegacyOutput(schema: SchemaDocument, config?: Record<string, unknown>): OutputDefinition;
export declare function loadCanonicalModuleValue({ filename, code, format, }: CompileCanonicalSourceInput): unknown;
export declare function compileCanonicalSource(input: CompileCanonicalSourceInput): CompileCanonicalSourceResult;
export declare function uploadStructure({ output, url, token, fetchImplementation, }: UploadStructureInput): Promise<UploadStructureResult>;
export declare function runCanonicalMigrate({ schema, config, dryRun, upload, url, token, fetchImplementation, verbose, }: RunCanonicalMigrateInput): Promise<RunCanonicalMigrateResult>;
export declare function analyzeMigration(currentInput: SchemaDocument | string | Record<string, unknown>, nextInput: SchemaDocument | string | Record<string, unknown>): {
    diff: import("@atmyapp/structure").MigrationChange[];
    migrationPlan: {
        prompts: import("@atmyapp/structure").MigrationPrompt[];
        changes: import("@atmyapp/structure").MigrationChange[];
        actions: import("@atmyapp/structure").MigrationAction[];
        blocking: boolean;
    };
};
