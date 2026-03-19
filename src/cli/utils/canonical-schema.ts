import fg from "fast-glob";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { type SchemaDocument } from "@atmyapp/structure";
import { Logger } from "../logger";
import { OutputDefinition } from "../types/migrate";
import {
  compileCanonicalSource,
  generateLegacyOutput,
} from "../../runtime";

const CANONICAL_SCHEMA_PATTERNS = [
  "ama.schema.ts",
  "ama.schema.mts",
  "ama.schema.js",
  "ama.schema.mjs",
  "ama.schema.json",
];

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

  const source = await readFile(resolvedPath, "utf8");
  const compiled = compileCanonicalSource({
    filename: resolvedPath,
    code: source,
  });

  if (!compiled.schema) {
    throw new Error(
      compiled.errors[0] ??
        `Could not load canonical schema file ${resolvedPath}`,
    );
  }

  if (!compiled.validation.valid) {
    const messages = compiled.validation.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Canonical schema is invalid: ${messages}`);
  }

  return compiled.schema;
}

export function generateOutputFromCanonicalSchema(
  schema: SchemaDocument,
  config: Record<string, unknown>
): OutputDefinition {
  return generateLegacyOutput(schema, config);
}
