import path from "path";
import vm from "vm";
import ts from "typescript";
import {
  compileSchema,
  diffSchemas,
  planMigration,
  renderMigrationPrompts,
  type SchemaDocument,
  validateSchemaDocument,
} from "@atmyapp/structure";
import { Logger, type LogEntry } from "../cli/logger";
import type { OutputDefinition } from "../cli/types/migrate";
import type {
  CanonicalModuleFormat,
  CompileCanonicalSourceInput,
  CompileCanonicalSourceResult,
  RunCanonicalMigrateInput,
  RunCanonicalMigrateResult,
  UploadStructureConflict,
  UploadStructureInput,
  UploadStructureResult,
} from "./types";

function detectFormat(
  filename: string,
  format?: CanonicalModuleFormat,
): CanonicalModuleFormat {
  if (format) {
    return format;
  }

  if (filename.endsWith(".json")) {
    return "json";
  }

  if (filename.endsWith(".js") || filename.endsWith(".mjs")) {
    return "js";
  }

  return "ts";
}

function getSchemaFromModule(moduleExports: Record<string, unknown>): unknown {
  return moduleExports.default || moduleExports.schema || null;
}

function loadAtMyAppStructureRuntime(): Record<string, unknown> {
  return require("@atmyapp/structure") as Record<string, unknown>;
}

function buildMetadata(
  output: OutputDefinition,
  config: Record<string, unknown>,
): OutputDefinition["metadata"] {
  return {
    generatedAt: new Date().toISOString(),
    totalDefinitions: Object.keys(output.definitions).length,
    totalEvents: Object.keys(output.events).length,
    version: "1.0.0",
    ...(config.metadata && typeof config.metadata === "object"
      ? config.metadata
      : {}),
  };
}

function createRuntimeLogger(verbose = false): {
  logger: Logger;
  entries: LogEntry[];
} {
  const entries: LogEntry[] = [];

  return {
    logger: new Logger(verbose, {
      silent: true,
      onLog: (entry) => {
        entries.push(entry);
      },
    }),
    entries,
  };
}

async function getFetchImplementation(
  fetchImplementation?: typeof fetch,
): Promise<typeof fetch> {
  if (fetchImplementation) {
    return fetchImplementation;
  }

  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }

  try {
    // @ts-ignore Optional fallback for older Node runtimes.
    const nodeFetch = await import("node-fetch");
    return nodeFetch.default as unknown as typeof fetch;
  } catch {
    throw new Error(
      "Neither native fetch nor node-fetch is available. For Node.js < 18, install node-fetch.",
    );
  }
}

function parseUploadResponseBody(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function parseUploadConflict(
  status: number,
  parsed: unknown,
): UploadStructureConflict | undefined {
  if (status !== 409 || !parsed || typeof parsed !== "object") {
    return undefined;
  }

  const data = (parsed as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return undefined;
  }

  if (
    (data as { code?: string }).code !==
    "DESTRUCTIVE_STRUCTURE_CHANGE_REQUIRES_CLEAR"
  ) {
    return undefined;
  }

  return data as UploadStructureConflict;
}

export function generateLegacyOutput(
  schema: SchemaDocument,
  config: Record<string, unknown> = {},
): OutputDefinition {
  const compiled = compileSchema(schema);
  const output: OutputDefinition = {
    description:
      compiled.legacyStructure.description ||
      (typeof config.description === "string"
        ? config.description
        : "AMA Definitions"),
    definitions:
      compiled.legacyStructure.definitions as OutputDefinition["definitions"],
    events: ((((compiled.legacyStructure as any).events ||
      (schema as any).events) ??
      {}) as OutputDefinition["events"]),
    args: (compiled.legacyStructure.args || {}) as Record<string, unknown>,
    ...(compiled.legacyStructure.mdx
      ? { mdx: compiled.legacyStructure.mdx as OutputDefinition["mdx"] }
      : {}),
    ...(compiled.legacyStructure.submissions
      ? {
          submissions:
            compiled.legacyStructure.submissions as OutputDefinition["submissions"],
        }
      : {}),
  };

  output.metadata = buildMetadata(output, config);

  return output;
}

export function loadCanonicalModuleValue({
  filename,
  code,
  format,
}: CompileCanonicalSourceInput): unknown {
  const resolvedFormat = detectFormat(filename, format);

  if (resolvedFormat === "json") {
    return JSON.parse(code);
  }

  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    fileName: filename,
  });

  const module = { exports: {} as Record<string, unknown> };
  const structureRuntime = loadAtMyAppStructureRuntime();
  const sandbox = {
    module,
    exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "@atmyapp/structure") {
        return structureRuntime;
      }

      throw new Error(
        `Unsupported import "${specifier}" in ${filename}. Use the helper for local or non-AtMyApp imports.`,
      );
    },
    __filename: filename,
    __dirname: path.dirname(filename),
    console,
  };

  vm.runInNewContext(transpiled.outputText, sandbox, {
    filename,
    timeout: 5000,
  });

  return getSchemaFromModule(module.exports);
}

