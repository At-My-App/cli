import { Logger, type LogEntry } from "../../src/cli/logger";
import {
  buildClearRequestFromOptions,
  logMigrationConflictGuidance,
  mergeClearRequests,
} from "../../src/cli/utils/migration-conflicts";
import type { UploadStructureConflict } from "../../src/runtime";

describe("migration conflict helpers", () => {
  const conflict: UploadStructureConflict = {
    code: "DESTRUCTIVE_STRUCTURE_CHANGE_REQUIRES_CLEAR",
    branch: "main",
    issues: [
      {
        kind: "collection_removal",
        collectionName: "posts",
        message: "Collection posts still has entries.",
      },
      {
        kind: "content_removal",
        definitionName: "homepage",
        message: "Structured content homepage still exists.",
      },
      {
        kind: "column_removal",
        collectionName: "authors",
        columnName: "bio",
        message: "Column authors.bio still contains values.",
      },
    ],
    suggestedClear: {
      collections: ["posts"],
      contentFiles: ["homepage"],
      columns: [
        {
          collection: "authors",
          columns: ["bio"],
        },
      ],
    },
    migration: {
      changes: [],
      actions: [],
      prompts: [
        {
          title: "Clear authors.bio first",
          message: "Remove stored values before deleting the field.",
          actionType: "clear_column",
        },
      ],
      blocking: true,
    },
  };

  it("builds a clear payload from repeatable migrate flags", () => {
    expect(
      buildClearRequestFromOptions({
        clearCollection: ["posts", "posts"],
        clearContent: ["homepage"],
        clearColumn: ["authors.bio", "authors.avatar", "authors.bio"],
      }),
    ).toEqual({
      collections: ["posts"],
      contentFiles: ["homepage"],
      columns: [
        {
          collection: "authors",
          columns: ["avatar", "bio"],
        },
      ],
    });
  });

  it("merges previously requested clears with newly suggested clears", () => {
    expect(
      mergeClearRequests(
        {
          collections: ["posts"],
          contentFiles: [],
          columns: [
            {
              collection: "authors",
              columns: ["bio"],
            },
          ],
        },
        {
          collections: [],
          contentFiles: ["homepage"],
          columns: [
            {
              collection: "authors",
              columns: ["avatar"],
            },
          ],
        },
      ),
    ).toEqual({
      collections: ["posts"],
      contentFiles: ["homepage"],
      columns: [
        {
          collection: "authors",
          columns: ["avatar", "bio"],
        },
      ],
    });
  });

  it("prints copyable individual, combined, and dangerous commands", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger(false, {
      silent: true,
      onLog: (entry) => {
        entries.push(entry);
      },
    });

    logMigrationConflictGuidance(
      conflict,
      logger,
      {
        verbose: true,
        dangerousResolveAllConflicts: false,
      },
      {
        collections: ["existing"],
        contentFiles: [],
        columns: [],
      },
    );

    const output = entries.map((entry) => entry.message).join("\n");

    expect(output).toContain('Migration upload was blocked by a destructive change conflict on branch "main".');
    expect(output).toContain(
      'This will permanently delete all entries in collection "posts":',
    );
    expect(output).toContain("atmyapp migrate --clear-collection posts --verbose");
    expect(output).toContain(
      'This will permanently delete stored content for "homepage":',
    );
    expect(output).toContain("atmyapp migrate --clear-content homepage --verbose");
    expect(output).toContain(
      'This will permanently delete stored values for column "authors.bio":',
    );
    expect(output).toContain(
      "atmyapp migrate --clear-column authors.bio --verbose",
    );
    expect(output).toContain(
      "atmyapp migrate --clear-collection existing --clear-collection posts --clear-content homepage --clear-column authors.bio --verbose",
    );
    expect(output).toContain(
      "atmyapp migrate --clear-collection existing --dangerously-resolve-all-conflicts --verbose",
    );
  });
});
