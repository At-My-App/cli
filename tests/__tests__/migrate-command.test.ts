jest.mock("../../src/cli/utils", () => ({
  getMigrateConfig: jest.fn(),
  Logger: jest.requireActual("../../src/cli/logger").Logger,
  buildClearRequestFromOptions: jest.requireActual(
    "../../src/cli/utils/migration-conflicts",
  ).buildClearRequestFromOptions,
  logMigrationConflictGuidance: jest.fn(),
  mergeClearRequests: jest.requireActual(
    "../../src/cli/utils/migration-conflicts",
  ).mergeClearRequests,
  findCanonicalSchemaFile: jest.fn(),
  loadCanonicalSchemaFile: jest.fn(),
  ensureAmaDirectory: jest.fn(),
  saveOutputToFile: jest.fn(),
  uploadDefinitions: jest.fn(),
}));

jest.mock("../../src/runtime", () => ({
  runCanonicalMigrate: jest.fn(),
}));

import { migrateCommand } from "../../src/cli/commands/migrate";
import {
  ensureAmaDirectory,
  findCanonicalSchemaFile,
  getMigrateConfig,
  loadCanonicalSchemaFile,
  logMigrationConflictGuidance,
  saveOutputToFile,
  uploadDefinitions,
} from "../../src/cli/utils";
import { runCanonicalMigrate } from "../../src/runtime";

describe("migrate command conflict resolution", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getMigrateConfig as jest.Mock).mockReturnValue({
      url: "https://edge.atmyapp.test",
      token: "cli-ama-valid",
    });
    (ensureAmaDirectory as jest.Mock).mockReturnValue(undefined);
    (findCanonicalSchemaFile as jest.Mock).mockResolvedValue(
      "/tmp/atmyapp.schema.ts",
    );
    (loadCanonicalSchemaFile as jest.Mock).mockResolvedValue({
      definitions: {},
    });
    (runCanonicalMigrate as jest.Mock).mockResolvedValue({
      output: {
        description: "Runtime migrate test",
        definitions: {},
        events: {},
        args: {},
      },
      logs: [],
      warnings: [],
      errors: [],
      timings: {
        generateMs: 1,
        uploadMs: 0,
        totalMs: 1,
      },
    });
    (saveOutputToFile as jest.Mock).mockReturnValue(undefined);
  });

  it("retries once with merged clear data when the dangerous flag is enabled", async () => {
    (uploadDefinitions as jest.Mock)
      .mockResolvedValueOnce({
        success: false,
        conflict: {
          code: "DESTRUCTIVE_STRUCTURE_CHANGE_REQUIRES_CLEAR",
          branch: "main",
          issues: [],
          suggestedClear: {
            collections: [],
            contentFiles: ["homepage"],
            columns: [
              {
                collection: "authors",
                columns: ["bio"],
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
      });

    const command = migrateCommand();
    await command.parseAsync([
      "node",
      "migrate",
      "--clear-collection",
      "posts",
      "--dangerously-resolve-all-conflicts",
    ]);

    expect(uploadDefinitions).toHaveBeenCalledTimes(2);
    expect((uploadDefinitions as jest.Mock).mock.calls[0][3]).toEqual({
      collections: ["posts"],
      contentFiles: [],
      columns: [],
    });
    expect((uploadDefinitions as jest.Mock).mock.calls[1][3]).toEqual({
      collections: ["posts"],
      contentFiles: ["homepage"],
      columns: [
        {
          collection: "authors",
          columns: ["bio"],
        },
      ],
    });
    expect(logMigrationConflictGuidance).not.toHaveBeenCalled();
  });
});
