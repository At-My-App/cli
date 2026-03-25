import fg from "fast-glob";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, extname, parse, relative, resolve } from "path";
import { type SchemaDocument } from "@atmyapp/structure";
import { Logger } from "../logger";
import { OutputDefinition } from "../types/migrate";
import { compileCanonicalSource, generateLegacyOutput } from "../../runtime";

export const CANONICAL_SCHEMA_PATTERNS = [
  "atmyapp.schema.ts",
  "atmyapp.schema.mts",
  "atmyapp.schema.js",
  "atmyapp.schema.mjs",
  "atmyapp.schema.json",
  "ama.schema.ts",
  "ama.schema.mts",
  "ama.schema.js",
  "ama.schema.mjs",
  "ama.schema.json",
] as const;

export type CanonicalSchemaTemplateName = "empty" | "minimal" | "blog";

export const DEFAULT_CANONICAL_SCHEMA_FILENAME = "atmyapp.schema.ts";
export const DEFAULT_CANONICAL_SCHEMA_TEMPLATE: CanonicalSchemaTemplateName =
  "minimal";

type CanonicalSchemaTemplateFormat = "module" | "json";

type GeneratedTemplateFileKind = "schema" | "client";

export interface GeneratedCanonicalTemplateFile {
  kind: GeneratedTemplateFileKind;
  path: string;
  content: string;
}

export interface InitializeCanonicalSchemaOptions {
  cwd?: string;
  filePath?: string;
  template?: CanonicalSchemaTemplateName;
  force?: boolean;
}

export interface InitializeCanonicalSchemaResult {
  template: CanonicalSchemaTemplateName;
  schemaPath: string;
  clientPath?: string;
  files: GeneratedCanonicalTemplateFile[];
}

const MODULE_SCHEMA_TEMPLATES: Record<CanonicalSchemaTemplateName, string> = {
  empty: `import { defineSchema } from "@atmyapp/structure";

export const schema = defineSchema({
  definitions: {},
});

export default schema;
`,
  minimal: `import { defineDocument, defineSchema, s } from "@atmyapp/structure";

export const schema = defineSchema({
  definitions: {
    siteSettings: defineDocument({
      path: "content/site-settings.json",
      fields: {
        title: s.string({ default: "Hello from AtMyApp" }),
        description: s.string({ format: "long", default: "" }),
        ctaLabel: s.string({ default: "Learn more" }),
        ctaHref: s.string({ format: "url", default: "https://example.com" }),
      },
    }),
  },
});

export default schema;
`,
  blog: `import {
  defineCollection,
  defineDocument,
  defineSchema,
  s,
} from "@atmyapp/structure";

export const schema = defineSchema({
  definitions: {
    hero: defineDocument({
      path: "content/hero.json",
      fields: {
        eyebrow: s.string({ default: "Fresh stories" }),
        title: s.string({ default: "Publish your next post with AtMyApp" }),
        description: s.string({ format: "long", default: "" }),
        ctaLabel: s.string({ default: "Read the blog" }),
        ctaHref: s.string({ format: "url", default: "https://example.com/blog" }),
        heroImage: s.image({ optional: true }),
      },
    }),
    blogPosts: defineCollection({
      fields: {
        title: s.string({ min: 3 }),
        slug: s.string({ format: "short" }),
        excerpt: s.string({ format: "long", default: "" }),
        content: s.markdown(),
        author: s.string({ default: "Editorial team" }),
        coverImage: s.image({ optional: true }),
        published: s.boolean({ default: false }),
        publishedAt: s.date({ optional: true }),
      },
      indexes: ["slug", "published"],
    }),
  },
});

export default schema;
`,
};

