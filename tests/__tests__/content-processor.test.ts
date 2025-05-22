import {
  generateOutput,
  definitionPipeline,
} from "../../src/cli/utils/content-processor";
import { Logger } from "../../src/cli/logger";
import { Content } from "../../src/cli/types/migrate";

const mockLogger = new Logger(false);

describe("Content Processor", () => {
  beforeEach(() => {
    definitionPipeline.clear();
  });

  describe("generateOutput", () => {
    it("should generate output with basic content", () => {
      const contents: Content[] = [
        {
          path: "hero.json",
          structure: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
          },
        },
      ];

      const config = {
        description: "Test definitions",
        args: { project: "test" },
      };

      const output = generateOutput(contents, config, mockLogger);

      expect(output).toHaveProperty("description", "Test definitions");
      expect(output).toHaveProperty("args", { project: "test" });
      expect(output).toHaveProperty("events", {});
      expect(output.definitions["hero.json"]).toBeDefined();
      expect(output.definitions["hero.json"]).toHaveProperty("structure");
      expect(output.definitions["hero.json"]).toHaveProperty("type");
    });

    it("should separate events from regular definitions", () => {
      const contents: Content[] = [
        {
          path: "hero.json",
          structure: { title: "Hero" },
        },
        {
          path: "page_view_event",
          structure: {
            type: "event",
            properties: {
              id: { const: "page_view" },
              columns: { const: ["page", "user_id", "timestamp"] },
              type: { const: "event" },
            },
          },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      // Regular definition should be in definitions
      expect(output.definitions["hero.json"]).toBeDefined();

      // Event should be in events, not definitions
      expect(output.definitions["page_view_event"]).toBeUndefined();
      expect(output.events["page_view"]).toBeDefined();
      expect(output.events["page_view"]).toHaveProperty("columns", [
        "page",
        "user_id",
        "timestamp",
      ]);
    });

    it("should apply built-in processors automatically", () => {
      const contents: Content[] = [
        {
          path: "\\folder\\hero.json", // Should be normalized
          structure: { title: "Hero" },
        },
        {
          path: "image.png", // Should be detected as image type
          structure: {},
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      // Check path normalization
      expect(output.definitions["folder/hero.json"]).toBeDefined();
      expect(output.definitions["\\folder\\hero.json"]).toBeUndefined();

      // Check type detection
      expect(output.definitions["image.png"]).toHaveProperty("type", "image");
      expect(output.definitions["folder/hero.json"]).toHaveProperty(
        "type",
        "jsonx"
      );
    });

    it("should add metadata through output transformers", () => {
      const contents: Content[] = [
        {
          path: "test.json",
          structure: { title: "Test" },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      expect(output).toHaveProperty("metadata");
      expect(output.metadata).toHaveProperty("generatedAt");
      expect(output.metadata).toHaveProperty("totalDefinitions", 1);
      expect(output.metadata).toHaveProperty("totalEvents", 0);
      expect(output.metadata).toHaveProperty("version");
    });

    it("should include event counts in metadata", () => {
      const contents: Content[] = [
        {
          path: "test.json",
          structure: { title: "Test" },
        },
        {
          path: "event1",
          structure: {
            type: "event",
            properties: {
              id: { const: "click" },
              columns: { const: ["element", "timestamp"] },
              type: { const: "event" },
            },
          },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      expect(output.metadata).toHaveProperty("totalDefinitions", 1);
      expect(output.metadata).toHaveProperty("totalEvents", 1);
    });

    it("should filter out invalid content through validation", () => {
      const contents: Content[] = [
        {
          path: "valid.json",
          structure: { title: "Valid" },
        },
        {
          path: "", // Invalid empty path
          structure: { title: "Invalid" },
        },
        {
          path: "valid2.json",
          structure: { title: "Valid 2" },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      // Should only have the valid contents
      expect(Object.keys(output.definitions)).toHaveLength(2);
      expect(output.definitions["valid.json"]).toBeDefined();
      expect(output.definitions["valid2.json"]).toBeDefined();
      expect(output.definitions[""]).toBeUndefined();
    });

    it("should handle duplicate path validation", () => {
      const contents: Content[] = [
        {
          path: "duplicate.json",
          structure: { title: "First" },
        },
        {
          path: "duplicate.json",
          structure: { title: "Second" },
        },
        {
          path: "unique.json",
          structure: { title: "Unique" },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      // Should filter out duplicates, keeping only the unique one
      expect(Object.keys(output.definitions)).toHaveLength(1);
      expect(output.definitions["unique.json"]).toBeDefined();
      expect(output.definitions["duplicate.json"]).toBeUndefined();
    });

    it("should apply special type transformations", () => {
      const contents: Content[] = [
        {
          path: "image.jpg",
          structure: {
            properties: {
              __amatype: { const: "AmaImageDef" },
              __config: {
                properties: {
                  width: { const: 800 },
                  height: { const: 600 },
                },
              },
            },
          },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      const imageDefinition = output.definitions["image.jpg"];
      expect(imageDefinition.structure).toHaveProperty(
        "__amatype",
        "AmaImageDef"
      );
      expect(imageDefinition.structure).toHaveProperty("config");
      expect(imageDefinition.structure.config).toEqual({
        width: 800,
        height: 600,
      });
    });

    it("should use custom config metadata", () => {
      const contents: Content[] = [
        {
          path: "test.json",
          structure: { title: "Test" },
        },
      ];

      const config = {
        description: "Custom description",
        args: { custom: "arg" },
        metadata: {
          author: "Test Author",
          version: "2.0.0",
        },
      };

      const output = generateOutput(contents, config, mockLogger);

      expect(output.description).toBe("Custom description");
      expect(output.args).toEqual({ custom: "arg" });
      expect(output.metadata).toHaveProperty("author", "Test Author");
      expect(output.metadata).toHaveProperty("version", "2.0.0");
    });

    it("should handle empty content array", () => {
      const output = generateOutput([], {}, mockLogger);

      expect(output.definitions).toEqual({});
      expect(output.events).toEqual({});
      expect(output.description).toBe("AMA Definitions");
      expect(output.args).toEqual({});
      expect(output.metadata).toHaveProperty("totalDefinitions", 0);
      expect(output.metadata).toHaveProperty("totalEvents", 0);
    });
  });

  describe("pipeline customization", () => {
    it("should allow custom processors to be added", () => {
      const customProcessor = {
        name: "custom-processor",
        process: (content: Content) => ({
          ...content,
          structure: { ...content.structure, custom: true },
        }),
      };

      definitionPipeline.addProcessor(customProcessor);

      const contents: Content[] = [
        {
          path: "test.json",
          structure: { title: "Test" },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      expect(output.definitions["test.json"].structure).toHaveProperty(
        "custom",
        true
      );
    });

    it("should allow custom validators to be added", () => {
      const customValidator = {
        name: "custom-validator",
        validate: (content: Content) => ({
          isValid: content.path.endsWith(".json"),
          errors: content.path.endsWith(".json") ? [] : ["Must be a JSON file"],
          warnings: [],
        }),
      };

      definitionPipeline.addValidator(customValidator);

      const contents: Content[] = [
        {
          path: "valid.json",
          structure: { title: "Valid" },
        },
        {
          path: "invalid.txt",
          structure: { title: "Invalid" },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      expect(Object.keys(output.definitions)).toHaveLength(1);
      expect(output.definitions["valid.json"]).toBeDefined();
      expect(output.definitions["invalid.txt"]).toBeUndefined();
    });

    it("should allow custom output transformers to be added", () => {
      const customTransformer = {
        name: "custom-transformer",
        transform: (output: any) => ({
          ...output,
          customField: "custom value",
        }),
      };

      definitionPipeline.addOutputTransformer(customTransformer);

      const contents: Content[] = [
        {
          path: "test.json",
          structure: { title: "Test" },
        },
      ];

      const output = generateOutput(contents, {}, mockLogger);

      expect(output).toHaveProperty("customField", "custom value");
    });
  });
});
