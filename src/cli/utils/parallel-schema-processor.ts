import fg from "fast-glob";
import { Logger } from "../logger";
import { Content, ProcessingResult } from "../types/migrate";
import { WorkerPool, WorkerTask } from "./worker-pool";
import path from "path";

// Enhanced version of scanFiles with better performance
export async function scanFilesOptimized(
  patterns: string[],
  logger: Logger
): Promise<string[]> {
  logger.info("🔍 Scanning files with optimized parallel processing...");
  logger.verbose_log(`Using patterns: ${patterns.join(", ")}`);

  const files = await fg(patterns, {
    ignore: ["**/node_modules/**", "**/test/**", "**/dist/**", "**/.ama/**"],
    absolute: true,
    cwd: process.cwd(),
    suppressErrors: true, // Don't fail on permission errors
    followSymbolicLinks: false, // Skip symlinks for better performance
  });

  logger.verbose_log(`Found ${files.length} files matching patterns`);
  return files;
}

// Parallel processing of files using worker threads
export async function processFilesParallel(
  files: string[],
  tsconfigPath: string,
  continueOnError: boolean,
  logger: Logger,
  maxWorkers?: number
): Promise<ProcessingResult> {
  const contents: Content[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  logger.info(`📚 Processing ${files.length} files in parallel...`);

  // Filter files that likely contain ATMYAPP exports for better performance
  const relevantFiles = await filterRelevantFiles(files, logger);

  if (relevantFiles.length === 0) {
    logger.warn("No files with ATMYAPP exports found");
    return { contents, errors, successCount, failureCount };
  }

  logger.info(
    `🎯 Processing ${relevantFiles.length} relevant files (filtered from ${files.length})`
  );

  // In test environment, fall back to sequential processing
  // to avoid worker thread module loading issues
  if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID) {
    logger.verbose_log(
      "Using fallback sequential processing in test environment"
    );

    // Import sequential processing functions
    const {
      scanFiles,
      createProject,
      processFiles,
    } = require("./schema-processor");

    const project = createProject(relevantFiles, tsconfigPath, logger);
    const result = processFiles(
      project.getSourceFiles(),
      tsconfigPath,
      continueOnError,
      logger
    );

    return result;
  }

  // Create worker tasks
  const tasks: WorkerTask[] = relevantFiles.map((file, index) => ({
    id: `task-${index}-${path.basename(file)}`,
    filePath: file,
    tsconfigPath,
  }));

  // Process files using worker pool
  const workerPool = new WorkerPool(logger, maxWorkers);

  try {
    const results = await workerPool.processFiles(tasks);

    // Aggregate results
    for (const result of results) {
      if (result.success) {
        contents.push(...result.contents);
        successCount += result.contents.length;

        if (result.contents.length > 0) {
          logger.verbose_log(
            `✅ Processed ${result.contents.length} definitions from ${result.id}`
          );
        }
      } else {
        failureCount++;
        const errorMessage = `❌ ${result.id} - ${result.error}`;
        errors.push(errorMessage);

        if (!continueOnError) {
          throw new Error(errorMessage);
        }
      }
    }

    logger.success(
      `✅ Parallel processing completed: ${successCount} definitions from ${relevantFiles.length} files`
    );
  } catch (error) {
    logger.error("Parallel processing failed:", error);
    throw error;
  }

  const { createProject, extractMdxConfigsFromSourceFiles } = require("./schema-processor");
  const project = createProject(relevantFiles, tsconfigPath, logger);
  const mdxConfigs = extractMdxConfigsFromSourceFiles(
    project.getSourceFiles(),
    logger
  );
  if (mdxConfigs.length > 0) {
    contents.push(...mdxConfigs);
    successCount += mdxConfigs.length;
  }

  return { contents, errors, successCount, failureCount };
}

// Pre-filter files to only process those likely to contain ATMYAPP exports
async function filterRelevantFiles(
  files: string[],
  logger: Logger
): Promise<string[]> {
  logger.verbose_log("🔍 Pre-filtering files for ATMYAPP exports...");

  const fs = require("fs").promises;
  const relevantFiles: string[] = [];

  // Process files in chunks for better performance
  const chunkSize = 50;
  const chunks = [];

  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (file) => {
      try {
        // Quick text search for ATMYAPP export
        const content = await fs.readFile(file, "utf8");

        // Simple regex to check for ATMYAPP exports
        if (
          /export\s+type\s+ATMYAPP\s*=/.test(content) ||
          /AmaMdxConfigDef/.test(content)
        ) {
          return file;
        }

        return null;
      } catch (error) {
        // Skip files that can't be read
        logger.verbose_log(`Skipping unreadable file: ${file}`);
        return null;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    relevantFiles.push(...(chunkResults.filter(Boolean) as string[]));
  }

  logger.verbose_log(
    `📊 Filtered to ${relevantFiles.length} relevant files from ${files.length} total`
  );
  return relevantFiles;
}

// Optimized file processing pipeline
export async function optimizedMigrationPipeline(
  patterns: string[],
  tsconfigPath: string,
  continueOnError: boolean,
  logger: Logger,
  maxWorkers?: number
): Promise<ProcessingResult> {
  // Step 1: Scan files with optimization
  const files = await scanFilesOptimized(patterns, logger);

  if (files.length === 0) {
    logger.warn("No files found matching patterns");
    return { contents: [], errors: [], successCount: 0, failureCount: 0 };
  }

  // Step 2: Process files in parallel
  return await processFilesParallel(
    files,
    tsconfigPath,
    continueOnError,
    logger,
    maxWorkers
  );
}