const JSON_SCHEMA_TEMPLATES: Record<CanonicalSchemaTemplateName, Record<string, unknown>> =
  {
    empty: {
      version: 1,
      definitions: {},
    },
    minimal: {
      version: 1,
      definitions: {
        siteSettings: {
          kind: "document",
          path: "content/site-settings.json",
          fields: {
            title: {
              kind: "scalar",
              scalar: "string",
              default: "Hello from AtMyApp",
            },
            description: {
              kind: "scalar",
              scalar: "string",
              format: "long",
              default: "",
            },
            ctaLabel: {
              kind: "scalar",
              scalar: "string",
              default: "Learn more",
            },
            ctaHref: {
              kind: "scalar",
              scalar: "string",
              format: "url",
              default: "https://example.com",
            },
          },
        },
      },
    },
    blog: {
      version: 1,
      definitions: {
        hero: {
          kind: "document",
          path: "content/hero.json",
          fields: {
            eyebrow: {
              kind: "scalar",
              scalar: "string",
              default: "Fresh stories",
            },
            title: {
              kind: "scalar",
              scalar: "string",
              default: "Publish your next post with AtMyApp",
            },
            description: {
              kind: "scalar",
              scalar: "string",
              format: "long",
              default: "",
            },
            ctaLabel: {
              kind: "scalar",
              scalar: "string",
              default: "Read the blog",
            },
            ctaHref: {
              kind: "scalar",
              scalar: "string",
              format: "url",
              default: "https://example.com/blog",
            },
            heroImage: {
              kind: "blob",
              blobType: "image",
              optional: true,
            },
          },
        },
        blogPosts: {
          kind: "collection",
          fields: {
            title: {
              kind: "scalar",
              scalar: "string",
              minLength: 3,
            },
            slug: {
              kind: "scalar",
              scalar: "string",
              format: "short",
            },
            excerpt: {
              kind: "scalar",
              scalar: "string",
              format: "long",
              default: "",
            },
            content: {
              kind: "scalar",
              scalar: "string",
              format: "markdown",
            },
            author: {
              kind: "scalar",
              scalar: "string",
              default: "Editorial team",
            },
            coverImage: {
              kind: "blob",
              blobType: "image",
              optional: true,
            },
            published: {
              kind: "scalar",
              scalar: "boolean",
              default: false,
            },
            publishedAt: {
              kind: "scalar",
              scalar: "date",
              optional: true,
            },
          },
          indexes: ["slug", "published"],
        },
      },
    },
  };

function getSchemaPatternPriority(filePath: string, cwd: string): number {
  const normalized = relative(cwd, filePath).replace(/\\/g, "/");
  const index = CANONICAL_SCHEMA_PATTERNS.indexOf(
    normalized as (typeof CANONICAL_SCHEMA_PATTERNS)[number],
  );

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function detectTemplateFormat(filePath: string): CanonicalSchemaTemplateFormat {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".json") {
    return "json";
  }

  if (
    extension === ".ts" ||
    extension === ".mts" ||
    extension === ".js" ||
    extension === ".mjs"
  ) {
    return "module";
  }

  throw new Error(
    `Unsupported schema file extension "${extension || "<none>"}". Use .ts, .mts, .js, .mjs, or .json.`,
  );
}

function templateUsesClient(template: CanonicalSchemaTemplateName): boolean {
  return template === "minimal" || template === "blog";
}

function getClientFilePath(schemaFilePath: string): string {
  const parsed = parse(schemaFilePath);
  const extension = parsed.ext.toLowerCase();

  if (extension === ".json") {
    throw new Error(
      "Client-enabled templates require a module schema file. Use .ts, .mts, .js, or .mjs.",
    );
  }

  const baseName = parsed.name.endsWith(".schema")
    ? parsed.name.slice(0, -".schema".length)
    : parsed.name;

  return resolve(parsed.dir, `${baseName}.client${parsed.ext}`);
}

function getSchemaImportPath(schemaFilePath: string): string {
  const parsed = parse(schemaFilePath);
  const extension = parsed.ext.toLowerCase();
  const baseImport = `./${parsed.name}`;

  return extension === ".js" || extension === ".mjs"
    ? `${baseImport}${parsed.ext}`
    : baseImport;
}

function buildClientTemplate(
  schemaFilePath: string,
  template: CanonicalSchemaTemplateName,
): string {
  const schemaImportPath = getSchemaImportPath(schemaFilePath);
  const shared = `import { createAtMyAppClient } from "@atmyapp/core";
import { schema } from "${schemaImportPath}";

export { schema };

const baseUrl =
  process.env.ATMYAPP_URL ||
  process.env.ATMYAPP_API_URL ||
  process.env.ATMYAPP_BASE_URL ||
  "";

const apiKey = process.env.ATMYAPP_API_KEY || "";

export const client = createAtMyAppClient({
  apiKey,
  baseUrl,
  schema,
});
`;

  if (template === "blog") {
    return `${shared}
export const getHero = () => client.storage.getValue("hero");

export const listBlogPosts = () => client.collections.list("blogPosts");

export default client;
`;
  }

  return `${shared}
export const getSiteSettings = () => client.storage.getValue("siteSettings");

export default client;
`;
}

