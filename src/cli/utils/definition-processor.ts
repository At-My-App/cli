import { Logger } from "../logger";
import { Content, OutputDefinition } from "../types/migrate";

// Definition processing pipeline interfaces
export interface DefinitionProcessor {
  name: string;
  process: (content: Content, context: ProcessingContext) => Content | null;
}

export interface ProcessingContext {
  logger: Logger;
  config: any;
  allContents: Content[];
  currentIndex: number;
}

export interface OutputTransformer {
  name: string;
  transform: (
    output: OutputDefinition,
    context: ProcessingContext
  ) => OutputDefinition;
}

export interface ValidationRule {
  name: string;
  validate: (content: Content, context: ProcessingContext) => ValidationResult;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Registry for processors, transformers, and validators
class DefinitionProcessingPipeline {
  private processors: DefinitionProcessor[] = [];
  private outputTransformers: OutputTransformer[] = [];
  private validators: ValidationRule[] = [];

  // Register a definition processor
  addProcessor(processor: DefinitionProcessor): void {
    this.processors.push(processor);
  }

  // Register an output transformer
  addOutputTransformer(transformer: OutputTransformer): void {
    this.outputTransformers.push(transformer);
  }

  // Register a validation rule
  addValidator(validator: ValidationRule): void {
    this.validators.push(validator);
  }

  // Process definitions through the pipeline
  processDefinitions(
    contents: Content[],
    config: any,
    logger: Logger
  ): { processedContents: Content[]; validationResults: ValidationResult[] } {
    const processedContents: Content[] = [];
    const validationResults: ValidationResult[] = [];

    logger.verbose_log(
      `Processing ${contents.length} definitions through pipeline`
    );

    contents.forEach((content, index) => {
      const context: ProcessingContext = {
        logger,
        config,
        allContents: contents,
        currentIndex: index,
      };

      // Validate content
      const validation = this.validateContent(content, context);
      validationResults.push(validation);

      if (!validation.isValid) {
        logger.error(
          `Validation failed for ${content.path}: ${validation.errors.join(", ")}`
        );
        return; // Skip processing invalid content
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach((warning) =>
          logger.warn(`Warning for ${content.path}: ${warning}`)
        );
      }

      // Process content through processors
      let processedContent: Content | null = content;

      for (const processor of this.processors) {
        if (processedContent === null) break;

        logger.verbose_log(
          `Applying processor: ${processor.name} to ${content.path}`
        );
        try {
          processedContent = processor.process(processedContent, context);
        } catch (error) {
          logger.error(
            `Processor ${processor.name} failed for ${content.path}:`,
            error
          );
          processedContent = null;
          break;
        }
      }

      if (processedContent !== null) {
        processedContents.push(processedContent);
        logger.verbose_log(`Successfully processed ${content.path}`);
      }
    });

    return { processedContents, validationResults };
  }

  // Transform the final output
  transformOutput(
    output: OutputDefinition,
    config: any,
    logger: Logger
  ): OutputDefinition {
    let transformedOutput = output;
    const context: ProcessingContext = {
      logger,
      config,
      allContents: [],
      currentIndex: 0,
    };

    for (const transformer of this.outputTransformers) {
      logger.verbose_log(`Applying output transformer: ${transformer.name}`);
      try {
        transformedOutput = transformer.transform(transformedOutput, context);
      } catch (error) {
        logger.error(`Output transformer ${transformer.name} failed:`, error);
      }
    }

    return transformedOutput;
  }

