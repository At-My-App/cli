import fg from "fast-glob";
import { readFile, rm, writeFile } from "fs/promises";
import { basename, dirname, extname, join, resolve } from "path";
import { pathToFileURL } from "url";
import ts from "typescript";
import {
  compileSchema,
  type SchemaDocument,
  validateSchemaDocument,
} from "@atmyapp/structure";
import { Logger } from "../logger";
import { OutputDefinition } from "../types/migrate";

const CANONICAL_SCHEMA_PATTERNS = [
  "ama.schema.ts",
  "ama.schema.mts",
  "ama.schema.js",
  "ama.schema.mjs",
  "ama.schema.json",
];

function buildMetadata(
  output: OutputDefinition,
  config: Record<string, unknown>
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

function getSchemaFromModule(moduleExports: Record<string, unknown>): unknown {
  return (
    moduleExports.default ||
    moduleExports.schema ||
    moduleExports.ATMYAPP_SCHEMA ||
    null
  );
}

async function importTypeScriptModule(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    fileName: filePath,
  });

  const tempFile = join(
    dirname(filePath),
    `.${basename(filePath, extname(filePath))}.atmyapp-structure.cjs`
  );

  try {
    await writeFile(tempFile, transpiled.outputText, "utf8");
    delete require.cache[require.resolve(tempFile)];
    return require(tempFile);
  } finally {
    await rm(tempFile, { force: true });
  }
}

export async function findCanonicalSchemaFile(
  logger: Logger,
  cwd = process.cwd()
): Promise<string | null> {
  const matches = await fg(CANONICAL_SCHEMA_PATTERNS, {
    cwd,
    absolute: true,
    onlyFiles: true,
    dot: false,
  });

  if (matches.length === 0) {
    return null;
  }

  const [selected, ...extra] = matches.sort();
  if (extra.length > 0) {
    logger.warn(
      `Multiple canonical schema files found. Using ${selected} and ignoring ${extra.join(", ")}`
    );
  }

  return selected;
}

export async function loadCanonicalSchemaFile(
  filePath: string,
  logger: Logger
): Promise<SchemaDocument> {
  const resolvedPath = resolve(filePath);
  logger.info(`Using canonical schema from ${resolvedPath}`);

  let schemaValue: unknown;
  if (resolvedPath.endsWith(".json")) {
    schemaValue = JSON.parse(await readFile(resolvedPath, "utf8"));
  } else if (resolvedPath.endsWith(".ts") || resolvedPath.endsWith(".mts")) {
    const moduleExports = (await importTypeScriptModule(resolvedPath)) as Record<
      string,
      unknown
    >;
    schemaValue = getSchemaFromModule(moduleExports);
  } else if (resolvedPath.endsWith(".mjs")) {
    const moduleExports = (await import(
      `${pathToFileURL(resolvedPath).href}?t=${Date.now()}`
    )) as Record<string, unknown>;
    schemaValue = getSchemaFromModule(moduleExports);
  } else {
    const moduleExports = require(resolvedPath) as Record<string, unknown>;
    schemaValue = getSchemaFromModule(moduleExports);
  }

  if (!schemaValue || typeof schemaValue !== "object") {
    throw new Error(
      `Canonical schema file ${resolvedPath} must export a schema as default, 'schema', or 'ATMYAPP_SCHEMA'`
    );
  }

  const validation = validateSchemaDocument(schemaValue as SchemaDocument);
  if (!validation.valid) {
    const messages = validation.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Canonical schema is invalid: ${messages}`);
  }

  return schemaValue as SchemaDocument;
}

export function generateOutputFromCanonicalSchema(
  schema: SchemaDocument,
  config: Record<string, unknown>
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
  };

  output.metadata = buildMetadata(output, config);

  return output;
}
