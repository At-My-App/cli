import { Logger } from "../logger";

const RESERVED_FIELD_NAMES = new Set(["id", "created_at"]);
const PRIMITIVE_TYPES = new Set(["string", "number", "boolean", "null"]);
const SUPPORTED_TYPES = new Set([...PRIMITIVE_TYPES, "array", "object"]);

const AMA_ASSET_TYPE_MAP: Record<string, { format: string; semanticType?: string }> = {
  AmaImage: { format: "image" },
  AmaFile: { format: "file" },
  AmaIcon: { format: "image", semanticType: "image" },
};

interface JsonSchema {
  [key: string]: any;
}

function detectAmaAssetField(
  schema: JsonSchema
): { format: string; semanticType?: string; imageOptions?: JsonSchema } | null {
  const structureProperties = schema?.properties?.structure?.properties;
  const amaType = structureProperties?.__amatype?.const;

  if (typeof amaType !== "string") {
    return null;
  }

  const assetMapping = AMA_ASSET_TYPE_MAP[amaType];
  if (!assetMapping) {
    return null;
  }

  let imageOptions: JsonSchema | undefined;
  const configSchema = structureProperties?.__config?.properties;

  if (configSchema && configSchema.imageOptions) {
    const optionsSchema = configSchema.imageOptions as JsonSchema;
    imageOptions = optionsSchema.const ?? optionsSchema.default ?? undefined;
  }

  return {
    format: assetMapping.format,
    semanticType: assetMapping.semanticType,
    ...(imageOptions ? { imageOptions } : {}),
  };
}

function detectAmaMdxField(
  schema: JsonSchema
): { mdxConfig: string } | null {
  const amaType = schema?.properties?.__amatype?.const;
  if (amaType !== "AmaMdxDef") {
    return null;
  }

  const mdxConfigConst = schema?.properties?.mdxConfig?.const;
  if (typeof mdxConfigConst === "string") {
    return { mdxConfig: mdxConfigConst };
  }

  const mdxConfigEnum = schema?.properties?.mdxConfig?.enum;
  if (Array.isArray(mdxConfigEnum) && typeof mdxConfigEnum[0] === "string") {
    return { mdxConfig: mdxConfigEnum[0] };
  }

  return null;
}

function ensureDescription(
  description: unknown,
  fallback: string
): string {
  if (typeof description === "string" && description.trim().length > 0) {
    return description.trim();
  }
  return fallback;
}

function normalizeType(type: unknown): string | null {
  if (typeof type === "string") {
    return type;
  }

  if (Array.isArray(type)) {
    const withoutNull = type.filter((value) => value !== "null");

    if (withoutNull.length === 1) {
      return withoutNull[0] as string;
    }

    if (withoutNull.length === 0 && type.includes("null")) {
      return "null";
    }
  }

  return null;
}

function inferType(schema: JsonSchema): string | null {
  let type = normalizeType(schema.type);

  if (!type && Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumTypes = new Set(schema.enum.map((value: unknown) => typeof value));

    if (enumTypes.size === 1) {
      type = enumTypes.has("string")
        ? "string"
        : enumTypes.has("number")
          ? "number"
          : enumTypes.has("boolean")
            ? "boolean"
            : null;
    }
  }

  if (!type) {
    switch (typeof schema.const) {
      case "string":
        type = "string";
        break;
      case "number":
        type = "number";
        break;
      case "boolean":
        type = "boolean";
        break;
      default:
        break;
    }
  }

  return type;
}

function copyProperties(target: JsonSchema, source: JsonSchema, keys: string[]): void {
  keys.forEach((key) => {
    if (key in source) {
      target[key] = source[key];
    }
  });
}

function convertArrayItems(
  schema: JsonSchema,
  fieldName: string,
  logger: Logger,
  breadcrumb: string
): JsonSchema | null {
  if (!schema.items) {
    logger.error(
      `Collection conversion failed for field "${breadcrumb}": array items schema is missing.`
    );
    return null;
  }

  return convertField(schema.items as JsonSchema, fieldName, logger, `${breadcrumb}[]`);
}

