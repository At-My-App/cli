import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { Logger } from "../../src/cli/logger";
import {
  DEFAULT_CANONICAL_SCHEMA_FILENAME,
  findCanonicalSchemaFile,
  generateCanonicalSchemaTemplate,
  generateOutputFromCanonicalSchema,
  initializeCanonicalSchema,
  loadCanonicalSchemaFile,
} from "../../src/cli/utils/canonical-schema";

const logger = new Logger(false);

describe("canonical schema support", () => {
  it("loads canonical schema from atmyapp.schema.json", async () => {
    const dir = mkdtempSync(join(process.cwd(), "test-canonical-json-"));
    try {
      writeFileSync(
        join(dir, "atmyapp.schema.json"),
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
      expect(filePath).toBe(join(dir, "atmyapp.schema.json"));

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

  it("loads canonical schema from atmyapp.schema.ts default export", async () => {
    const dir = mkdtempSync(join(process.cwd(), "test-canonical-schema-"));
    try {
      writeFileSync(
        join(dir, "atmyapp.schema.ts"),
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
        join(dir, "atmyapp.schema.ts"),
        logger
      );

      expect(schema.definitions.settings.kind).toBe("document");
      expect(schema.definitions.settings.path).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves submissions in generated canonical output", () => {
    const output = generateOutputFromCanonicalSchema(
      {
        version: 1,
        definitions: {},
        submissions: {
          contact: {
            description: "Contact form",
            fields: {
              email: {
                kind: "scalar",
                scalar: "string",
                format: "email",
              },
            },
            captcha: {
              required: true,
              provider: "hcaptcha",
              secret: "secret",
            },
          },
        },
      },
      {}
    );

    expect(output.submissions).toEqual({
      contact: {
        description: "Contact form",
        fields: {
          email: {
            kind: "scalar",
            scalar: "string",
            format: "email",
          },
        },
        requiresCaptcha: true,
        captchaProvider: "hcaptcha",
        hcaptchaSecret: "secret",
      },
    });
  });

  it("prefers atmyapp.schema over ama.schema when both exist", async () => {
    const dir = mkdtempSync(join(process.cwd(), "test-canonical-prefer-"));
    try {
      writeFileSync(join(dir, "ama.schema.ts"), "export default { version: 1, definitions: {} };\n");
      writeFileSync(
        join(dir, "atmyapp.schema.ts"),
        "export default { version: 1, definitions: { settings: { kind: 'document', fields: {} } } };\n",
      );

      const filePath = await findCanonicalSchemaFile(logger, dir);

      expect(filePath).toBe(join(dir, "atmyapp.schema.ts"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("initializes a starter schema at the default path", async () => {
    const dir = mkdtempSync(join(process.cwd(), "test-canonical-init-"));
    try {
      const result = await initializeCanonicalSchema(logger, { cwd: dir });

      expect(result.schemaPath).toBe(join(dir, DEFAULT_CANONICAL_SCHEMA_FILENAME));
      expect(result.clientPath).toBe(join(dir, "atmyapp.client.ts"));

      const schema = await loadCanonicalSchemaFile(result.schemaPath, logger);
      expect(schema.definitions.siteSettings.kind).toBe("document");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can generate a starter json schema template", () => {
    const template = generateCanonicalSchemaTemplate(
      "atmyapp.schema.json",
      "empty",
    );
    const parsed = JSON.parse(template);

    expect(parsed.version).toBe(1);
    expect(parsed.definitions).toEqual({});
  });

  it("creates a blog template with schema and client files", async () => {
    const dir = mkdtempSync(join(process.cwd(), "test-canonical-blog-"));
    try {
      const result = await initializeCanonicalSchema(logger, {
        cwd: dir,
        template: "blog",
      });

      expect(result.clientPath).toBe(join(dir, "atmyapp.client.ts"));

      const schema = await loadCanonicalSchemaFile(result.schemaPath, logger);
      expect(schema.definitions.hero.kind).toBe("document");
      expect(schema.definitions.blogPosts.kind).toBe("collection");

      const clientFile = result.files.find((file) => file.kind === "client");
      expect(clientFile?.content).toContain("export const client");
      expect(clientFile?.content).toContain('client.collections.list("blogPosts")');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