export function compileCanonicalSource(
  input: CompileCanonicalSourceInput,
): CompileCanonicalSourceResult {
  const startedAt = Date.now();
  const { logger, entries } = createRuntimeLogger(false);
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    logger.info(`Compiling canonical source ${input.filename}`);
    const loadStartedAt = Date.now();
    const rawValue = loadCanonicalModuleValue(input);
    const loadMs = Date.now() - loadStartedAt;

    if (!rawValue || typeof rawValue !== "object") {
      const error =
        `Canonical schema file ${input.filename} must export a schema as default, ` +
        `'schema'`;
      errors.push(error);
      return {
        validation: {
          valid: false,
          issues: [{ path: input.filename, message: error }],
        },
        logs: entries,
        warnings,
        errors,
        timings: {
          loadMs,
          validateMs: 0,
          compileMs: 0,
          totalMs: Date.now() - startedAt,
        },
      };
    }

    const validateStartedAt = Date.now();
    const validation = validateSchemaDocument(rawValue as SchemaDocument);
    const validateMs = Date.now() - validateStartedAt;

    if (!validation.valid) {
      validation.issues.forEach((issue) => {
        warnings.push(`${issue.path}: ${issue.message}`);
      });
    }

    const compileStartedAt = Date.now();
    const schema = rawValue as SchemaDocument;
    const compiled = compileSchema(schema);
    const output = generateLegacyOutput(schema, {});
    const compileMs = Date.now() - compileStartedAt;

    return {
      schema,
      compiled,
      output,
      validation,
      logs: entries,
      warnings,
      errors,
      timings: {
        loadMs,
        validateMs,
        compileMs,
        totalMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown compilation error";
    logger.error(message, error);
    errors.push(message);
    return {
      validation: {
        valid: false,
        issues: [{ path: input.filename, message }],
      },
      logs: entries,
      warnings,
      errors,
      timings: {
        loadMs: 0,
        validateMs: 0,
        compileMs: 0,
        totalMs: Date.now() - startedAt,
      },
    };
  }
}

export async function uploadStructure({
  output,
  url,
  token,
  clear,
  fetchImplementation,
}: UploadStructureInput): Promise<UploadStructureResult> {
  try {
    const fetchApi = await getFetchImplementation(fetchImplementation);
    const response = await fetchApi(`${url}/storage/structure`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        content: JSON.stringify(output),
        ...(clear ? { clear } : {}),
      }),
    });
    const body = await response.text();
    const parsed = parseUploadResponseBody(body);

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        body,
        parsed,
        conflict: parseUploadConflict(response.status, parsed),
        error:
          (parsed &&
          typeof parsed === "object" &&
          typeof (parsed as { error?: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : undefined) ?? `HTTP error ${response.status}`,
      };
    }

    return {
      success: true,
      status: response.status,
      body,
      parsed,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runCanonicalMigrate({
  schema,
  config = {},
  dryRun = false,
  upload = false,
  url,
  token,
  fetchImplementation,
  verbose = false,
}: RunCanonicalMigrateInput): Promise<RunCanonicalMigrateResult> {
  const startedAt = Date.now();
  const { logger, entries } = createRuntimeLogger(verbose);
  const warnings: string[] = [];
  const errors: string[] = [];

  const generateStartedAt = Date.now();
  const output = generateLegacyOutput(schema, config);
  const generateMs = Date.now() - generateStartedAt;
  logger.success(
    `Generated ${Object.keys(output.definitions).length} definitions from canonical schema.`,
  );

  let uploadResult: UploadStructureResult | undefined;
  let uploadMs = 0;

  if (upload && !dryRun) {
    if (!url) {
      const message =
        "Upload requested but no base URL was provided in runtime config.";
      errors.push(message);
      logger.error(message);
    } else {
      const uploadStartedAt = Date.now();
      uploadResult = await uploadStructure({
        output,
        url,
        token,
        fetchImplementation,
      });
      uploadMs = Date.now() - uploadStartedAt;

      if (uploadResult.success) {
        logger.success(`Uploaded structure to ${url}/storage/structure`);
      } else {
        const message =
          uploadResult.error ??
          `Upload failed${uploadResult.status ? ` (${uploadResult.status})` : ""}`;
        errors.push(message);
        logger.error(message);
        if (uploadResult.conflict) {
          warnings.push(
            `Server blocked the migration on branch ${uploadResult.conflict.branch}.`,
          );
        }
      }
    }
  } else if (dryRun) {
    logger.info("Dry run mode enabled. Skipping upload.");
  }

  return {
    output,
    upload: uploadResult,
    logs: entries,
    warnings,
    errors,
    timings: {
      generateMs,
      uploadMs,
      totalMs: Date.now() - startedAt,
    },
  };
}

export function analyzeMigration(
  currentInput: SchemaDocument | string | Record<string, unknown>,
  nextInput: SchemaDocument | string | Record<string, unknown>,
) {
  const diff = diffSchemas(currentInput as any, nextInput as any);
  const migrationPlan = planMigration(currentInput as any, nextInput as any);

  return {
    diff,
    migrationPlan: {
      ...migrationPlan,
      prompts: renderMigrationPrompts(migrationPlan),
    },
  };
}
