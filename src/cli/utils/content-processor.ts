import { Logger } from "../logger";
import { Content, OutputDefinition, EventConfig } from "../types/migrate";
import { processSpecialTypes } from "./type-transformers";
import {
  definitionPipeline,
  registerBuiltInProcessors,
  registerBuiltInValidators,
  registerBuiltInOutputTransformers,
} from "./definition-processor";

// Initialize the pipeline with built-in components
function initializePipeline(): void {
  // Always register built-in components
  registerBuiltInProcessors();
  registerBuiltInValidators();
  registerBuiltInOutputTransformers();
}

// Determines the content type based on its structure and path
export function determineContentType(content: Content): string {
  // Extract file extension
  const fileExt = content.path.split(".").pop()?.toLowerCase();

  if (content.type === "collection") {
    return "collection";
  }

  // Check for event types - support both custom events and basic events
  if (
    content.structure?.type === "event" ||
    content.structure?.type === "basic_event" ||
    content.structure?.properties?.type?.const === "event" ||
    content.structure?.properties?.type?.const === "basic_event" ||
    content.structure?.__amatype === "AmaCustomEventDef" ||
    content.structure?.__amatype === "AmaEventDef"
  ) {
    return "event";
  }

  // Check for icon types based on structure
  if (content.structure?.__amatype === "AmaIconDef") {
    return "icon";
  }

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

// Extracts event configuration from event content
function extractEventConfig(content: Content): EventConfig | null {
  try {
    let columns: string[] = [];
    let eventId: string = "";

    // Try to extract from different possible structures
    if (content.structure?.properties?.columns?.const) {
      columns = content.structure.properties.columns.const;
    } else if (content.structure?.properties?.columns?.items?.const) {
      // Handle array of constants
      columns = content.structure.properties.columns.items.const;
    } else if (content.structure?.columns) {
      columns = content.structure.columns;
    }

    // Extract event ID
    if (content.structure?.properties?.id?.const) {
      eventId = content.structure.properties.id.const;
    } else if (content.structure?.id) {
      eventId = content.structure.id;
    }

    // For basic events, columns might be empty (they use Record<string, string>)
    // So we allow empty columns array for basic events
    if (eventId) {
      return { columns };
    }
  } catch (error) {
    // Silent failure, let the caller handle
  }
  return null;
}

// Generates the final output definition using the processing pipeline
export function generateOutput(
  contents: Content[],
  config: any,
  logger: Logger
): OutputDefinition {
  // Initialize the pipeline with built-in components
  initializePipeline();

  logger.verbose_log("Processing contents through definition pipeline");

  // Process definitions through the pipeline
  const { processedContents, validationResults } =
    definitionPipeline.processDefinitions(contents, config, logger);

  // Log validation summary
  const validationErrors = validationResults.reduce(
    (sum, result) => sum + result.errors.length,
    0
  );
  const validationWarnings = validationResults.reduce(
    (sum, result) => sum + result.warnings.length,
    0
  );

  if (validationErrors > 0) {
    logger.warn(`Found ${validationErrors} validation errors`);
  }
  if (validationWarnings > 0) {
    logger.warn(`Found ${validationWarnings} validation warnings`);
  }

  // Apply special type transformations to processed contents
  logger.verbose_log("Applying special type transformations");
  const transformedContents = processedContents.map((content) => {
    logger.verbose_log(`Transforming special types for path: ${content.path}`);
    return {
      ...content,
      structure: processSpecialTypes(content.structure),
    };
  });

  // Separate events from regular definitions
  const events: Record<string, EventConfig> = {};
  const definitions: Record<string, { structure: any; type?: string }> = {};

  transformedContents.forEach((content) => {
    const contentType = determineContentType(content);

    if (contentType === "event") {
      logger.verbose_log(`Processing event: ${content.path}`);

      // Extract event ID from path or structure
      let eventId = content.path;
      if (content.structure?.properties?.id?.const) {
        eventId = content.structure.properties.id.const;
      } else if (content.structure?.id) {
        eventId = content.structure.id;
      }

      const eventConfig = extractEventConfig(content);
      if (eventConfig) {
        events[eventId] = eventConfig;
        logger.verbose_log(
          `Added event "${eventId}" with columns: ${eventConfig.columns.join(", ")}`
        );
      } else {
        logger.warn(
          `Failed to extract event configuration for ${content.path}`
        );
      }
    } else {
      // Regular definition
      definitions[content.path] = {
        type: content.type,
        structure: content.structure,
      };
    }
  });

  logger.verbose_log("Generating base output definition");
  const baseOutput: OutputDefinition = {
    description: config.description || "AMA Definitions",
    definitions,
    events,
    args: config.args || {},
  };

  // Transform the final output through the pipeline
  logger.verbose_log("Applying output transformations");
  const finalOutput = definitionPipeline.transformOutput(
    baseOutput,
    config,
    logger
  );

  // Log pipeline statistics
  const stats = definitionPipeline.getStats();
  logger.verbose_log(
    `Pipeline used ${stats.processors} processors, ${stats.validators} validators, ${stats.transformers} transformers`
  );

  logger.verbose_log(
    `Generated ${Object.keys(finalOutput.definitions).length} definitions and ${Object.keys(finalOutput.events).length} events`
  );

  return finalOutput;
}

// Export pipeline for external access and customization
export { definitionPipeline };
