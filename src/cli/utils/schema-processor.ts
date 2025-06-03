import fg from "fast-glob";
import {
  Project,
  SourceFile,
  TypeAliasDeclaration,
  ProjectOptions,
  Node,
} from "ts-morph";
import * as ts from "typescript";
import { resolve } from "path";
import { generateSchema, getProgramFromFiles } from "typescript-json-schema";
import { existsSync } from "fs";
import { Logger } from "../logger";
import { Content, ProcessingResult } from "../types/migrate";

// Scans for TypeScript files based on config patterns
export async function scanFiles(
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
export function createProject(
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

// Extracts individual definition types from ATMYAPP array
function extractDefinitionTypes(
  atmyappType: TypeAliasDeclaration,
  logger: Logger
): string[] {
  const typeNode = atmyappType.getTypeNode();

  if (!Node.isTupleTypeNode(typeNode) && !Node.isArrayTypeNode(typeNode)) {
    logger.warn(
      `ATMYAPP export should be an array/tuple type in ${atmyappType.getSourceFile().getFilePath()}`
    );
    return [];
  }

  const elementTypes: string[] = [];

  if (Node.isTupleTypeNode(typeNode)) {
    // Handle tuple types: [Type1, Type2, ...]
    typeNode.getElements().forEach((element) => {
      const elementText = element.getText();
      elementTypes.push(elementText);
      logger.verbose_log(`Found definition type: ${elementText}`);
    });
  } else if (Node.isArrayTypeNode(typeNode)) {
    // Handle array types: Type[]
    const elementText = typeNode.getElementTypeNode().getText();
    elementTypes.push(elementText);
    logger.verbose_log(`Found definition type: ${elementText}`);
  }

  return elementTypes;
}

// Extract event information directly from TypeScript AST
function extractEventInfoFromAST(
  file: SourceFile,
  definitionType: string,
  logger: Logger
): { id: string; columns: string[] } | null {
  try {
    // Find the type alias declaration for this definition type
    const typeAlias = file.getTypeAlias(definitionType);
    if (!typeAlias) {
      logger.verbose_log(`Could not find type alias for ${definitionType}`);
      return null;
    }

    const typeNode = typeAlias.getTypeNode();
    if (!typeNode) {
      logger.verbose_log(`Type alias ${definitionType} has no type node`);
      return null;
    }

    // Check if this is a type reference (like AmaCustomEventDef<...>)
    if (Node.isTypeReference(typeNode)) {
      const typeName = typeNode.getTypeName();
      const typeArguments = typeNode.getTypeArguments();

      // Check if this is AmaCustomEventDef
      if (
        Node.isIdentifier(typeName) &&
        typeName.getText() === "AmaCustomEventDef"
      ) {
        if (typeArguments.length >= 2) {
          // First argument should be the event ID (string literal)
          const idArg = typeArguments[0];
          let eventId: string | null = null;

          if (Node.isLiteralTypeNode(idArg)) {
            const literal = idArg.getLiteral();
            if (Node.isStringLiteral(literal)) {
              eventId = literal.getLiteralValue();
            }
          }

          // Second argument should be the columns (tuple of string literals)
          const columnsArg = typeArguments[1];
          let columns: string[] = [];

          if (Node.isTupleTypeNode(columnsArg)) {
            columnsArg.getElements().forEach((element) => {
              if (Node.isLiteralTypeNode(element)) {
                const literal = element.getLiteral();
                if (Node.isStringLiteral(literal)) {
                  columns.push(literal.getLiteralValue());
                }
              }
            });
          }

          if (eventId && columns.length > 0) {
            logger.verbose_log(
              `AST extraction successful for ${definitionType}: id=${eventId}, columns=[${columns.join(", ")}]`
            );
            return { id: eventId, columns };
          }
        }
      }
    }

    logger.verbose_log(
      `Failed to extract event info from AST for ${definitionType}`
    );
    return null;
  } catch (error) {
    logger.verbose_log(
      `Error during AST extraction for ${definitionType}: ${error}`
    );
    return null;
  }
}

// Processes an ATMYAPP export to extract content definitions
export function processAtmyappExport(
  atmyappType: TypeAliasDeclaration,
  file: SourceFile,
  tsconfigPath: string,
  logger: Logger
): Content[] {
  const contents: Content[] = [];

  logger.verbose_log(`Processing ATMYAPP export in ${file.getFilePath()}`);

  // Extract individual definition types from the array
  const definitionTypes = extractDefinitionTypes(atmyappType, logger);

  if (definitionTypes.length === 0) {
    logger.warn(
      `No definition types found in ATMYAPP export in ${file.getFilePath()}`
    );
    return contents;
  }

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

  // Process each definition type
  for (const definitionType of definitionTypes) {
    try {
      logger.verbose_log(
        `Generating schema for definition type: ${definitionType}`
      );

      const schema = generateSchema(program, definitionType, {
        required: true,
        noExtraProps: true,
        aliasRef: true,
        ref: false,
        defaultNumberType: "number",
        ignoreErrors: true,
        skipLibCheck: true,
      });

      if (!schema) {
        logger.warn(`Failed to generate schema for ${definitionType}`);
        continue;
      }

      if (!schema.properties) {
        // For event definitions, the schema generator might fail due to generics
        // Try to extract event information directly from the TypeScript AST
        logger.verbose_log(
          `Schema has no properties. Attempting AST-based extraction for ${definitionType}`
        );

        // Try to extract event definition from TypeScript AST
        const eventInfo = extractEventInfoFromAST(file, definitionType, logger);
        if (eventInfo) {
          logger.verbose_log(
            `Successfully extracted event via AST: ${eventInfo.id} with columns: ${eventInfo.columns.join(", ")}`
          );
          contents.push({
            path: eventInfo.id,
            structure: {
              type: "event",
              properties: {
                id: { const: eventInfo.id },
                columns: { const: eventInfo.columns },
                type: { const: "event" },
              },
            },
          });
          continue;
        }

        logger.warn(`Invalid schema structure for ${definitionType}`);
        continue;
      }

      const properties = schema.properties as any;

      // Debug: Log the actual schema structure
      logger.verbose_log(
        `Schema for ${definitionType}: ${JSON.stringify(properties, null, 2)}`
      );

      // Check if this is an event definition
      const isEventDef =
        properties.type?.const === "event" ||
        (properties.__is_ATMYAPP_Object?.const === true &&
          properties.id &&
          properties.columns);

      if (isEventDef) {
        // Handle AmaCustomEventDef - use id as path and extract event structure
        let eventId: string | null = null;
        let columns: string[] = [];

        // Extract event ID - try different possible structures
        if (properties.id?.const) {
          eventId = properties.id.const;
        } else if (properties.id?.enum && properties.id.enum.length === 1) {
          eventId = properties.id.enum[0];
        } else if (properties.id?.type === "string" && properties.id?.title) {
          // Fallback: try to extract from title or other metadata
          eventId = properties.id.title;
        }

        // Extract columns - try different possible structures
        if (properties.columns?.const) {
          columns = properties.columns.const;
        } else if (properties.columns?.items?.const) {
          columns = properties.columns.items.const;
        } else if (
          properties.columns?.items &&
          Array.isArray(properties.columns.items)
        ) {
          // Handle array of const items - extract const value from each item
          columns = properties.columns.items
            .map((item: any) => item.const)
            .filter(Boolean);
        } else if (properties.columns?.items?.enum) {
          // Handle tuple type where each position has enum with single value
          columns = properties.columns.items.enum;
        } else if (
          properties.columns?.enum &&
          Array.isArray(properties.columns.enum[0])
        ) {
          // Handle case where columns is an enum with array values
          columns = properties.columns.enum[0];
        }

        // Debug: Log what we extracted
        logger.verbose_log(
          `Extracted from ${definitionType}: eventId=${eventId}, columns=${JSON.stringify(columns)}`
        );

        if (!eventId) {
          logger.warn(`Could not extract event ID from ${definitionType}`);
          continue;
        }

        if (columns.length === 0) {
          logger.warn(`Could not extract columns from ${definitionType}`);
          continue;
        }

        logger.verbose_log(
          `Successfully extracted event: ${eventId} with columns: ${columns.join(", ")}`
        );

        // Create event content with special structure
        contents.push({
          path: eventId, // Use event ID as path
          structure: {
            type: "event",
            properties: {
              id: { const: eventId },
              columns: { const: columns },
              type: { const: "event" },
            },
          },
        });
      } else {
        // Handle regular AmaContentDef - extract path and structure
        let path: string | null = null;
        let structure: any = null;

        // Look for path in different possible locations
        if (properties.path?.const) {
          path = properties.path.const;
        } else if (properties._path?.const) {
          path = properties._path.const;
        }

        // Look for structure/data in different possible locations
        if (properties.structure) {
          structure = properties.structure;
        } else if (properties.data) {
          structure = properties.data;
        } else if (properties._data) {
          structure = properties._data;
        }

        if (!path) {
          logger.warn(`Could not extract path from ${definitionType}`);
          continue;
        }

        if (!structure) {
          logger.warn(`Could not extract structure from ${definitionType}`);
          continue;
        }

        logger.verbose_log(`Successfully extracted content: ${path}`);
        contents.push({
          path,
          structure,
        });
      }
    } catch (err) {
      logger.error(`Error processing definition type ${definitionType}:`, err);
    }
  }

  return contents;
}

// Processes all files to extract contents
export function processFiles(
  sourceFiles: SourceFile[],
  tsconfigPath: string,
  continueOnError: boolean,
  logger: Logger
): ProcessingResult {
  const contents: Content[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  logger.info(`📚 Processing ${sourceFiles.length} source files...`);

  sourceFiles.forEach((file) => {
    logger.verbose_log(`Examining file: ${file.getFilePath()}`);

    // Look for exported ATMYAPP type aliases
    const atmyappExports = file.getTypeAliases().filter((alias) => {
      const name = alias.getName();
      const isExported = alias.isExported();
      return name === "ATMYAPP" && isExported;
    });

    logger.verbose_log(
      `Found ${atmyappExports.length} ATMYAPP exports in ${file.getFilePath()}`
    );

    atmyappExports.forEach((atmyappExport) => {
      try {
        const fileContents = processAtmyappExport(
          atmyappExport,
          file,
          tsconfigPath,
          logger
        );
        contents.push(...fileContents);
        successCount += fileContents.length;
        logger.verbose_log(
          `Successfully processed ${fileContents.length} definitions from ATMYAPP export`
        );
      } catch (err) {
        failureCount++;
        const errorMessage = `❌ ${file.getFilePath()} - ATMYAPP export - ${
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