function convertObjectProperties(
  schema: JsonSchema,
  logger: Logger,
  breadcrumb: string
): { properties: Record<string, JsonSchema>; required?: string[] } | null {
  const rawProperties = schema.properties;
  const converted: Record<string, JsonSchema> = {};

  if (!rawProperties || typeof rawProperties !== "object") {
    return { properties: converted };
  }

  for (const [childName, childSchema] of Object.entries(rawProperties)) {
    const childBreadcrumb = `${breadcrumb}.${childName}`;
    const convertedChild = convertField(
      childSchema as JsonSchema,
      childName,
      logger,
      childBreadcrumb
    );

    if (!convertedChild) {
      logger.error(
        `Collection conversion failed for field "${childBreadcrumb}": unsupported schema.`
      );
      return null;
    }

    converted[childName] = convertedChild;
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((value: unknown) => typeof value === "string")
    : undefined;

  return { properties: converted, required };
}

function convertField(
  schema: JsonSchema,
  fieldName: string,
  logger: Logger,
  breadcrumb: string
): JsonSchema | null {
  if (!schema || typeof schema !== "object") {
    logger.error(
      `Collection conversion failed for field "${breadcrumb}": schema is not an object.`
    );
    return null;
  }

  const amaAsset = detectAmaAssetField(schema);
  if (amaAsset) {
    const description = ensureDescription(
      schema.description,
      `Generated description for ${breadcrumb}`
    );

    const base: JsonSchema = {
      type: "string",
      description,
      format: amaAsset.format,
    };

    if (amaAsset.semanticType) {
      base.semanticType = amaAsset.semanticType;
    }

    if (amaAsset.imageOptions) {
      base.imageOptions = amaAsset.imageOptions;
    }

    return base;
  }

  const mdxField = detectAmaMdxField(schema);
  if (mdxField) {
    const description = ensureDescription(
      schema.description,
      `Generated description for ${breadcrumb}`
    );

    return {
      type: "string",
      description,
      format: "mdx",
      storeInBlob: true,
      __amatype: "AmaMdxDef",
      mdxConfig: mdxField.mdxConfig,
    };
  }

  let type = inferType(schema);

  if (!type) {
    logger.error(
      `Collection conversion failed for field "${breadcrumb}": could not determine field type.`
    );
    return null;
  }

  if (type === "integer") {
    type = "number";
  }

  if (!SUPPORTED_TYPES.has(type)) {
    logger.error(
      `Collection conversion failed for field "${breadcrumb}": unsupported field type "${type}".`
    );
    return null;
  }

  const description = ensureDescription(
    schema.description,
    `Generated description for ${breadcrumb}`
  );

  const base: JsonSchema = { type, description };

  if (PRIMITIVE_TYPES.has(type)) {
    copyProperties(base, schema, [
      "enum",
      "default",
      "format",
      "semanticType",
      "storeInBlob",
      "imageOptions",
      "maxLength",
      "minLength",
      "pattern",
      "minimum",
      "maximum",
      "multipleOf",
    ]);
    return base;
  }

  if (type === "array") {
    const items = convertArrayItems(schema, fieldName, logger, breadcrumb);
    if (!items) {
      return null;
    }

    base.items = items;
    copyProperties(base, schema, ["minItems", "maxItems", "uniqueItems", "default"]);
    return base;
  }

  // Object type
  const converted = convertObjectProperties(schema, logger, breadcrumb);
  if (!converted) {
    return null;
  }

  if (Object.keys(converted.properties).length > 0) {
    base.properties = converted.properties;
  }

  if (converted.required && converted.required.length > 0) {
    base.required = converted.required;
  }

  copyProperties(base, schema, ["default"]);
  return base;
}

function extractIndexes(configSchema: JsonSchema | undefined): (string | string[])[] | undefined {
  const indexedColumnsSchema = configSchema?.properties?.indexedColumns;

  if (!indexedColumnsSchema) {
    return undefined;
  }

  const value = indexedColumnsSchema.const ?? indexedColumnsSchema.default;

  if (!Array.isArray(value)) {
    return undefined;
  }

  const indexes = value.filter((entry: unknown) => typeof entry === "string");

  if (indexes.length === 0) {
    return undefined;
  }

  return indexes.slice(0, 10) as string[];
}

export function isAmaCollectionStructure(structure: unknown): boolean {
  return Boolean(
    structure &&
    typeof structure === "object" &&
    (structure as JsonSchema).properties?.__rowType
  );
}

export function convertAmaCollectionStructure(
  path: string,
  structure: JsonSchema,
  logger: Logger
): JsonSchema | null {
  if (!isAmaCollectionStructure(structure)) {
    return null;
  }

  const rowTypeSchema = structure.properties?.__rowType;

  if (!rowTypeSchema || typeof rowTypeSchema !== "object") {
    logger.error(
      `Collection conversion failed for "${path}": missing __rowType definition.`
    );
    return null;
  }

  const rowTypeType = inferType(rowTypeSchema);

  if (rowTypeType !== "object") {
    logger.error(
      `Collection conversion failed for "${path}": __rowType is not an object.`
    );
    return null;
  }

  const rawFields = rowTypeSchema.properties;
  if (!rawFields || typeof rawFields !== "object") {
    logger.error(
      `Collection conversion failed for "${path}": __rowType has no properties.`
    );
    return null;
  }

  const properties: Record<string, JsonSchema> = {};

  for (const [fieldName, fieldSchema] of Object.entries(rawFields)) {
    if (RESERVED_FIELD_NAMES.has(fieldName)) {
      logger.error(
        `Collection conversion failed for "${path}": field "${fieldName}" is reserved.`
      );
      return null;
    }

    const converted = convertField(
      fieldSchema as JsonSchema,
      fieldName,
      logger,
      `${path}.${fieldName}`
    );

    if (!converted) {
      return null;
    }

    properties[fieldName] = converted;
  }

  const required = Array.isArray(rowTypeSchema.required)
    ? rowTypeSchema.required.filter((value: unknown) => typeof value === "string")
    : [];

  const description = ensureDescription(
    structure.description,
    `Generated collection for ${path}`
  );

  const indexes = extractIndexes(structure.properties?.__config);

  const collectionStructure: JsonSchema = {
    description,
    properties,
  };

  if (required.length > 0) {
    collectionStructure.required = required;
  }

  if (indexes && indexes.length > 0) {
    collectionStructure.indexes = indexes;
  }

  return collectionStructure;
}