  // Validate a single content item
  private validateContent(
    content: Content,
    context: ProcessingContext
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    for (const validator of this.validators) {
      try {
        const validationResult = validator.validate(content, context);

        if (!validationResult.isValid) {
          result.isValid = false;
        }

        result.errors.push(...validationResult.errors);
        result.warnings.push(...validationResult.warnings);
      } catch (error) {
        result.isValid = false;
        result.errors.push(
          `Validator ${validator.name} failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return result;
  }

  // Clear all registered processors, transformers, and validators
  clear(): void {
    this.processors = [];
    this.outputTransformers = [];
    this.validators = [];
  }

  // Get pipeline statistics
  getStats(): { processors: number; transformers: number; validators: number } {
    return {
      processors: this.processors.length,
      transformers: this.outputTransformers.length,
      validators: this.validators.length,
    };
  }
}

// Global pipeline instance
export const definitionPipeline = new DefinitionProcessingPipeline();

// Built-in processors
export const builtInProcessors = {
  // Processor to determine content type
  typeDetector: {
    name: "type-detector",
    process: (content: Content, context: ProcessingContext): Content => {
      const { logger } = context;

      // Extract file extension
      const fileExt = content.path.split(".").pop()?.toLowerCase();

      // Check for event types first
      if (
        content.structure?.type === "event" ||
        content.structure?.properties?.type?.const === "event" ||
        content.structure?.__amatype === "AmaCustomEventDef"
      ) {
        content.type = "event";
      } else if (content.structure?.__amatype === "AmaIconDef") {
        content.type = "icon";
      } else if (content.structure?.__amatype === "AmaImageDef") {
        content.type = "image";
      } else if (content.structure?.__amatype === "AmaFileDef") {
        content.type = "file";
      } else if (
        ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(fileExt || "")
      ) {
        content.type = "image";
      } else if (["pdf", "doc", "docx", "txt", "md"].includes(fileExt || "")) {
        content.type = "file";
      } else {
        content.type = "jsonx";
      }

      logger.verbose_log(`Detected type "${content.type}" for ${content.path}`);
      return content;
    },
  } as DefinitionProcessor,

  // Processor to normalize paths
  pathNormalizer: {
    name: "path-normalizer",
    process: (content: Content, context: ProcessingContext): Content => {
      const { logger } = context;

      // Normalize path separators
      const normalizedPath = content.path.replace(/\\/g, "/");

      // Remove leading slashes
      const cleanPath = normalizedPath.replace(/^\/+/, "");

      if (cleanPath !== content.path) {
        logger.verbose_log(
          `Normalized path from "${content.path}" to "${cleanPath}"`
        );
        content.path = cleanPath;
      }

      return content;
    },
  } as DefinitionProcessor,
};

// Built-in validators
export const builtInValidators = {
  // Validator to check if path is provided
  pathValidator: {
    name: "path-validator",
    validate: (
      content: Content,
      context: ProcessingContext
    ): ValidationResult => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      if (typeof content.path !== "string") {
        result.isValid = false;
        result.errors.push("Content must have a valid path");
      } else if (content.path.trim() === "") {
        result.isValid = false;
        result.errors.push("Content path cannot be empty");
      }

      return result;
    },
  } as ValidationRule,

  // Validator to check for duplicate paths
  duplicatePathValidator: {
    name: "duplicate-path-validator",
    validate: (
      content: Content,
      context: ProcessingContext
    ): ValidationResult => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const { allContents, currentIndex } = context;
      const duplicates = allContents.filter(
        (other, index) => index !== currentIndex && other.path === content.path
      );

      if (duplicates.length > 0) {
        result.isValid = false;
        result.errors.push(`Duplicate path found: ${content.path}`);
      }

      return result;
    },
  } as ValidationRule,
};

// Built-in output transformers
export const builtInOutputTransformers = {
  // Transformer to add metadata
  metadataEnricher: {
    name: "metadata-enricher",
    transform: (
      output: OutputDefinition,
      context: ProcessingContext
    ): OutputDefinition => {
      const { logger, config } = context;

      // Add processing metadata
      const metadata = {
        generatedAt: new Date().toISOString(),
        totalDefinitions: Object.keys(output.definitions).length,
        totalEvents: Object.keys(output.events || {}).length,
        version: "1.0.0",
        ...(config.metadata || {}),
      };

      logger.verbose_log(
        `Adding metadata to output: ${JSON.stringify(metadata)}`
      );

      return {
        ...output,
        metadata,
      };
    },
  } as OutputTransformer,
};

// Helper functions to register built-in components
export function registerBuiltInProcessors(): void {
  definitionPipeline.addProcessor(builtInProcessors.pathNormalizer);
  definitionPipeline.addProcessor(builtInProcessors.typeDetector);
}

export function registerBuiltInValidators(): void {
  definitionPipeline.addValidator(builtInValidators.pathValidator);
  definitionPipeline.addValidator(builtInValidators.duplicatePathValidator);
}

export function registerBuiltInOutputTransformers(): void {
  definitionPipeline.addOutputTransformer(
    builtInOutputTransformers.metadataEnricher
  );
}
