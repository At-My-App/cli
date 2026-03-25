import { Command } from "commander";
import {
  getMigrateConfig,
  Logger,
  MigrateOptions,
  findCanonicalSchemaFile,
  loadCanonicalSchemaFile,
  ensureAmaDirectory,
  saveOutputToFile,
  uploadDefinitions,
} from "../utils";
import { runCanonicalMigrate } from "../../runtime";

export function migrateCommand(): Command {
  return new Command("migrate")
    .description("Compile and upload the canonical AtMyApp schema")
    .option(
      "--dry-run",
      "Generate definitions without uploading to the server",
      false,
    )
    .option("--verbose", "Enable verbose logging", false)
    .action(async (options: MigrateOptions) => {
      const startTime = Date.now();
      const logger = new Logger(options.verbose);

      try {
        logger.info("Starting migration process.");
        logger.verbose_log(`Options: ${JSON.stringify(options)}`);

        const config = getMigrateConfig();
        ensureAmaDirectory(logger);

        const canonicalSchemaFile = await findCanonicalSchemaFile(logger);
        if (!canonicalSchemaFile) {
          throw new Error(
            "No canonical schema file found. Add atmyapp.schema.ts, atmyapp.schema.mts, atmyapp.schema.js, atmyapp.schema.mjs, atmyapp.schema.json, or one of the legacy ama.schema.* names to your project root.",
          );
        }

        const schema = await loadCanonicalSchemaFile(canonicalSchemaFile, logger);
        const migrateResult = await runCanonicalMigrate({
          schema,
          config: config as Record<string, unknown>,
          dryRun: options.dryRun,
          upload: false,
          url: config.url,
          token: config.token,
          verbose: options.verbose,
        });

        const output = migrateResult.output;
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const successCount = Object.keys(output.definitions).length;

        logger.success(
          `Loaded ${successCount} definitions from canonical schema.`,
        );

        saveOutputToFile(output, logger);

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

        if (options.verbose) {
          logger.info("Performance summary:");
          logger.info(`  Total time: ${totalTime}s`);
          logger.info(`  Processing time: ${processingTime}s`);
          logger.info(`  Definitions processed: ${successCount}`);
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
