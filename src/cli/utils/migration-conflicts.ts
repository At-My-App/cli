import { Logger } from "../logger";
import type {
  UploadStructureClearRequest,
  UploadStructureConflict,
} from "../../runtime";

export interface MigrateConflictOptions {
  clearCollection?: string[];
  clearContent?: string[];
  clearColumn?: string[];
  dangerousResolveAllConflicts?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

function normalizeList(values: string[] = []): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function mergeClearRequests(
  first?: UploadStructureClearRequest,
  second?: UploadStructureClearRequest,
): UploadStructureClearRequest | undefined {
  if (!first && !second) {
    return undefined;
  }

  const collections = normalizeList([
    ...(first?.collections ?? []),
    ...(second?.collections ?? []),
  ]);
  const contentFiles = normalizeList([
    ...(first?.contentFiles ?? []),
    ...(second?.contentFiles ?? []),
  ]);
  const columnsByCollection = new Map<string, Set<string>>();

  for (const request of [first, second]) {
    for (const group of request?.columns ?? []) {
      const columns =
        columnsByCollection.get(group.collection) ?? new Set<string>();
      for (const column of group.columns) {
        const trimmed = column.trim();
        if (trimmed) {
          columns.add(trimmed);
        }
      }
      if (columns.size > 0) {
        columnsByCollection.set(group.collection, columns);
      }
    }
  }

  const columns = Array.from(columnsByCollection.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([collection, values]) => ({
      collection,
      columns: Array.from(values).sort(),
    }));

  if (
    collections.length === 0 &&
    contentFiles.length === 0 &&
    columns.length === 0
  ) {
    return undefined;
  }

  return {
    collections,
    contentFiles,
    columns,
  };
}

function parseCollectionColumn(value: string): {
  collection: string;
  column: string;
} {
  const trimmed = value.trim();
  const separatorIndex = trimmed.indexOf(".");

  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw new Error(
      `Invalid --clear-column value "${value}". Use the format <collection>.<column>.`,
    );
  }

  return {
    collection: trimmed.slice(0, separatorIndex),
    column: trimmed.slice(separatorIndex + 1),
  };
}

export function buildClearRequestFromOptions(
  options: MigrateConflictOptions,
): UploadStructureClearRequest | undefined {
  const collections = normalizeList(options.clearCollection ?? []);
  const contentFiles = normalizeList(options.clearContent ?? []);
  const columnsByCollection = new Map<string, Set<string>>();

  for (const value of options.clearColumn ?? []) {
    const { collection, column } = parseCollectionColumn(value);
    const columns = columnsByCollection.get(collection) ?? new Set<string>();
    columns.add(column);
    columnsByCollection.set(collection, columns);
  }

  const columns = Array.from(columnsByCollection.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([collection, values]) => ({
      collection,
      columns: Array.from(values).sort(),
    }));

  if (
    collections.length === 0 &&
    contentFiles.length === 0 &&
    columns.length === 0
  ) {
    return undefined;
  }

  return {
    collections,
    contentFiles,
    columns,
  };
}

function escapeShellValue(value: string): string {
  return /[^A-Za-z0-9._/-]/.test(value) ? JSON.stringify(value) : value;
}

function buildMigrateCommand(
  clear: UploadStructureClearRequest | undefined,
  options: MigrateConflictOptions,
  dangerousShortcut = false,
): string {
  const parts = ["atmyapp", "migrate"];

  for (const collection of clear?.collections ?? []) {
    parts.push("--clear-collection", escapeShellValue(collection));
  }

  for (const contentFile of clear?.contentFiles ?? []) {
    parts.push("--clear-content", escapeShellValue(contentFile));
  }

  for (const group of clear?.columns ?? []) {
    for (const column of group.columns) {
      parts.push(
        "--clear-column",
        escapeShellValue(`${group.collection}.${column}`),
      );
    }
  }

  if (dangerousShortcut) {
    parts.push("--dangerously-resolve-all-conflicts");
  }

  if (options.verbose) {
    parts.push("--verbose");
  }

  return parts.join(" ");
}

export function logMigrationConflictGuidance(
  conflict: UploadStructureConflict,
  logger: Logger,
  options: MigrateConflictOptions,
  attemptedClear?: UploadStructureClearRequest,
): void {
  const combinedClear = mergeClearRequests(attemptedClear, conflict.suggestedClear);

  logger.error(
    `Migration upload was blocked by a destructive change conflict on branch "${conflict.branch}".`,
  );
  logger.warn(
    "Nothing was cleared automatically. Your generated definitions were still saved locally.",
  );

  if (conflict.issues.length > 0) {
    logger.info("Why it was blocked:");
    for (const issue of conflict.issues) {
      logger.info(`  - ${issue.message}`);
    }
  }

  logger.info("Safe options:");
  logger.info(
    "  1. Keep the affected collections, content files, or fields in your schema for now and migrate again later.",
  );
  logger.info(
    "  2. Explicitly clear only the data you want to remove, then rerun migrate.",
  );

  for (const collection of conflict.suggestedClear.collections) {
    logger.info(
      `This will permanently delete all entries in collection "${collection}":`,
    );
    logger.info(
      `  ${buildMigrateCommand(
        { collections: [collection], contentFiles: [], columns: [] },
        options,
      )}`,
    );
  }

  for (const contentFile of conflict.suggestedClear.contentFiles) {
    logger.info(
      `This will permanently delete stored content for "${contentFile}":`,
    );
    logger.info(
      `  ${buildMigrateCommand(
        { collections: [], contentFiles: [contentFile], columns: [] },
        options,
      )}`,
    );
  }

  for (const group of conflict.suggestedClear.columns) {
    for (const column of group.columns) {
      logger.info(
        `This will permanently delete stored values for column "${group.collection}.${column}":`,
      );
      logger.info(
        `  ${buildMigrateCommand(
          {
            collections: [],
            contentFiles: [],
            columns: [{ collection: group.collection, columns: [column] }],
          },
          options,
        )}`,
      );
    }
  }

  if (combinedClear) {
    logger.info("Resolve all currently blocked items from this conflict:");
    logger.info(
      "This will permanently clear every blocked collection, content file, and column listed above, then rerun migration:",
    );
    logger.info(`  ${buildMigrateCommand(combinedClear, options)}`);
  }

  logger.info("Dangerous shortcut:");
  logger.info(
    "This will retry once and permanently clear every currently blocked item returned by the server for this migration attempt:",
  );
  logger.info(
    `  ${buildMigrateCommand(
      attemptedClear,
      options,
      true,
    )}`,
  );

  if (conflict.migration?.prompts?.length) {
    logger.info("Server migration hints:");
    for (const prompt of conflict.migration.prompts) {
      logger.info(`  - ${prompt.title}: ${prompt.message}`);
    }
  }
}
