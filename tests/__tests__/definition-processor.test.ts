import {
  definitionPipeline,
  builtInProcessors,
  builtInValidators,
  builtInOutputTransformers,
  registerBuiltInProcessors,
  registerBuiltInValidators,
  registerBuiltInOutputTransformers,
} from "../../src/cli/utils/definition-processor";
import { Logger } from "../../src/cli/logger";
import { Content, OutputDefinition } from "../../src/cli/types/migrate";

const mockLogger = new Logger(false);

describe("Definition Processor", () => {
  beforeEach(() => {
    definitionPipeline.clear();
  });

  describe("DefinitionProcessingPipeline", () => {
    it("should register and use processors", () => {
      const mockProcessor = {
        name: "test-processor",
        process: jest.fn((content) => ({ ...content, processed: true })),
      };

      definitionPipeline.addProcessor(mockProcessor);

      const content: Content = {
        path: "test.json",
        structure: { title: "Test" },
      };

      const result = definitionPipeline.processDefinitions(
        [content],
        {},
        mockLogger,
      );

      expect(mockProcessor.process).toHaveBeenCalledWith(
        content,
        expect.objectContaining({
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        }),
      );

      expect(result.processedContents).toHaveLength(1);
      expect(result.processedContents[0]).toHaveProperty("processed", true);
    });

    it("should register and use validators", () => {
      const mockValidator = {
        name: "test-validator",
        validate: jest.fn(() => ({
          isValid: false,
          errors: ["Test error"],
          warnings: [],
        })),
      };

      definitionPipeline.addValidator(mockValidator);

      const content: Content = {
        path: "test.json",
        structure: { title: "Test" },
      };

      const result = definitionPipeline.processDefinitions(
        [content],
        {},
        mockLogger,
      );

      expect(mockValidator.validate).toHaveBeenCalled();
      expect(result.processedContents).toHaveLength(0); // Invalid content should be filtered out
      expect(result.validationResults).toHaveLength(1);
      expect(result.validationResults[0].isValid).toBe(false);
    });

    it("should register and use output transformers", () => {
      const mockTransformer = {
        name: "test-transformer",
        transform: jest.fn((output) => ({ ...output, transformed: true })),
      };

      definitionPipeline.addOutputTransformer(mockTransformer);

      const baseOutput: OutputDefinition = {
        description: "Test",
        definitions: {},
        events: {},
        args: {},
      };

      const result = definitionPipeline.transformOutput(
        baseOutput,
        {},
        mockLogger,
      );

      expect(mockTransformer.transform).toHaveBeenCalled();
      expect(result).toHaveProperty("transformed", true);
    });

    it("should handle processor errors gracefully", () => {
      const failingProcessor = {
        name: "failing-processor",
        process: jest.fn(() => {
          throw new Error("Test error");
        }),
      };

      definitionPipeline.addProcessor(failingProcessor);

      const content: Content = {
        path: "test.json",
        structure: { title: "Test" },
      };

      const result = definitionPipeline.processDefinitions(
        [content],
        {},
        mockLogger,
      );

      expect(result.processedContents).toHaveLength(0);
    });
  });

  describe("Built-in processors", () => {
    describe("typeDetector", () => {
      it("should detect image type for AmaImageDef", () => {
        const content: Content = {
          path: "image.jpg",
          structure: { __amatype: "AmaImageDef" },
        };

        const result = builtInProcessors.typeDetector.process(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result?.type).toBe("image");
      });

      it("should detect file type for AmaFileDef", () => {
        const content: Content = {
          path: "document.pdf",
          structure: { __amatype: "AmaFileDef" },
        };

        const result = builtInProcessors.typeDetector.process(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result?.type).toBe("file");
      });

      it("should detect image type by extension", () => {
        const content: Content = {
          path: "image.png",
          structure: {},
        };

        const result = builtInProcessors.typeDetector.process(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result?.type).toBe("image");
      });

      it("should detect event type for AmaCustomEventDef", () => {
        const content: Content = {
          path: "click_event",
          structure: {
            type: "event",
            properties: {
              id: { const: "click" },
              columns: { const: ["element", "timestamp"] },
              type: { const: "event" },
            },
          },
        };

        const result = builtInProcessors.typeDetector.process(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result?.type).toBe("event");
      });

      it("should default to jsonx for unknown types", () => {
        const content: Content = {
          path: "data.json",
          structure: {},
        };

        const result = builtInProcessors.typeDetector.process(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result?.type).toBe("jsonx");
      });
    });

    describe("pathNormalizer", () => {
      it("should normalize path separators", () => {
        const content: Content = {
          path: "folder\\subfolder\\file.json",
          structure: {},
        };

        const result = builtInProcessors.pathNormalizer.process(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result?.path).toBe("folder/subfolder/file.json");
      });

      it("should remove leading slashes", () => {
        const content: Content = {
          path: "///folder/file.json",
          structure: {},
        };

        const result = builtInProcessors.pathNormalizer.process(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result?.path).toBe("folder/file.json");
      });
    });
  });

  describe("Built-in validators", () => {
    describe("pathValidator", () => {
      it("should validate valid paths", () => {
        const content: Content = {
          path: "valid/path.json",
          structure: {},
        };

        const result = builtInValidators.pathValidator.validate(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should reject empty paths", () => {
        const content: Content = {
          path: "",
          structure: {},
        };

        const result = builtInValidators.pathValidator.validate(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Content path cannot be empty");
      });

      it("should reject null/undefined paths", () => {
        const content: Content = {
          path: null as any,
          structure: {},
        };

        const result = builtInValidators.pathValidator.validate(content, {
          logger: mockLogger,
          config: {},
          allContents: [content],
          currentIndex: 0,
        });

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Content must have a valid path");
      });
    });

    describe("duplicatePathValidator", () => {
      it("should detect duplicate paths", () => {
        const content1: Content = { path: "test.json", structure: {} };
        const content2: Content = { path: "test.json", structure: {} };
        const allContents = [content1, content2];

        const result = builtInValidators.duplicatePathValidator.validate(
          content2,
          {
            logger: mockLogger,
            config: {},
            allContents,
            currentIndex: 1,
          },
        );

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Duplicate path found: test.json");
      });

      it("should allow unique paths", () => {
        const content1: Content = { path: "test1.json", structure: {} };
        const content2: Content = { path: "test2.json", structure: {} };
        const allContents = [content1, content2];

        const result = builtInValidators.duplicatePathValidator.validate(
          content2,
          {
            logger: mockLogger,
            config: {},
            allContents,
            currentIndex: 1,
          },
        );

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe("Built-in output transformers", () => {
    describe("metadataEnricher", () => {
      it("should add metadata to output", () => {
        const baseOutput: OutputDefinition = {
          description: "Test",
          definitions: {
            "test1.json": { structure: {}, type: "jsonx" },
            "test2.json": { structure: {}, type: "jsonx" },
          },
          events: {},
          args: {},
        };

        const result = builtInOutputTransformers.metadataEnricher.transform(
          baseOutput,
          {
            logger: mockLogger,
            config: {},
            allContents: [],
            currentIndex: 0,
          },
        );

        expect(result).toHaveProperty("metadata");
        expect(result.metadata).toHaveProperty("generatedAt");
        expect(result.metadata).toHaveProperty("totalDefinitions", 2);
        expect(result.metadata).toHaveProperty("version", "1.0.0");
      });

      it("should merge custom metadata from config", () => {
        const baseOutput: OutputDefinition = {
          description: "Test",
          definitions: {},
          events: {},
          args: {},
        };

        const config = {
          metadata: {
            customField: "customValue",
            version: "2.0.0", // Should override default
          },
        };

        const result = builtInOutputTransformers.metadataEnricher.transform(
          baseOutput,
          {
            logger: mockLogger,
            config,
            allContents: [],
            currentIndex: 0,
          },
        );

        expect(result.metadata).toHaveProperty("customField", "customValue");
        expect(result.metadata).toHaveProperty("version", "2.0.0");
      });
    });
  });

  describe("Registration functions", () => {
    it("should register built-in processors", () => {
      registerBuiltInProcessors();
      const stats = definitionPipeline.getStats();
      expect(stats.processors).toBeGreaterThan(0);
    });

    it("should register built-in validators", () => {
      registerBuiltInValidators();
      const stats = definitionPipeline.getStats();
      expect(stats.validators).toBeGreaterThan(0);
    });

    it("should register built-in output transformers", () => {
      registerBuiltInOutputTransformers();
      const stats = definitionPipeline.getStats();
      expect(stats.transformers).toBeGreaterThan(0);
    });
  });
});
