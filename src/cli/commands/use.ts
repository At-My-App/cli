import { Command } from "commander";
import { Logger } from "../logger";
import { setConfig } from "../utils/config";
import * as fs from "fs";
import * as path from "path";

interface UseCommandOptions {
  token?: string;
  url?: string;
  projectId?: string;
  verbose?: boolean;
}

export function useCommand(): Command {
  return new Command("use")
    .description("Set authentication token for AMA project")
    .option("-t, --token <token>", "Authentication token")
    .option("-u, --url <url>", "Project base URL")
    .option("-p, --project-id <id>", "Project identifier override")
    .option("--verbose", "Enable verbose logging")
    .action(async (options: UseCommandOptions) => {
      const logger = new Logger(Boolean(options.verbose));

      const rlQuestion = (query: string): Promise<string> => {
        return new Promise((resolve) => {
          const rl = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.question(query, (answer: string) => {
            rl.close();
            resolve(answer);
          });
        });
      };

      try {
        // Prompt user for URL and token if not provided
        const projectUrl =
          options.url || (await rlQuestion("Enter the project URL: "));
        const authToken =
          options.token ||
          (await rlQuestion("Enter the authentication token: "));

        const detectProjectId = (url: string): string | undefined => {
          const match = url.match(/\/projects\/([^/?#]+)/i);
          return match?.[1];
        };

        const detectedProjectId = detectProjectId(projectUrl);
        const projectId = options.projectId || detectedProjectId;

        if (!projectId) {
          logger.warn(
            "Project ID could not be detected from the URL. Rerun with --project-id to set it explicitly."
          );
        }

        // Create .ama directory if it doesn't exist
        const amaDir = path.join(process.cwd(), ".ama");
        if (!fs.existsSync(amaDir)) {
          fs.mkdirSync(amaDir, { recursive: true });
          logger.verbose_log(`Created directory ${amaDir}.`);
        }

        // Add .gitignore if it doesn't exist or update it
        const gitignorePath = path.join(process.cwd(), ".gitignore");
        const gitignoreEntry = "\n# AMA configuration\n.ama/session.json\n";

        if (!fs.existsSync(gitignorePath)) {
          fs.writeFileSync(gitignorePath, gitignoreEntry);
          logger.verbose_log(`Created ${gitignorePath} with AMA ignore rules.`);
        } else {
          const currentContent = fs.readFileSync(gitignorePath, "utf8");
          if (!currentContent.includes(".ama/session.json")) {
            fs.appendFileSync(gitignorePath, gitignoreEntry);
            logger.verbose_log(`Updated ${gitignorePath} with AMA ignore rules.`);
          }
        }

        const configData = { token: authToken, projectId, url: projectUrl };
        setConfig(configData);

        // Save session data to .ama/session.json
        fs.writeFileSync(
          path.join(amaDir, "session.json"),
          JSON.stringify(configData, null, 2)
        );

        logger.success("Authentication details saved for the project.");
        logger.info(`Session file stored at ${path.join(amaDir, "session.json")}.`);
        logger.warn(
          "Keep your .ama/session.json file private and exclude it from version control."
        );
        logger.info("Session file has been added to the project .gitignore file.");
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Configuration update failed: ${message}`, error);
        process.exit(1);
      }
    });
}
