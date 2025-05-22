import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { Logger } from "../logger";
import { OutputDefinition } from "../types/migrate";

// Ensures the .ama directory exists
export function ensureAmaDirectory(logger: Logger): void {
  const amaDir = "./.ama";
  if (!existsSync(amaDir)) {
    logger.verbose_log(
      `Creating .ama directory at ${resolve(process.cwd(), amaDir)}`
    );
    mkdirSync(amaDir, { recursive: true });
  } else {
    logger.verbose_log(
      `.ama directory already exists at ${resolve(process.cwd(), amaDir)}`
    );
  }
}

// Saves the output definition to a local file
export function saveOutputToFile(
  output: OutputDefinition,
  logger: Logger
): void {
  const outputPath = "./.ama/definitions.json";
  logger.verbose_log(
    `Saving definitions to ${resolve(process.cwd(), outputPath)}`
  );
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  logger.success(`✅ Successfully generated ${outputPath}`);
}
