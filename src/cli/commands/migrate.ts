import { Command } from "commander";
import {
  getMigrateConfig,
  Logger,
  MigrateOptions,
  scanFiles,
  createProject,
  processFiles,
  generateOutput,
  ensureAmaDirectory,
  saveOutputToFile,
  uploadDefinitions,
  registerTypeTransformer,
  definitionPipeline,
  DefinitionProcessor,
  ValidationRule,
  OutputTransformer,
} from "../utils";
import { optimizedMigrationPipeline } from "../utils/parallel-schema-processor";

// Re-export functions for external use and customization
export { registerTypeTransformer };
export {
  definitionPipeline,
  DefinitionProcessor,
  ValidationRule,
  OutputTransformer,
};

// Enhanced migrate options with parallel processing
interface EnhancedMigrateOptions extends MigrateOptions {
  parallel?: boolean;
  maxWorkers?: number;
  useFiltering?: boolean;
}

// Main migrate command function
export function migrateCommand(): Command {
  return new Command("migrate")
    .description("Migrate definitions to AtMyApp platform")
    .option(
      "--dry-run",
      "Generate definitions without uploading to server",
      false,
    )
    .option("--verbose", "Enable verbose logging", false)
    .option("--tsconfig <path>", "Path to tsconfig.json", "tsconfig.json")
    .option(
      "--continue-on-error",
      "Continue processing even if some files fail",
      false,
    )
    .option(
      "--parallel",
      "Enable parallel processing using worker threads (default: true)",
      true,
    )
    .option(
      "--max-workers <number>",
      "Maximum number of worker threads (default: CPU cores, max 8)",
      (value) => parseInt(value),
      undefined,
    )
    .option("--no-filtering", "Disable file pre-filtering optimization", false)
    .action(async (options: EnhancedMigrateOptions) => {
      const startTime = Date.now();
      const logger = new Logger(options.verbose);

      try {
        logger.info("Starting migration process.");
        logger.verbose_log(`Options: ${JSON.stringify(options)}`);

        if (options.parallel) {
          logger.info("Parallel processing enabled.");
          if (options.maxWorkers) {
            logger.info(`Using ${options.maxWorkers} worker threads.`);
          }
        } else {
          logger.info("Using sequential processing.");
        }

        const config = getMigrateConfig();
        const patterns = config.include || ["**/*.ts", "**/*.tsx"];

        // Create .ama directory if it doesn't exist
        ensureAmaDirectory(logger);

        let processingResult;

        if (options.parallel !== false) {
          // Use optimized parallel processing pipeline
          logger.info("Using optimized parallel processing pipeline.");
          processingResult = await optimizedMigrationPipeline(
            patterns,
            options.tsconfig,
            options.continueOnError,
            logger,
            options.maxWorkers,
          );
        } else {
          // Fallback to original sequential processing
          logger.info("Using original sequential processing.");
          const files = await scanFiles(patterns, logger);
          logger.info(`Found ${files.length} files to process.`);

          const project = createProject(files, options.tsconfig, logger);
          processingResult = processFiles(
            project.getSourceFiles(),
            options.tsconfig,
            options.continueOnError,
            logger,
          );
        }

        const { contents, errors, successCount, failureCount } =
          processingResult;

        // Report processing results
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.success(
          `Successfully processed ${successCount} AMA contents in ${processingTime}s.`,
        );

        if (failureCount > 0) {
          logger.warn(`Failed to process ${failureCount} items.`);
          if (options.verbose && errors.length > 0) {
            logger.info("Errors encountered:");
            errors.forEach((err) => logger.error(`  ${err}`));
          }
        }

        if (contents.length === 0) {
          logger.error("No valid AMA contents found. Exiting.");
          process.exit(1);
        }

        // Generate and save output
        const outputStartTime = Date.now();
        logger.info("Generating output definitions...");
        const output = generateOutput(contents, config, logger);
        const outputTime = ((Date.now() - outputStartTime) / 1000).toFixed(2);
        logger.verbose_log(`Output generation took ${outputTime}s`);

        saveOutputToFile(output, logger);

        // Upload definitions unless dry-run is enabled
        if (!options.dryRun) {
          logger.info("Uploading definitions to AtMyApp platform.");
          const uploadStartTime = Date.now();
          const uploadSuccess = await uploadDefinitions(output, config, logger);
          const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
          logger.verbose_log(`Upload took ${uploadTime}s`);

          if (!uploadSuccess) {
            logger.warn(
              "Upload failed, but definitions were generated successfully",
            );
            process.exit(1);
          }
        } else {
          logger.info("Dry run mode enabled. Skipping upload to server.");
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.success(`Migration completed successfully in ${totalTime}s.`);

        // Performance summary
        if (options.verbose) {
          logger.info("Performance summary:");
          logger.info(`  Total time: ${totalTime}s`);
          logger.info(`  Processing time: ${processingTime}s`);
          logger.info(`  Files processed: ${successCount}`);
          logger.info(
            `  Processing mode: ${options.parallel !== false ? "Parallel" : "Sequential"}`,
          );
          if (options.parallel !== false && options.maxWorkers) {
            logger.info(`  Worker threads: ${options.maxWorkers}`);
          }
        }
      } catch (error: unknown) {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Fatal error after ${totalTime}s: ${message}`, error);
        process.exit(1);
      }
    });
}
