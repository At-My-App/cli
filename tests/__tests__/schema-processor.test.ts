import {
  scanFiles,
  createProject,
  processFiles,
  processAtmyappExport,
} from "../../src/cli/utils/schema-processor";
import { Logger } from "../../src/cli/logger";
import { Project, SourceFile } from "ts-morph";
import path from "path";

// Mock logger for testing
const mockLogger = new Logger(false);

describe("Schema Processor", () => {
  describe("scanFiles", () => {
    it("should scan files based on patterns", async () => {
      const patterns = ["**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);

      expect(files).toBeInstanceOf(Array);
      expect(files.length).toBeGreaterThan(0);

      // Should include test files in the project
      const testFile = files.find((f) => f.includes("someFile.ts"));
      expect(testFile).toBeDefined();
    });

    it("should ignore node_modules and dist directories", async () => {
      const patterns = ["**/*.ts"];
      const files = await scanFiles(patterns, mockLogger);

      const hasNodeModules = files.some((f) => f.includes("node_modules"));
      const hasDist = files.some((f) => f.includes("dist"));

      expect(hasNodeModules).toBe(false);
      expect(hasDist).toBe(false);
    });
  });

  describe("createProject", () => {
    it("should create a TypeScript project", () => {
      const files = [path.resolve(__dirname, "../definitions/someFile.ts")];
      const project = createProject(files, "tsconfig.json", mockLogger);

      expect(project).toBeInstanceOf(Project);
      expect(project.getSourceFiles().length).toBeGreaterThan(0);
    });

    it("should handle missing tsconfig gracefully", () => {
      const files = [path.resolve(__dirname, "../definitions/someFile.ts")];
      const project = createProject(
        files,
        "nonexistent-tsconfig.json",
        mockLogger
      );

      expect(project).toBeInstanceOf(Project);
    });
  });

  describe("processAtmyappExport", () => {
    let project: Project;
    let sourceFile: SourceFile;

    beforeEach(() => {
      const testFile = path.resolve(__dirname, "../definitions/someFile.ts");
      project = createProject([testFile], "tsconfig.json", mockLogger);
      sourceFile = project.getSourceFileOrThrow(testFile);
    });

    it("should process ATMYAPP export correctly", () => {
      const atmyappExports = sourceFile
        .getTypeAliases()
        .filter((alias) => alias.getName() === "ATMYAPP" && alias.isExported());

      expect(atmyappExports.length).toBe(1);

      const contents = processAtmyappExport(
        atmyappExports[0],
        sourceFile,
        "tsconfig.json",
        mockLogger
      );

      expect(contents).toBeInstanceOf(Array);
      expect(contents.length).toBe(1);
      expect(contents[0]).toHaveProperty("path", "hero.json");
      expect(contents[0]).toHaveProperty("structure");
    });
  });

  describe("processFiles", () => {
    it("should process files and extract ATMYAPP definitions", () => {
      const testFile = path.resolve(__dirname, "../definitions/someFile.ts");
      const project = createProject([testFile], "tsconfig.json", mockLogger);
      const sourceFiles = project.getSourceFiles();

      const result = processFiles(
        sourceFiles,
        "tsconfig.json",
        false,
        mockLogger
      );

      expect(result.contents.length).toBeGreaterThan(0);
      expect(result.successCount).toBeGreaterThan(0);
      expect(result.failureCount).toBe(0);
      expect(result.errors.length).toBe(0);

      // Check if we got the hero.json definition
      const heroContent = result.contents.find((c) => c.path === "hero.json");
      expect(heroContent).toBeDefined();
      expect(heroContent?.structure).toBeDefined();
    });

    it("should continue on error when continueOnError is true", () => {
      const testFile = path.resolve(__dirname, "../definitions/someFile.ts");
      const project = createProject([testFile], "tsconfig.json", mockLogger);
      const sourceFiles = project.getSourceFiles();

      const result = processFiles(
        sourceFiles,
        "tsconfig.json",
        true, // continueOnError = true
        mockLogger
      );

      // Should not throw and should have some results
      expect(result).toBeDefined();
      expect(result.contents).toBeInstanceOf(Array);
    });
  });
});
