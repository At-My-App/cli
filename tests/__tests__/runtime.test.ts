import {
  compileCanonicalSource,
  runCanonicalMigrate,
  uploadStructure,
} from "../../src/index";
import { uploadDefinitions } from "../../src/cli/utils/upload";

describe("CLI runtime canonical APIs", () => {
  const code = `
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
  `;

  it("compiles canonical source without the command layer", () => {
    const result = compileCanonicalSource({
      filename: "atmyapp.schema.ts",
      code,
    });

    expect(result.schema?.definitions.settings.kind).toBe("document");
    expect(result.compiled?.definitionsByName.settings.kind).toBe("document");
    expect(result.output?.definitions.settings.type).toBe("jsonx");
    expect(result.validation.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("supports named schema exports", () => {
    const result = compileCanonicalSource({
      filename: "atmyapp.schema.ts",
      code: `
        import { defineDocument, defineSchema, s } from "@atmyapp/structure";

        export const schema = defineSchema({
          definitions: {
            settings: defineDocument({
              fields: {
                theme: s.string(),
              },
            }),
          },
        });
      `,
    });

    expect(result.schema?.definitions.settings.kind).toBe("document");
    expect(result.errors).toEqual([]);
  });

  it("supports the DX-friendly composite s namespace in canonical source files", () => {
    const result = compileCanonicalSource({
      filename: "atmyapp.schema.ts",
      code: `
        import { defineDocument, defineSchema, s } from "@atmyapp/structure";

        export default defineSchema({
          definitions: {
            settings: defineDocument({
              fields: {
                seo: s.object({
                  optional: true,
                  description: "SEO settings",
                  fields: {
                    title: s.string(),
                    tags: s.array({
                      optional: true,
                      items: s.string(),
                    }),
                  },
                }),
              },
            }),
          },
        });
      `,
    });

    expect(result.schema?.definitions.settings.kind).toBe("document");
    expect(result.compiled?.fieldsByPath["settings.seo"]?.field.optional).toBe(
      true
    );
    expect(result.compiled?.fieldsByPath["settings.seo.tags"]?.description).toBe(
      undefined
    );
    expect(result.errors).toEqual([]);
  });

  it("runs canonical migrate in dry-run mode", async () => {
    const compiled = compileCanonicalSource({
      filename: "atmyapp.schema.ts",
      code,
    });

    if (!compiled.schema) {
      throw new Error("Expected schema to compile");
    }

    const result = await runCanonicalMigrate({
      schema: compiled.schema,
      config: { description: "Runtime migrate test" },
      dryRun: true,
    });

    expect(result.output.description).toBe("Runtime migrate test");
    expect(result.output.definitions.settings).toBeDefined();
    expect(result.errors).toEqual([]);
  });

  it("includes submissions in generated legacy output", () => {
    const result = compileCanonicalSource({
      filename: "atmyapp.schema.ts",
      code: `
        import { defineSchema, defineSubmission, s } from "@atmyapp/structure";

        export default defineSchema({
          definitions: {},
          submissions: {
            contact: defineSubmission({
              description: "Main contact form",
              fields: {
                email: s.email(),
              },
              captcha: {
                required: true,
                provider: "hcaptcha",
                secret: "secret",
              },
            }),
          },
        });
      `,
    });

    expect(result.output?.submissions).toEqual({
      contact: {
        description: "Main contact form",
        fields: {
          email: expect.objectContaining({
            kind: "scalar",
            scalar: "string",
            format: "email",
          }),
        },
        requiresCaptcha: true,
        captchaProvider: "hcaptcha",
        hcaptchaSecret: "secret",
      },
    });
  });

  it("parses destructive migration conflicts from upload responses", async () => {
    const result = await uploadStructure({
      output: {
        description: "Runtime migrate test",
        definitions: {},
        events: {},
        args: {},
      },
      url: "https://edge.atmyapp.test",
      token: "cli-ama-valid",
      fetchImplementation: jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            success: false,
            data: {
              code: "DESTRUCTIVE_STRUCTURE_CHANGE_REQUIRES_CLEAR",
              branch: "main",
              issues: [
                {
                  kind: "column_removal",
                  collectionName: "posts",
                  columnName: "seoTitle",
                  message:
                    "Column posts.seoTitle still contains data and cannot be removed yet.",
                },
              ],
              suggestedClear: {
                collections: [],
                contentFiles: [],
                columns: [
                  {
                    collection: "posts",
                    columns: ["seoTitle"],
                  },
                ],
              },
              migration: {
                changes: [],
                actions: [],
                prompts: [
                  {
                    title: "Clear posts.seoTitle first",
                    message:
                      "Remove or clear stored values before deleting the field from the schema.",
                    actionType: "clear_column",
                    fieldPath: "posts.seoTitle",
                  },
                ],
                blocking: true,
              },
            },
            error:
              "Structure update blocked because it would hide existing collection data.",
          }),
      }) as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toContain("Structure update blocked");
    expect(result.conflict?.code).toBe(
      "DESTRUCTIVE_STRUCTURE_CHANGE_REQUIRES_CLEAR"
    );
    expect(result.conflict?.branch).toBe("main");
    expect(result.conflict?.suggestedClear.columns).toEqual([
      {
        collection: "posts",
        columns: ["seoTitle"],
      },
    ]);
  });

  it("includes the clear payload when uploading a structure", async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await uploadStructure({
        output: {
          description: "Runtime migrate test",
          definitions: {},
          events: {},
          args: {},
          submissions: {
            contact: {
              description: "Contact form",
              fields: {},
              requiresCaptcha: true,
            },
          },
        },
        url: "https://edge.atmyapp.test",
        token: "cli-ama-valid",
        clear: {
          collections: ["posts"],
          contentFiles: ["homepage"],
          columns: [
            {
              collection: "authors",
              columns: ["bio"],
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://edge.atmyapp.test/storage/structure",
        expect.objectContaining({
          body: JSON.stringify({
            content: JSON.stringify({
              description: "Runtime migrate test",
              definitions: {},
              events: {},
              args: {},
              submissions: {
                contact: {
                  description: "Contact form",
                  fields: {},
                  requiresCaptcha: true,
                },
              },
            }),
            clear: {
              collections: ["posts"],
              contentFiles: ["homepage"],
              columns: [
                {
                  collection: "authors",
                  columns: ["bio"],
                },
              ],
            },
          }),
        })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns the conflict result unchanged from uploadDefinitions", async () => {
    const originalFetch = global.fetch;

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({
          success: false,
          data: {
            code: "DESTRUCTIVE_STRUCTURE_CHANGE_REQUIRES_CLEAR",
            branch: "preview",
            issues: [],
            suggestedClear: {
              collections: ["posts"],
              contentFiles: [],
              columns: [],
            },
          },
          error:
            "Structure update blocked because it would hide existing collection data.",
        }),
    }) as unknown as typeof fetch;

    try {
      const result = await uploadDefinitions(
        {
          description: "Runtime migrate test",
          definitions: {},
          events: {},
          args: {},
          submissions: {
            contact: {
              description: "Contact form",
              fields: {},
              requiresCaptcha: true,
            },
          },
        },
        {
          url: "https://edge.atmyapp.test",
          token: "cli-ama-valid",
        },
        {
          info: jest.fn(),
          success: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          verbose_log: jest.fn(),
        } as any,
        {
          collections: ["posts"],
          contentFiles: [],
          columns: [],
        }
      );

      expect(result.success).toBe(false);
      expect(result.conflict?.branch).toBe("preview");
      expect(result.conflict?.suggestedClear.collections).toEqual(["posts"]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
