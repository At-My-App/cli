import { Command } from "commander";
import chalk from "chalk";
import { getConfig } from "../utils/config";
import fg from "fast-glob";
import {
  Project,
  SourceFile,
  TypeAliasDeclaration,
  ProjectOptions,
} from "ts-morph";
import * as ts from "typescript";
import { resolve } from "path";
import { generateSchema, getProgramFromFiles } from "typescript-json-schema";
import { writeFileSync, mkdirSync, existsSync } from "fs";

// Types for better code organization
interface Content {
  path: string;
  structure: any;
  type?: string;
}

interface OutputDefinition {
  description: string;
  definitions: Record<string, { structure: any }>;
  args: any[];
}

interface MigrateOptions {
  dryRun: boolean;
  verbose: boolean;
  tsconfig: string;
  continueOnError: boolean;
}

/**
 * Extracts constant values from a JSON Schema-like definition.
 * Assumes all final fields are constants and skips any fields without const values.
 *
 * @param schema The JSON Schema definition object
 * @returns An object containing only the constant values
 */
function extractConstants(schema: any): any {
  // If not an object or doesn't have properties, return null
  if (!schema || typeof schema !== "object" || !schema.properties) {
    return null;
  }

  const result: any = {};

  // Process each property in the schema
  for (const [key, propDef] of Object.entries(schema.properties)) {
    if (typeof propDef === "object" && propDef !== null) {
      if ("const" in propDef) {
        // If property has a const value, add it to the result
        result[key] = propDef.const;
      } else if (
        "type" in propDef &&
        propDef.type === "object" &&
        "properties" in propDef
      ) {
        // If it's a nested object, recursively process it
        const nestedResult = extractConstants(propDef);
        if (nestedResult) {
          result[key] = nestedResult;
        }
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// Interface for type transformers
interface TypeTransformer {
  canTransform: (obj: any) => boolean;
  transform: (obj: any) => any;
}

// Registry of type transformers
const typeTransformers: TypeTransformer[] = [
  {
    // Transformer for AMA image types
    canTransform: (obj) =>
      obj?.properties?.__amatype?.const &&
      obj?.properties?.__amatype?.const === "AmaImageDef" &&
      obj?.properties?.__config,
    transform: (obj) => {
      return {
        __amatype: obj.properties.__amatype.const,
        config: extractConstants(obj.properties.__config),
      };
    },
  },
  {
    // Transformer for AMA file types
    canTransform: (obj) =>
      obj?.properties?.__amatype?.const &&
      obj?.properties?.__amatype?.const === "AmaFileDef" &&
      obj?.properties?.__config,
    transform: (obj) => {
      return {
        __amatype: obj.properties.__amatype.const,
        config: extractConstants(obj.properties.__config),
      };
    },
  },
];

// Register a new type transformer
export function registerTypeTransformer(transformer: TypeTransformer): void {
  typeTransformers.push(transformer);
}

// Recursively process the JSON structure to transform special types
export function processSpecialTypes(schema: any): any {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  // If it's an array, process each item
  if (Array.isArray(schema)) {
    return schema.map(processSpecialTypes);
  }

  // Check if this object should be transformed
  for (const transformer of typeTransformers) {
    if (transformer.canTransform(schema)) {
      return transformer.transform(schema);
    }
  }

  // Process object properties recursively
  const result: any = {};
  for (const key in schema) {
    result[key] = processSpecialTypes(schema[key]);
  }
  return result;
}

/**
 * Logger utility to handle verbose logging
 */
class Logger {
  private verbose: boolean;

  constructor(verbose: boolean) {
    this.verbose = verbose;
  }

  info(message: string): void {
    console.log(chalk.blue(message));
  }

  success(message: string): void {
    console.log(chalk.green(message));
  }

  error(message: string, error?: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(message), error ? chalk.red(errorMessage) : "");
  }

  verbose_log(message: string): void {
    if (this.verbose) {
      console.log(chalk.cyan(`[VERBOSE] ${message}`));
    }
  }

  warn(message: string): void {
    console.warn(chalk.yellow(message));
  }
}

// Scans for TypeScript files based on config patterns
async function scanFiles(
  patterns: string[],
  logger: Logger
): Promise<string[]> {
  logger.info("🔍 Scanning files...");
  logger.verbose_log(`Using patterns: ${patterns.join(", ")}`);

  const files = await fg(patterns, {
    ignore: ["**/node_modules/**", "**/test/**", "**/dist/**"],
    absolute: true,
    cwd: process.cwd(),
  });

  logger.verbose_log(`Found ${files.length} files matching patterns`);
  return files;
}

// Creates and configures the TypeScript project
function createProject(
  files: string[],
  tsconfigPath: string,
  logger: Logger
): Project {
  const resolvedTsConfigPath = resolve(process.cwd(), tsconfigPath);

  if (!existsSync(resolvedTsConfigPath)) {
    logger.warn(
      `tsconfig at ${resolvedTsConfigPath} not found, using default compiler options`
    );
  } else {
    logger.verbose_log(`Using tsconfig from ${resolvedTsConfigPath}`);
  }

  const projectOptions: ProjectOptions = {
    tsConfigFilePath: existsSync(resolvedTsConfigPath)
      ? resolvedTsConfigPath
      : undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: !existsSync(resolvedTsConfigPath)
      ? {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.NodeJs,
          esModuleInterop: true,
          jsx: ts.JsxEmit.React,
          skipLibCheck: true,
        }
      : undefined,
  };

  logger.verbose_log("Creating ts-morph Project");
  const project = new Project(projectOptions);

  logger.verbose_log(`Adding ${files.length} source files to project`);
  project.addSourceFilesAtPaths(files);

  return project;
}

// Processes a single type alias to extract content information
function processTypeAlias(
  alias: TypeAliasDeclaration,
  file: SourceFile,
  tsconfigPath: string,
  logger: Logger
): Content | null {
  const aliasName = alias.getName();

  if (!aliasName.startsWith("_AMA_")) {
    logger.verbose_log(`Skipping non-AMA type: ${aliasName}`);
    return null;
  }

  logger.verbose_log(
    `Processing AMA type: ${aliasName} in ${file.getFilePath()}`
  );

  const resolvedTsConfigPath = resolve(process.cwd(), tsconfigPath);
  const compilerOptions = existsSync(resolvedTsConfigPath)
    ? { configFile: resolvedTsConfigPath }
    : {
        target: ts.ScriptTarget.ES2015,
        module: ts.ModuleKind.ESNext,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        jsx: ts.JsxEmit.Preserve,
      };

  const program = getProgramFromFiles([file.getFilePath()], compilerOptions);

  logger.verbose_log(`Generating schema for ${aliasName}`);
  const schema = generateSchema(program, aliasName, {
    required: true,
    noExtraProps: true,
    aliasRef: true,
    ref: false,
    defaultNumberType: "number",
    ignoreErrors: true,
    skipLibCheck: true,
  });

  if (!schema) {
    throw new Error(`Failed to generate schema for ${aliasName}`);
  }

  const pathMatch = alias
    .getType()
    .getText()
    .match(/["'](.*?)["']/);
  if (!pathMatch?.[1]) {
    throw new Error(`Missing file path in ${aliasName}`);
  }

  if (!schema.properties) {
    throw new Error(`Invalid schema structure in ${aliasName}`);
  }

  const internal = schema.properties as any;

  logger.verbose_log(`Successfully extracted content from ${aliasName}`);
  return {
    path: internal["path"]["const"] as string,
    structure: internal["structure"] || internal["config"],
  };
}

// Processes all files to extract contents
function processFiles(
  sourceFiles: SourceFile[],
  tsconfigPath: string,
  continueOnError: boolean,
  logger: Logger
): {
  contents: Content[];
  errors: string[];
  successCount: number;
  failureCount: number;
} {
  const contents: Content[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  logger.info(`📚 Processing ${sourceFiles.length} source files...`);

  sourceFiles.forEach((file) => {
    logger.verbose_log(`Examining file: ${file.getFilePath()}`);
    const aliases = file.getTypeAliases();
    logger.verbose_log(
      `Found ${aliases.length} type aliases in ${file.getFilePath()}`
    );

    aliases.forEach((alias) => {
      try {
        const content = processTypeAlias(alias, file, tsconfigPath, logger);
        if (content) {
          contents.push(content);
          successCount++;
          logger.verbose_log(`Successfully processed ${alias.getName()}`);
        }
      } catch (err) {
        failureCount++;
        const errorMessage = `❌ ${file.getFilePath()} - ${alias.getName()} - ${
          err instanceof Error ? err.message : "Unknown error"
        }`;
        errors.push(errorMessage);
        logger.error(errorMessage);

        if (!continueOnError) {
          throw err;
        }
      }
    });
  });

  return { contents, errors, successCount, failureCount };
}

// Determines the content type based on its structure and path
function determineContentType(content: Content): string {
  // Extract file extension
  const fileExt = content.path.split(".").pop()?.toLowerCase();

  // Check for image types based on structure or extension
  if (content.structure?.__amatype === "AmaImageDef") {
    return "image";
  }

  // Check for file types
  if (content.structure?.__amatype === "AmaFileDef") {
    return "file";
  }

  // Default type for other content
  return "jsonx";
}

// Generates the final output definition
function generateOutput(
  contents: Content[],
  config: any,
  logger: Logger
): OutputDefinition {
  logger.verbose_log("Processing contents and transforming special types");

  // Process each content to transform special types
  const processedContents = contents.map((content) => {
    logger.verbose_log(`Transforming special types for path: ${content.path}`);
    return {
      ...content,
      structure: processSpecialTypes(content.structure),
      type: determineContentType(content),
    };
  });

  logger.verbose_log("Generating final output definition");
  return {
    description: config.description || "AMA Definitions",
    definitions: processedContents.reduce(
      (acc, curr) => ({
        ...acc,
        [curr.path]: {
          type: curr.type,
          structure: curr.structure,
        },
      }),
      {}
    ),
    args: config.args || {},
  };
}

async function getFetchImplementation(): Promise<typeof fetch> {
  // Use native fetch if available (Node.js 18+)
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }

  // Fallback to node-fetch for older Node.js versions
  try {
    // @ts-ignore
    const nodeFetch = await import("node-fetch");
    return nodeFetch.default as unknown as typeof fetch;
  } catch (error) {
    throw new Error(
      "Neither native fetch nor node-fetch is available. For Node.js < 18, install node-fetch package."
    );
  }
}

// Uploads the generated definitions to the AtMyApp platform
async function uploadDefinitions(
  output: OutputDefinition,
  config: any,
  logger: Logger
): Promise<boolean> {
  if (!(config as any).url) {
    logger.error(
      "Base URL not provided in session. Please run 'use' command first."
    );
    return false;
  }

  try {
    const fetchApi = await getFetchImplementation();
    const url = `${(config as any).url}/storage/structure`;

    logger.info(`🔄 Posting definitions to server at ${url}`);

    const response = await fetchApi(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(config as any).token}`,
      },
      body: JSON.stringify({ content: JSON.stringify(output) }),
    });
    const responseText = await response.text();
    logger.verbose_log(`Server response: ${responseText}`);

    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${responseText}`
      );
    }

    logger.success("🚀 Successfully posted definitions to storage.");
    return true;
  } catch (postError) {
    logger.error("❌ Failed to post definitions:", postError);
    return false;
  }
}

// Ensures the .ama directory exists
function ensureAmaDirectory(logger: Logger): void {
  const amaDir = "./.ama";
  if (!existsSync(amaDir)) {
    logger.verbose_log(
      `Creating .ama directory at ${resolve(process.cwd(), amaDir)}`
    );
    mkdirSync(amaDir, { recursive: true });
  } else {
    logger.verbose_log(
      `.ama directory already exists at ${resolve(process.cwd(), amaDir)}`
    );
  }
}

// Saves the output definition to a local file
function saveOutputToFile(output: OutputDefinition, logger: Logger): void {
  const outputPath = "./.ama/definitions.json";
  logger.verbose_log(
    `Saving definitions to ${resolve(process.cwd(), outputPath)}`
  );
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  logger.success(`✅ Successfully generated ${outputPath}`);
}

// Main migrate command function
export function migrateCommand(): Command {
  return new Command("migrate")
    .description("Migrate definitions to AtMyApp platform")
    .option(
      "--dry-run",
      "Generate definitions without uploading to server",
      false
    )
    .option("--verbose", "Enable verbose logging", false)
    .option("--tsconfig <path>", "Path to tsconfig.json", "tsconfig.json")
    .option(
      "--continue-on-error",
      "Continue processing even if some files fail",
      false
    )
    .action(async (options: MigrateOptions) => {
      const logger = new Logger(options.verbose);

      try {
        logger.info("🚀 Starting migration process");
        logger.verbose_log(`Options: ${JSON.stringify(options)}`);

        const config = getConfig();
        const patterns = config.include || ["**/*.ts", "**/*.tsx"];

        // Create .ama directory if it doesn't exist
        ensureAmaDirectory(logger);

        // Execute migration steps
        const files = await scanFiles(patterns, logger);
        logger.info(`📚 Found ${files.length} files to process`);

        const project = createProject(files, options.tsconfig, logger);
        const { contents, errors, successCount, failureCount } = processFiles(
          project.getSourceFiles(),
          options.tsconfig,
          options.continueOnError,
          logger
        );

        // Report processing results
        logger.success(
          `✅ Successfully processed ${successCount} AMA contents`
        );

        if (failureCount > 0) {
          logger.warn(`⚠️ Failed to process ${failureCount} items`);
          if (options.verbose && errors.length > 0) {
            logger.info("Errors encountered:");
            errors.forEach((err) => logger.error(`  ${err}`));
          }
        }

        if (contents.length === 0) {
          logger.error("No valid AMA contents found. Exiting.");
          process.exit(1);
        }

        // Generate and save output
        const output = generateOutput(contents, config, logger);
        saveOutputToFile(output, logger);

        // Upload definitions unless dry-run is enabled
        if (!options.dryRun) {
          logger.info("Uploading definitions to AtMyApp platform");
          const uploadSuccess = await uploadDefinitions(output, config, logger);

          if (!uploadSuccess) {
            logger.warn(
              "Upload failed, but definitions were generated successfully"
            );
            process.exit(1);
          }
        } else {
          logger.info("Dry run mode enabled. Skipping upload to server.");
        }

        logger.success("Migration completed successfully");
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Fatal error: ${message}`, error);
        process.exit(1);
      }
    });
}
