import { TypeTransformer } from "../types/migrate";

/**
 * Extracts constant values from a JSON Schema-like definition.
 * Assumes all final fields are constants and skips any fields without const values.
 */
export function extractConstants(schema: any): any {
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
