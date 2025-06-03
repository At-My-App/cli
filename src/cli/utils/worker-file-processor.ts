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

interface FileContent {
  path: string;
  structure: any;
  type?: string;
}

// Cache for TypeScript programs to avoid recompilation
const programCache = new Map<string, ts.Program>();

// Optimized function to process a single file in a worker
export async function processFileInWorker(
  filePath: string,
  tsconfigPath: string
): Promise<FileContent[]> {
  const contents: FileContent[] = [];

  // Create or reuse TypeScript project
  const resolvedTsConfigPath = resolve(process.cwd(), tsconfigPath);
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

  const project = new Project(projectOptions);
  const sourceFile = project.addSourceFileAtPath(filePath);

  // Look for ATMYAPP exports
  const atmyappExports = sourceFile.getTypeAliases().filter((alias) => {
    const name = alias.getName();
    const isExported = alias.isExported();
    return name === "ATMYAPP" && isExported;
  });

  if (atmyappExports.length === 0) {
    return contents;
  }

  // Process each ATMYAPP export
  for (const atmyappExport of atmyappExports) {
    const fileContents = await processAtmyappExportOptimized(
      atmyappExport,
      sourceFile,
      tsconfigPath
    );
    contents.push(...fileContents);
  }

  return contents;
}

// Optimized version that reuses TypeScript programs
async function processAtmyappExportOptimized(
  atmyappType: TypeAliasDeclaration,
  file: SourceFile,
  tsconfigPath: string
): Promise<FileContent[]> {
  const contents: FileContent[] = [];
  const filePath = file.getFilePath();

  // Extract definition types
  const definitionTypes = extractDefinitionTypes(atmyappType);
  if (definitionTypes.length === 0) {
    return contents;
  }

  // Create or reuse TypeScript program
  const resolvedTsConfigPath = resolve(process.cwd(), tsconfigPath);
  const cacheKey = `${filePath}:${resolvedTsConfigPath}`;

  let program = programCache.get(cacheKey);
  if (!program) {
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

    program = getProgramFromFiles([filePath], compilerOptions);
    programCache.set(cacheKey, program);
  }

  // Batch process all definition types for this file
  const schemaPromises = definitionTypes.map(async (definitionType) => {
    try {
      const schema = generateSchema(program!, definitionType, {
        required: true,
        noExtraProps: true,
        aliasRef: true,
        ref: false,
        defaultNumberType: "number",
        ignoreErrors: true,
        skipLibCheck: true,
      });

      return { definitionType, schema };
    } catch (error) {
      return { definitionType, schema: null, error };
    }
  });

  const schemaResults = await Promise.all(schemaPromises);

  // Process schema results
  for (const result of schemaResults) {
    if (!result.schema || !result.schema.properties) {
      continue;
    }

    const properties = result.schema.properties as any;
    const isEventDef =
      properties.type?.const === "event" ||
      (properties.__is_ATMYAPP_Object?.const === true &&
        properties.id &&
        properties.columns);

    if (isEventDef) {
      // Handle event definitions
      const eventContent = processEventDefinition(
        properties,
        result.definitionType
      );
      if (eventContent) {
        contents.push(eventContent);
      }
    } else {
      // Handle regular content definitions
      const contentDefinition = processContentDefinition(
        properties,
        result.definitionType
      );
      if (contentDefinition) {
        contents.push(contentDefinition);
      }
    }
  }

  return contents;
}

function extractDefinitionTypes(atmyappType: TypeAliasDeclaration): string[] {
  const typeNode = atmyappType.getTypeNode();

  if (!Node.isTupleTypeNode(typeNode) && !Node.isArrayTypeNode(typeNode)) {
    return [];
  }

  const elementTypes: string[] = [];

  if (Node.isTupleTypeNode(typeNode)) {
    typeNode.getElements().forEach((element) => {
      elementTypes.push(element.getText());
    });
  } else if (Node.isArrayTypeNode(typeNode)) {
    elementTypes.push(typeNode.getElementTypeNode().getText());
  }

  return elementTypes;
}

function processEventDefinition(
  properties: any,
  definitionType: string
): FileContent | null {
  let eventId: string | null = null;
  let columns: string[] = [];

  // Extract event ID
  if (properties.id?.const) {
    eventId = properties.id.const;
  }

  // Extract columns
  if (properties.columns?.const) {
    columns = properties.columns.const;
  } else if (properties.columns?.items?.const) {
    columns = properties.columns.items.const;
  } else if (
    properties.columns?.items &&
    Array.isArray(properties.columns.items)
  ) {
    columns = properties.columns.items
      .map((item: any) => item.const)
      .filter(Boolean);
  }

  if (!eventId || columns.length === 0) {
    return null;
  }

  return {
    path: eventId,
    structure: {
      type: "event",
      properties: {
        id: { const: eventId },
        columns: { const: columns },
        type: { const: "event" },
      },
    },
  };
}

function processContentDefinition(
  properties: any,
  definitionType: string
): FileContent | null {
  let path: string | null = null;
  let structure: any = null;

  // Extract path
  if (properties.path?.const) {
    path = properties.path.const;
  } else if (properties._path?.const) {
    path = properties._path.const;
  }

  // Extract structure
  if (properties.structure) {
    structure = properties.structure;
  } else if (properties.data) {
    structure = properties.data;
  } else if (properties._data) {
    structure = properties._data;
  }

  if (!path || !structure) {
    return null;
  }

  return { path, structure };
}