function buildSchemaTemplate(
  filePath: string,
  template: CanonicalSchemaTemplateName,
): string {
  const format = detectTemplateFormat(filePath);

  if (format === "json") {
    return `${JSON.stringify(JSON_SCHEMA_TEMPLATES[template], null, 2)}\n`;
  }

  return MODULE_SCHEMA_TEMPLATES[template];
}

function buildTemplateFiles(
  schemaFilePath: string,
  template: CanonicalSchemaTemplateName,
): GeneratedCanonicalTemplateFile[] {
  const files: GeneratedCanonicalTemplateFile[] = [
    {
      kind: "schema",
      path: schemaFilePath,
      content: buildSchemaTemplate(schemaFilePath, template),
    },
  ];

  if (templateUsesClient(template)) {
    files.push({
      kind: "client",
      path: getClientFilePath(schemaFilePath),
      content: buildClientTemplate(schemaFilePath, template),
    });
  }

  return files;
}

function isMissingFileError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function findCanonicalSchemaFile(
  logger: Logger,
  cwd = process.cwd(),
): Promise<string | null> {
  const matches = await fg([...CANONICAL_SCHEMA_PATTERNS], {
    cwd,
    absolute: true,
    onlyFiles: true,
    dot: false,
  });

  if (matches.length === 0) {
    return null;
  }

  const sortedMatches = matches.sort((left, right) => {
    const leftPriority = getSchemaPatternPriority(left, cwd);
    const rightPriority = getSchemaPatternPriority(right, cwd);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.localeCompare(right);
  });

  const [selected, ...extra] = sortedMatches;
  if (extra.length > 0) {
    logger.warn(
      `Multiple canonical schema files found. Using ${selected} and ignoring ${extra.join(", ")}`,
    );
  }

  return selected;
}

export async function loadCanonicalSchemaFile(
  filePath: string,
  logger: Logger,
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
  config: Record<string, unknown>,
): OutputDefinition {
  return generateLegacyOutput(schema, config);
}

export function generateCanonicalSchemaTemplate(
  filePath: string,
  template: CanonicalSchemaTemplateName = DEFAULT_CANONICAL_SCHEMA_TEMPLATE,
): string {
  return buildSchemaTemplate(filePath, template);
}

export async function initializeCanonicalSchema(
  logger: Logger,
  options: InitializeCanonicalSchemaOptions = {},
): Promise<InitializeCanonicalSchemaResult> {
  const cwd = options.cwd ?? process.cwd();
  const requestedPath =
    options.filePath?.trim() || DEFAULT_CANONICAL_SCHEMA_FILENAME;
  const template = options.template ?? DEFAULT_CANONICAL_SCHEMA_TEMPLATE;
  const resolvedSchemaPath = resolve(cwd, requestedPath);
  const format = detectTemplateFormat(resolvedSchemaPath);

  if (format === "json" && templateUsesClient(template)) {
    throw new Error(
      `The "${template}" template creates a client file, so the schema path must use .ts, .mts, .js, or .mjs.`,
    );
  }

  const existingCanonicalPath = await findCanonicalSchemaFile(logger, cwd);
  if (
    existingCanonicalPath &&
    resolve(existingCanonicalPath) !== resolvedSchemaPath
  ) {
    throw new Error(
      `A canonical schema already exists at ${existingCanonicalPath}. Remove it first or reuse that path.`,
    );
  }

  const files = buildTemplateFiles(resolvedSchemaPath, template);

  for (const file of files) {
    try {
      await readFile(file.path, "utf8");
      if (!options.force) {
        throw new Error(
          `File already exists at ${file.path}. Re-run with --force to overwrite it.`,
        );
      }
    } catch (error) {
      if (!isMissingFileError(error)) {
        if (error instanceof Error) {
          throw error;
        }

        throw new Error(String(error));
      }
    }
  }

  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content, "utf8");
  }

  logger.success(`Created ${template} template at ${resolvedSchemaPath}.`);

  const clientFile = files.find((file) => file.kind === "client");

  return {
    template,
    schemaPath: resolvedSchemaPath,
    clientPath: clientFile?.path,
    files,
  };
}
