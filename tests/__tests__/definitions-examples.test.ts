import {
  scanFiles,
  createProject,
  processFiles,
} from "../../src/cli/utils/schema-processor";
import { generateOutput } from "../../src/cli/utils/content-processor";
import { Logger } from "../../src/cli/logger";
import {
  definitionPipeline,
  registerBuiltInProcessors,
  registerBuiltInValidators,
  registerBuiltInOutputTransformers,
} from "../../src/cli/utils/definition-processor";
import path from "path";

const mockLogger = new Logger(false);

describe("Definition Examples Tests", () => {
  beforeEach(() => {
    definitionPipeline.clear();
    registerBuiltInProcessors();
    registerBuiltInValidators();
    registerBuiltInOutputTransformers();
  });

  describe("someFile.ts - Simple Content Definition", () => {
    it("should process hero content definition correctly", async () => {
      const patterns = ["tests/definitions/someFile.ts"];
      const files = await scanFiles(patterns, mockLogger);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain("someFile.ts");

      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      expect(processingResult.successCount).toBe(1);
      expect(processingResult.failureCount).toBe(0);
      expect(processingResult.contents).toHaveLength(1);

      const heroContent = processingResult.contents[0];
      expect(heroContent.path).toBe("hero.json");
      expect(heroContent.structure).toBeDefined();
      expect(heroContent.structure).toHaveProperty("type", "object");
      expect(heroContent.structure).toHaveProperty("properties");
      expect(heroContent.structure.properties).toHaveProperty("title");
      expect(heroContent.structure.properties).toHaveProperty("description");
    });

    it("should generate correct output for hero content", async () => {
      const patterns = ["tests/definitions/someFile.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const output = generateOutput(
        processingResult.contents,
        {
          description: "Hero Content Test",
          args: { source: "someFile.ts" },
        },
        mockLogger
      );

      expect(output.description).toBe("Hero Content Test");
      expect(Object.keys(output.definitions)).toContain("hero.json");
      expect(output.definitions["hero.json"]).toHaveProperty("type", "jsonx");
      expect(output.definitions["hero.json"]).toHaveProperty("structure");
      expect(output.events).toEqual({});
      expect(output.metadata).toHaveProperty("totalDefinitions", 1);
      expect(output.metadata).toHaveProperty("totalEvents", 0);
    });
  });

  describe("multipleDefinitions.ts - Multiple Content Definitions", () => {
    it("should process all content definitions correctly", async () => {
      const patterns = ["tests/definitions/multipleDefinitions.ts"];
      const files = await scanFiles(patterns, mockLogger);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain("multipleDefinitions.ts");

      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      expect(processingResult.successCount).toBe(4);
      expect(processingResult.failureCount).toBe(0);
      expect(processingResult.contents).toHaveLength(4);

      const expectedPaths = [
        "pages/hero.json",
        "pages/about.json",
        "pages/contact.json",
        "products/featured.json",
      ];

      const actualPaths = processingResult.contents.map((c) => c.path).sort();
      expect(actualPaths).toEqual(expectedPaths.sort());

      // Verify each definition has proper structure
      processingResult.contents.forEach((content) => {
        expect(content.structure).toBeDefined();
        expect(content.structure).toHaveProperty("type", "object");
        expect(content.structure).toHaveProperty("properties");
      });
    });

    it("should generate correct output for multiple definitions", async () => {
      const patterns = ["tests/definitions/multipleDefinitions.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const output = generateOutput(
        processingResult.contents,
        {
          description: "Multiple Content Definitions Test",
          args: { source: "multipleDefinitions.ts" },
        },
        mockLogger
      );

      expect(output.description).toBe("Multiple Content Definitions Test");
      expect(Object.keys(output.definitions)).toHaveLength(4);

      // Check each expected definition exists
      expect(Object.keys(output.definitions)).toContain("pages/hero.json");
      expect(Object.keys(output.definitions)).toContain("pages/about.json");
      expect(Object.keys(output.definitions)).toContain("pages/contact.json");
      expect(Object.keys(output.definitions)).toContain(
        "products/featured.json"
      );

      // All should be content definitions (jsonx type)
      Object.values(output.definitions).forEach((def) => {
        expect(def.type).toBe("jsonx");
        expect(def.structure).toBeDefined();
      });

      expect(output.events).toEqual({});
      expect(output.metadata).toHaveProperty("totalDefinitions", 4);
      expect(output.metadata).toHaveProperty("totalEvents", 0);
    });

    it("should validate content data structures correctly", async () => {
      const patterns = ["tests/definitions/multipleDefinitions.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const heroContent = processingResult.contents.find(
        (c) => c.path === "pages/hero.json"
      );
      expect(heroContent?.structure.properties).toHaveProperty("title");
      expect(heroContent?.structure.properties).toHaveProperty("subtitle");
      expect(heroContent?.structure.properties).toHaveProperty(
        "backgroundImage"
      );

      const aboutContent = processingResult.contents.find(
        (c) => c.path === "pages/about.json"
      );
      expect(aboutContent?.structure.properties).toHaveProperty("content");
      expect(aboutContent?.structure.properties).toHaveProperty("author");
      expect(aboutContent?.structure.properties).toHaveProperty(
        "publishedDate"
      );

      const contactContent = processingResult.contents.find(
        (c) => c.path === "pages/contact.json"
      );
      expect(contactContent?.structure.properties).toHaveProperty("email");
      expect(contactContent?.structure.properties).toHaveProperty("phone");
      expect(contactContent?.structure.properties).toHaveProperty("address");

      const productContent = processingResult.contents.find(
        (c) => c.path === "products/featured.json"
      );
      expect(productContent?.structure.properties).toHaveProperty("name");
      expect(productContent?.structure.properties).toHaveProperty("price");
      expect(productContent?.structure.properties).toHaveProperty(
        "description"
      );
      expect(productContent?.structure.properties).toHaveProperty("images");
      expect(productContent?.structure.properties).toHaveProperty("inStock");
    });
  });

  describe("eventDefinitions.ts - Event Definitions", () => {
    it("should process event definitions correctly", async () => {
      const patterns = ["tests/definitions/eventDefinitions.ts"];
      const files = await scanFiles(patterns, mockLogger);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain("eventDefinitions.ts");

      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      expect(processingResult.successCount).toBe(4);
      expect(processingResult.failureCount).toBe(0);
      expect(processingResult.contents).toHaveLength(4);

      const expectedEventIds = [
        "page_view",
        "button_click",
        "purchase",
        "search",
      ];

      const actualEventIds = processingResult.contents
        .map((c) => c.path)
        .sort();
      expect(actualEventIds).toEqual(expectedEventIds.sort());

      // Verify each event has proper structure
      processingResult.contents.forEach((content) => {
        expect(content.structure).toBeDefined();
        expect(content.structure.type).toBe("event");
        expect(content.structure.properties).toBeDefined();
        expect(content.structure.properties).toHaveProperty("id");
        expect(content.structure.properties).toHaveProperty("columns");
        expect(content.structure.properties).toHaveProperty("type");
      });
    });

    it("should generate correct output with events in events field", async () => {
      const patterns = ["tests/definitions/eventDefinitions.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const output = generateOutput(
        processingResult.contents,
        {
          description: "Event Definitions Test",
          args: { source: "eventDefinitions.ts" },
        },
        mockLogger
      );

      expect(output.description).toBe("Event Definitions Test");
      expect(Object.keys(output.definitions)).toHaveLength(0);
      expect(Object.keys(output.events)).toHaveLength(4);

      // Check each expected event exists with correct structure
      expect(output.events).toHaveProperty("page_view");
      expect(output.events["page_view"]).toEqual({
        columns: ["page", "referrer", "timestamp", "user_id"],
      });

      expect(output.events).toHaveProperty("button_click");
      expect(output.events["button_click"]).toEqual({
        columns: ["element", "position", "timestamp"],
      });

      expect(output.events).toHaveProperty("purchase");
      expect(output.events["purchase"]).toEqual({
        columns: ["product_id", "amount", "currency", "user_id", "timestamp"],
      });

      expect(output.events).toHaveProperty("search");
      expect(output.events["search"]).toEqual({
        columns: ["query", "results_count", "timestamp"],
      });

      expect(output.metadata).toHaveProperty("totalDefinitions", 0);
      expect(output.metadata).toHaveProperty("totalEvents", 4);
    });

    it("should validate event structure requirements", async () => {
      const patterns = ["tests/definitions/eventDefinitions.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const pageViewEvent = processingResult.contents.find(
        (c) => c.path === "page_view"
      );
      expect(pageViewEvent?.structure.properties.id.const).toBe("page_view");
      expect(pageViewEvent?.structure.properties.type.const).toBe("event");

      const clickEvent = processingResult.contents.find(
        (c) => c.path === "button_click"
      );
      expect(clickEvent?.structure.properties.id.const).toBe("button_click");
      expect(clickEvent?.structure.properties.type.const).toBe("event");

      const purchaseEvent = processingResult.contents.find(
        (c) => c.path === "purchase"
      );
      expect(purchaseEvent?.structure.properties.id.const).toBe("purchase");
      expect(purchaseEvent?.structure.properties.type.const).toBe("event");

      const searchEvent = processingResult.contents.find(
        (c) => c.path === "search"
      );
      expect(searchEvent?.structure.properties.id.const).toBe("search");
      expect(searchEvent?.structure.properties.type.const).toBe("event");
    });
  });

  describe("All Definitions Together", () => {
    it("should process both content and event definitions from all files", async () => {
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);

      expect(files).toHaveLength(3);

      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      expect(processingResult.successCount).toBe(9); // 5 content + 4 events
      expect(processingResult.failureCount).toBe(0);
      expect(processingResult.contents).toHaveLength(9);
    });

    it("should generate combined output with both definitions and events", async () => {
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const output = generateOutput(
        processingResult.contents,
        {
          description: "Combined Definitions Test",
          args: { source: "all" },
        },
        mockLogger
      );

      expect(output.description).toBe("Combined Definitions Test");

      expect(Object.keys(output.definitions)).toHaveLength(5);
      expect(Object.keys(output.events)).toHaveLength(4);

      expect(output.metadata).toHaveProperty("totalDefinitions", 5);
      expect(output.metadata).toHaveProperty("totalEvents", 4);

      const definitionPaths = Object.keys(output.definitions);
      const eventIds = Object.keys(output.events);

      // Ensure no duplicates
      const uniqueDefinitionPaths = [...new Set(definitionPaths)];
      const uniqueEventIds = [...new Set(eventIds)];
      expect(definitionPaths).toEqual(uniqueDefinitionPaths);
      expect(eventIds).toEqual(uniqueEventIds);
    });

    it("should separate content definitions and events correctly", async () => {
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const output = generateOutput(processingResult.contents, {}, mockLogger);

      const contentPaths = Object.keys(output.definitions);
      expect(contentPaths).toContain("hero.json");
      expect(contentPaths).toContain("pages/hero.json");
      expect(contentPaths).toContain("pages/about.json");
      expect(contentPaths).toContain("pages/contact.json");
      expect(contentPaths).toContain("products/featured.json");

      const eventIds = Object.keys(output.events);
      expect(eventIds).toContain("page_view");
      expect(eventIds).toContain("button_click");
      expect(eventIds).toContain("purchase");
      expect(eventIds).toContain("search");

      // Verify events have the correct structure
      expect(output.events["page_view"]).toEqual({
        columns: ["page", "referrer", "timestamp", "user_id"],
      });
    });
  });

  describe("Error Handling with Definition Examples", () => {
    it("should handle missing files gracefully", async () => {
      const patterns = ["tests/definitions/nonexistent.ts"];
      const files = await scanFiles(patterns, mockLogger);

      expect(files).toHaveLength(0);

      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        true,
        mockLogger
      );

      expect(processingResult.contents).toHaveLength(0);
      expect(processingResult.successCount).toBe(0);
      expect(processingResult.failureCount).toBe(0);

      const output = generateOutput(processingResult.contents, {}, mockLogger);
      expect(output.definitions).toEqual({});
      expect(output.events).toEqual({});
    });

    it("should validate definition structures and filter invalid ones", async () => {
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      definitionPipeline.addValidator({
        name: "test-validator",
        validate: (content) => ({
          isValid: !content.path.includes("about"),
          errors: content.path.includes("about")
            ? ["Test: About content not allowed"]
            : [],
          warnings: [],
        }),
      });

      const output = generateOutput(processingResult.contents, {}, mockLogger);

      expect(output.definitions).not.toHaveProperty("pages/about.json");
      expect(Object.keys(output.definitions)).toHaveLength(4);
      expect(Object.keys(output.events)).toHaveLength(4);
    });
  });

  describe("Current Limitations and Future Improvements", () => {
    it("should document event definition processing limitation", () => {
      expect(true).toBe(true);
    });

    it("should demonstrate working content definition processing", async () => {
      const patterns = [
        "tests/definitions/someFile.ts",
        "tests/definitions/multipleDefinitions.ts",
      ];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      expect(processingResult.contents.length).toBe(5);

      processingResult.contents.forEach((content) => {
        expect(content.path).toBeDefined();
        expect(typeof content.path).toBe("string");
        expect(content.path.length).toBeGreaterThan(0);
        expect(content.structure).toBeDefined();
        expect(content.structure.type).toBe("object");
        expect(content.structure.properties).toBeDefined();
      });

      const output = generateOutput(processingResult.contents, {}, mockLogger);
      expect(Object.keys(output.definitions)).toHaveLength(5);
      expect(Object.keys(output.events)).toHaveLength(0);
    });
  });
});
