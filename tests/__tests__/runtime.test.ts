import {
  compileCanonicalSource,
  runCanonicalMigrate,
} from "../../src/index";

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
});
