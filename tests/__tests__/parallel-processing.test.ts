import {
  scanFilesOptimized,
  processFilesParallel,
  optimizedMigrationPipeline,
} from "../../src/cli/utils/parallel-schema-processor";
import { Logger } from "../../src/cli/logger";
import { WorkerPool } from "../../src/cli/utils/worker-pool";
import path from "path";

const mockLogger = new Logger(false);

describe("Parallel Processing", () => {
  describe("scanFilesOptimized", () => {
    it("should scan files with optimized settings", async () => {
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFilesOptimized(patterns, mockLogger);

      expect(files).toBeInstanceOf(Array);
      expect(files.length).toBeGreaterThan(0);

      // Should find our test definition files
      const someFile = files.find((f) => f.includes("someFile.ts"));
      const multipleFile = files.find((f) =>
        f.includes("multipleDefinitions.ts")
      );
      const eventFile = files.find((f) => f.includes("eventDefinitions.ts"));

      expect(someFile).toBeDefined();
      expect(multipleFile).toBeDefined();
      expect(eventFile).toBeDefined();
    });

    it("should ignore node_modules and other excluded directories", async () => {
      const patterns = ["**/*.ts"];
      const files = await scanFilesOptimized(patterns, mockLogger);

      const hasNodeModules = files.some((f) => f.includes("node_modules"));
      const hasDist = files.some((f) => f.includes("dist"));
      const hasAmaDir = files.some((f) => f.includes(".ama"));

      expect(hasNodeModules).toBe(false);
      expect(hasDist).toBe(false);
      expect(hasAmaDir).toBe(false);
    });
  });

  describe("processFilesParallel", () => {
    it("should process files in parallel and return valid results", async () => {
      const patterns = ["tests/definitions/**/*.ts"];
      const files = await scanFilesOptimized(patterns, mockLogger);

      const result = await processFilesParallel(
        files,
        "tsconfig.json",
        false,
        mockLogger,
        2 // Use 2 workers for testing
      );

      expect(result).toBeDefined();
      expect(result.contents).toBeInstanceOf(Array);
      expect(result.contents.length).toBeGreaterThan(0);
      expect(result.successCount).toBeGreaterThan(0);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toBeInstanceOf(Array);

      // Verify content structure
      result.contents.forEach((content) => {
        expect(content).toHaveProperty("path");
        expect(content).toHaveProperty("structure");
        expect(typeof content.path).toBe("string");
        expect(content.path.length).toBeGreaterThan(0);
        expect(content.structure).toBeDefined();
      });
    });

    it("should handle empty file list gracefully", async () => {
      const result = await processFilesParallel(
        [],
        "tsconfig.json",
        false,
        mockLogger,
        2
      );

      expect(result.contents).toEqual([]);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it("should continue on error when specified", async () => {
      // Test with files that might have issues
      const files = ["nonexistent-file.ts"];

      const result = await processFilesParallel(
        files,
        "tsconfig.json",
        true, // continueOnError
        mockLogger,
        1
      );

      // Should not throw and should handle gracefully
      expect(result).toBeDefined();
      expect(result.contents).toBeInstanceOf(Array);
    });
  });

  describe("optimizedMigrationPipeline", () => {
    it("should run the complete optimized pipeline", async () => {
      const patterns = ["tests/definitions/someFile.ts"];

      const result = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        false,
        mockLogger,
        1 // Single worker for deterministic testing
      );

      expect(result).toBeDefined();
      expect(result.contents).toBeInstanceOf(Array);
      expect(result.contents.length).toBeGreaterThan(0);
      expect(result.successCount).toBeGreaterThan(0);

      // Should find the hero content from someFile.ts
      const heroContent = result.contents.find((c) => c.path === "hero.json");
      expect(heroContent).toBeDefined();
      expect(heroContent?.structure).toBeDefined();
    });

    it("should handle multiple definition files", async () => {
      const patterns = ["tests/definitions/**/*.ts"];

      const result = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        false,
        mockLogger,
        2
      );

      expect(result.contents.length).toBeGreaterThan(1);
      expect(result.successCount).toBeGreaterThan(1);

      // Should have processed definitions from multiple files
      const paths = result.contents.map((c) => c.path);
      expect(paths).toContain("hero.json");
      expect(paths.some((p) => p.includes("pages/"))).toBe(true);
    });

    it("should filter relevant files before processing", async () => {
      // Include files that don't have ATMYAPP exports
      const patterns = ["tests/**/*.ts"];

      const result = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        false,
        mockLogger,
        2
      );

      // Should still find the definition files but filter out test files
      expect(result.contents.length).toBeGreaterThan(0);

      // All results should be valid definitions
      result.contents.forEach((content) => {
        expect(content.path).toBeDefined();
        expect(content.structure).toBeDefined();
      });
    });
  });

  describe("WorkerPool", () => {
    it("should create worker pool with correct settings", () => {
      const workerPool = new WorkerPool(mockLogger, 4);
      expect(workerPool).toBeDefined();
    });

    it("should handle worker pool with no tasks", async () => {
      const workerPool = new WorkerPool(mockLogger, 1);
      const results = await workerPool.processFiles([]);
      expect(results).toEqual([]);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid tsconfig path", async () => {
      const patterns = ["tests/definitions/someFile.ts"];

      const result = await optimizedMigrationPipeline(
        patterns,
        "nonexistent-tsconfig.json",
        true, // continueOnError
        mockLogger,
        1
      );

      // Should handle gracefully
      expect(result).toBeDefined();
      expect(result.contents).toBeInstanceOf(Array);
    });

    it("should handle file processing errors gracefully", async () => {
      const patterns = ["tests/definitions/**/*.ts"];

      // This should not throw even if there are processing issues
      const result = await optimizedMigrationPipeline(
        patterns,
        "tsconfig.json",
        true, // continueOnError
        mockLogger,
        2
      );

      expect(result).toBeDefined();
      expect(result.contents).toBeInstanceOf(Array);
      expect(result.errors).toBeInstanceOf(Array);
    });
  });

  describe("Comparison with Sequential Processing", () => {
    it("should produce equivalent results to sequential processing", async () => {
      const {
        scanFiles,
        createProject,
        processFiles,
      } = require("../../src/cli/utils/schema-processor");

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
        1
      );

      // Results should be equivalent
      expect(parallelResult.contents.length).toBe(
        sequentialResult.contents.length
      );
      expect(parallelResult.successCount).toBe(sequentialResult.successCount);

      // Should find the same content
      const sequentialPaths = sequentialResult.contents
        .map((c: any) => c.path)
        .sort();
      const parallelPaths = parallelResult.contents.map((c) => c.path).sort();
      expect(parallelPaths).toEqual(sequentialPaths);
    });
  });
});
