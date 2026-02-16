import {
  scanFiles,
  createProject,
  processFiles,
} from "../../src/cli/utils/schema-processor";
import { optimizedMigrationPipeline } from "../../src/cli/utils/parallel-schema-processor";
import { generateOutput } from "../../src/cli/utils/content-processor";
import { Logger } from "../../src/cli/logger";
import path from "path";

const mockLogger = new Logger(false);

describe("Integration Tests", () => {
  describe("Full Migration Pipeline - Sequential", () => {
    it("should process the test definition file end-to-end", async () => {
      // Step 1: Scan for files
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);

      expect(files.length).toBeGreaterThan(0);

      // Should find our test file
      const testFile = files.find((f) => f.includes("someFile.ts"));
      expect(testFile).toBeDefined();

      // Step 2: Create TypeScript project
      const project = createProject(files, "tsconfig.json", mockLogger);
      expect(project.getSourceFiles().length).toBeGreaterThan(0);

      // Step 3: Process files to extract definitions
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      expect(processingResult.contents.length).toBeGreaterThan(0);
      expect(processingResult.successCount).toBeGreaterThan(0);
      expect(processingResult.failureCount).toBe(0);

      // Should have extracted some definitions
      expect(processingResult.contents.length).toBeGreaterThan(0);
      processingResult.contents.forEach((content) => {
        expect(content.path).toBeDefined();
        expect(content.structure).toBeDefined();
      });

      // Step 4: Generate final output
      const config = {
        description: "Test Integration",
        args: { test: true },
      };

      const output = generateOutput(
        processingResult.contents,
        config,
        mockLogger
      );

      expect(output.description).toBe("Test Integration");
      expect(output.args).toEqual({ test: true });
      expect(Object.keys(output.definitions).length).toBeGreaterThan(0);

      // Check that all definitions have the expected structure
      Object.values(output.definitions).forEach((def) => {
        expect(def).toHaveProperty("type");
        expect(def).toHaveProperty("structure");
      });

      expect(output).toHaveProperty("metadata");
      expect(output.metadata).toHaveProperty(
        "totalDefinitions",
        Object.keys(output.definitions).length
      );
    });

    it("should handle multiple definition files", async () => {
      // Create a temporary test file with multiple definitions
      const testContent = `
        import { AmaContentDef } from "@atmyapp/core";

        type HeroData = { title: string; description: string; };
        type AboutData = { content: string; author: string; };
        type ContactData = { email: string; phone: string; };

        export type HeroContent = AmaContentDef<"hero.json", HeroData>;
        export type AboutContent = AmaContentDef<"about.json", AboutData>;
        export type ContactContent = AmaContentDef<
          "contact.json",
          ContactData
        >;

        export type ATMYAPP = [HeroContent, AboutContent, ContactContent];
      `;

      // For now, we'll test with the existing file but verify the pattern works
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      expect(processingResult.contents.length).toBeGreaterThan(0);

      // Generate output
      const output = generateOutput(processingResult.contents, {}, mockLogger);

      // Should have processed all found contents (some as definitions, some as events)
      const totalProcessed =
        Object.keys(output.definitions).length +
        Object.keys(output.events).length +
        (output.mdx ? Object.keys(output.mdx).length : 0);
      expect(totalProcessed).toBe(processingResult.contents.length);
    });

    it("should apply validation and filtering", async () => {
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      // All contents should be valid in our test files
      const output = generateOutput(processingResult.contents, {}, mockLogger);

      // Verify validation worked - total processed should equal input
      const totalProcessed =
        Object.keys(output.definitions).length +
        Object.keys(output.events).length +
        (output.mdx ? Object.keys(output.mdx).length : 0);
      expect(totalProcessed).toBe(processingResult.contents.length);

      // All definition paths should be normalized
      Object.keys(output.definitions).forEach((path) => {
        expect(path).not.toContain("\\");
        expect(path).not.toMatch(/^\/+/);
      });

      // All event IDs should be strings
      Object.keys(output.events).forEach((eventId) => {
        expect(typeof eventId).toBe("string");
        expect(eventId.length).toBeGreaterThan(0);
      });
    });

    it("should handle TypeScript compilation errors gracefully", async () => {
      // Test with continue on error
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);

      // Process with continue on error enabled
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        true, // continueOnError = true
        mockLogger
      );

      // Should not throw and should have results
      expect(processingResult).toBeDefined();
      expect(processingResult.contents).toBeInstanceOf(Array);

      // Generate output should work even with some errors
      const output = generateOutput(processingResult.contents, {}, mockLogger);
      expect(output).toBeDefined();
      expect(output.definitions).toBeDefined();
    });
  });

  describe("Full Migration Pipeline - Parallel", () => {
    it("should process the test definition files end-to-end with parallel processing", async () => {
      const patterns = ["tests/definitions/**/*.ts"];

      // Step 1-4: Use optimized migration pipeline
      const processingResult = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        false,
        mockLogger,
        2 // Use 2 workers for testing
      );

      expect(processingResult.contents.length).toBeGreaterThan(0);
      expect(processingResult.successCount).toBeGreaterThan(0);
      expect(processingResult.failureCount).toBe(0);

      // Should have extracted definitions and events
      processingResult.contents.forEach((content) => {
        expect(content.path).toBeDefined();
        expect(content.structure).toBeDefined();
      });

      // Generate final output
      const config = {
        description: "Parallel Test Integration",
        args: { parallel: true },
      };

      const output = generateOutput(
        processingResult.contents,
        config,
        mockLogger
      );

      expect(output.description).toBe("Parallel Test Integration");
      expect(output.args).toEqual({ parallel: true });

      const totalProcessed =
        Object.keys(output.definitions).length +
        Object.keys(output.events).length;
      expect(totalProcessed).toBeGreaterThan(0);

      expect(output).toHaveProperty("metadata");
      expect(output.metadata).toHaveProperty("totalDefinitions");
      expect(output.metadata).toHaveProperty("totalEvents");
    });

    it("should produce equivalent results to sequential processing", async () => {
      const patterns = ["tests/definitions/someFile.ts"];

      // Sequential processing
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const sequentialResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      // Parallel processing
      const parallelResult = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        false,
        mockLogger,
        1 // Single worker for consistency
      );

      // Results should be equivalent
      expect(parallelResult.contents.length).toBe(
        sequentialResult.contents.length
      );
      expect(parallelResult.successCount).toBe(sequentialResult.successCount);

      // Generate outputs from both
      const sequentialOutput = generateOutput(
        sequentialResult.contents,
        {},
        mockLogger
      );
      const parallelOutput = generateOutput(
        parallelResult.contents,
        {},
        mockLogger
      );

      // Outputs should be equivalent
      expect(Object.keys(sequentialOutput.definitions).length).toBe(
        Object.keys(parallelOutput.definitions).length
      );
      expect(Object.keys(sequentialOutput.events).length).toBe(
        Object.keys(parallelOutput.events).length
      );

      // Should find the same content paths
      const sequentialPaths = Object.keys(sequentialOutput.definitions).sort();
      const parallelPaths = Object.keys(parallelOutput.definitions).sort();
      expect(parallelPaths).toEqual(sequentialPaths);
    });

    it("should handle errors gracefully in parallel mode", async () => {
      const patterns = ["tests/definitions/**/*.ts"];

      // This should not throw even if there are processing issues
      const processingResult = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        true, // continueOnError = true
        mockLogger,
        2
      );

      expect(processingResult).toBeDefined();
      expect(processingResult.contents).toBeInstanceOf(Array);
      expect(processingResult.errors).toBeInstanceOf(Array);

      const output = generateOutput(processingResult.contents, {}, mockLogger);
      expect(output).toBeDefined();
      expect(output.definitions).toBeDefined();
      expect(output.events).toBeDefined();
    });
  });

  describe("Performance Comparison", () => {
    it("should complete both sequential and parallel processing within reasonable time", async () => {
      const patterns = ["tests/definitions/**/*.ts"];

      // Test sequential processing time
      const sequentialStart = Date.now();
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const sequentialResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );
      const sequentialTime = Date.now() - sequentialStart;

      // Test parallel processing time
      const parallelStart = Date.now();
      const parallelResult = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        false,
        mockLogger,
        2
      );
      const parallelTime = Date.now() - parallelStart;

      // Both should complete within reasonable time for test files
      expect(sequentialTime).toBeLessThan(15000); // 15 seconds for test environment
      expect(parallelTime).toBeLessThan(15000); // 15 seconds for test environment

      // Both should produce valid results
      expect(sequentialResult.contents.length).toBeGreaterThan(0);
      expect(parallelResult.contents.length).toBeGreaterThan(0);
      expect(sequentialResult.successCount).toBe(parallelResult.successCount);
    });
  });

  describe("Migration Modes", () => {
    it("should generate proper metadata for both processing modes", async () => {
      const patterns = ["tests/definitions/**/*.ts"];

      // Test sequential mode metadata
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const sequentialResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const sequentialConfig = {
        description: "Sequential Integration Test",
        metadata: {
          mode: "sequential",
          environment: "test",
        },
      };

      const sequentialOutput = generateOutput(
        sequentialResult.contents,
        sequentialConfig,
        mockLogger
      );

      expect(sequentialOutput.metadata).toBeDefined();
      expect(sequentialOutput.metadata).toHaveProperty("mode", "sequential");
      expect(sequentialOutput.metadata).toHaveProperty("generatedAt");
      expect(sequentialOutput.metadata).toHaveProperty("totalDefinitions");
      expect(sequentialOutput.metadata).toHaveProperty("version");

      // Test parallel mode metadata
      const parallelResult = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        false,
        mockLogger,
        2
      );

      const parallelConfig = {
        description: "Parallel Integration Test",
        metadata: {
          mode: "parallel",
          environment: "test",
        },
      };

      const parallelOutput = generateOutput(
        parallelResult.contents,
        parallelConfig,
        mockLogger
      );

      expect(parallelOutput.metadata).toBeDefined();
      expect(parallelOutput.metadata).toHaveProperty("mode", "parallel");
      expect(parallelOutput.metadata).toHaveProperty("generatedAt");
      expect(parallelOutput.metadata).toHaveProperty("totalDefinitions");
      expect(parallelOutput.metadata).toHaveProperty("version");

      // Verify timestamps are recent
      const sequentialTime = new Date(sequentialOutput.metadata.generatedAt);
      const parallelTime = new Date(parallelOutput.metadata.generatedAt);
      const now = new Date();

      expect(now.getTime() - sequentialTime.getTime()).toBeLessThan(15000); // 15 seconds for test environment
      expect(now.getTime() - parallelTime.getTime()).toBeLessThan(15000); // 15 seconds for test environment
    });
  });
});
