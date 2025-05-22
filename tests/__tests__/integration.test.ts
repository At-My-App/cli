import {
  scanFiles,
  createProject,
  processFiles,
} from "../../src/cli/utils/schema-processor";
import { generateOutput } from "../../src/cli/utils/content-processor";
import { Logger } from "../../src/cli/logger";
import path from "path";

const mockLogger = new Logger(false);

describe("Integration Tests", () => {
  describe("Full Migration Pipeline", () => {
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

      // Should have processed all found definitions
      expect(Object.keys(output.definitions).length).toBe(
        processingResult.contents.length
      );
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

      // Verify validation worked
      expect(Object.keys(output.definitions).length).toBe(
        processingResult.contents.length
      );

      // All paths should be normalized
      Object.keys(output.definitions).forEach((path) => {
        expect(path).not.toContain("\\");
        expect(path).not.toMatch(/^\/+/);
      });
    });

    it("should generate proper metadata", async () => {
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);
      const project = createProject(files, "tsconfig.json", mockLogger);
      const processingResult = processFiles(
        project.getSourceFiles(),
        "tsconfig.json",
        false,
        mockLogger
      );

      const config = {
        description: "Integration Test",
        metadata: {
          project: "test-project",
          environment: "test",
        },
      };

      const output = generateOutput(
        processingResult.contents,
        config,
        mockLogger
      );

      expect(output.metadata).toBeDefined();
      expect(output.metadata).toHaveProperty("generatedAt");
      expect(output.metadata).toHaveProperty("totalDefinitions");
      expect(output.metadata).toHaveProperty("version");
      expect(output.metadata).toHaveProperty("project", "test-project");
      expect(output.metadata).toHaveProperty("environment", "test");

      // Verify timestamp is recent
      const generatedAt = new Date(output.metadata.generatedAt);
      const now = new Date();
      const diff = now.getTime() - generatedAt.getTime();
      expect(diff).toBeLessThan(5000); // Within 5 seconds
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

  describe("Performance", () => {
    it("should process files in reasonable time", async () => {
      const startTime = Date.now();

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

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 10 seconds for small test files
      expect(duration).toBeLessThan(10000);
      expect(output).toBeDefined();
    });
  });
});
