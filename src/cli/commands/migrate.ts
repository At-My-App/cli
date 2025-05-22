import { Command } from "commander";
import {
  getConfig,
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

// Re-export functions for external use and customization
export { registerTypeTransformer };
export {
  definitionPipeline,
  DefinitionProcessor,
  ValidationRule,
  OutputTransformer,
};

// Main migrate command function
export function migrateCommand(): Command {
  return new Command("migrate")
    .description("Migrate definitions to AtMyApp platform")
    .option(
      "--dry-run",
      "Generate definitions without uploading to server",
      false
    )
    .option("--verbose", "Enable verbose logging", false)
    .option("--tsconfig <path>", "Path to tsconfig.json", "tsconfig.json")
    .option(
      "--continue-on-error",
      "Continue processing even if some files fail",
      false
    )
    .action(async (options: MigrateOptions) => {
      const logger = new Logger(options.verbose);

      try {
        logger.info("🚀 Starting migration process");
        logger.verbose_log(`Options: ${JSON.stringify(options)}`);

        const config = getConfig();
        const patterns = config.include || ["**/*.ts", "**/*.tsx"];

        // Create .ama directory if it doesn't exist
        ensureAmaDirectory(logger);

        // Execute migration steps
        const files = await scanFiles(patterns, logger);
        logger.info(`📚 Found ${files.length} files to process`);

        const project = createProject(files, options.tsconfig, logger);
        const { contents, errors, successCount, failureCount } = processFiles(
          project.getSourceFiles(),
          options.tsconfig,
          options.continueOnError,
          logger
        );

        // Report processing results
        logger.success(
          `✅ Successfully processed ${successCount} AMA contents`
        );

        if (failureCount > 0) {
          logger.warn(`⚠️ Failed to process ${failureCount} items`);
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
        const output = generateOutput(contents, config, logger);
        saveOutputToFile(output, logger);

        // Upload definitions unless dry-run is enabled
        if (!options.dryRun) {
          logger.info("Uploading definitions to AtMyApp platform");
          const uploadSuccess = await uploadDefinitions(output, config, logger);

          if (!uploadSuccess) {
            logger.warn(
              "Upload failed, but definitions were generated successfully"
            );
            process.exit(1);
          }
        } else {
          logger.info("Dry run mode enabled. Skipping upload to server.");
        }

        logger.success("Migration completed successfully");
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Fatal error: ${message}`, error);
        process.exit(1);
      }
    });
}
