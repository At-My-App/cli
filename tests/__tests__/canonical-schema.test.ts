import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { Logger } from "../../src/cli/logger";
import {
  findCanonicalSchemaFile,
  generateOutputFromCanonicalSchema,
  loadCanonicalSchemaFile,
} from "../../src/cli/utils/canonical-schema";

const logger = new Logger(false);

describe("canonical schema support", () => {
  it("loads canonical schema from ama.schema.json", async () => {
    const dir = mkdtempSync(join(process.cwd(), "test-canonical-json-"));
    try {
      writeFileSync(
        join(dir, "ama.schema.json"),
        JSON.stringify(
          {
            version: 1,
            events: {
              page_view: {
                columns: ["page", "timestamp"],
                description: "Tracked page views",
              },
            },
            definitions: {
              settings: {
                kind: "document",
                fields: {
                  theme: {
                    kind: "scalar",
                    scalar: "string",
                  },
                },
              },
            },
          },
          null,
          2
        )
      );

      const filePath = await findCanonicalSchemaFile(logger, dir);
      expect(filePath).toBe(join(dir, "ama.schema.json"));

      const schema = await loadCanonicalSchemaFile(filePath!, logger);
      expect(schema.definitions.settings.kind).toBe("document");

      const output = generateOutputFromCanonicalSchema(schema, {});
      expect(output.definitions["settings"]).toBeDefined();
      expect(output.definitions["settings"].type).toBe("jsonx");
      expect(output.events).toEqual({
        page_view: {
          columns: ["page", "timestamp"],
          description: "Tracked page views",
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads canonical schema from ama.schema.ts default export", async () => {
    const dir = mkdtempSync(join(process.cwd(), "test-canonical-schema-"));
    try {
      writeFileSync(
        join(dir, "ama.schema.ts"),
        `
          import { defineDocument, defineSchema, s } from "@atmyapp/structure";

          export default defineSchema({
            definitions: {
              settings: defineDocument({
                fields: {
                  theme: s.string(),
                },
              }),
            },
          });
        `
      );

      const schema = await loadCanonicalSchemaFile(
        join(dir, "ama.schema.ts"),
        logger
      );

      expect(schema.definitions.settings.kind).toBe("document");
      expect(schema.definitions.settings.path).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
