import { Command } from "commander";
import { Logger } from "../logger";
import { setConfig } from "../utils/config";
import {
  detectProjectIdFromUrl,
  verifyCliAuthentication,
} from "../utils/http";
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
    .description("Set authentication token for an AtMyApp project")
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
        const projectUrl = (
          options.url || (await rlQuestion("Enter the project URL: "))
        ).trim();
        const authToken = (
          options.token ||
          (await rlQuestion("Enter the authentication token: "))
        ).trim();

        if (!projectUrl) {
          throw new Error("Project URL is required.");
        }

        if (!authToken) {
          throw new Error("Authentication token is required.");
        }

        logger.info("Verifying CLI authentication...");

        const verifiedAuth = await verifyCliAuthentication({
          url: projectUrl,
          token: authToken,
        });

        const detectedProjectId = detectProjectIdFromUrl(projectUrl);
        const requestedProjectId = options.projectId || detectedProjectId;

        if (
          requestedProjectId &&
          requestedProjectId !== verifiedAuth.projectId
        ) {
          throw new Error(
            `CLI key belongs to project '${verifiedAuth.projectId}', but '${requestedProjectId}' was provided in the URL or --project-id option.`
          );
        }

        const projectId = verifiedAuth.projectId;

        // Create .ama directory if it doesn't exist
        const amaDir = path.join(process.cwd(), ".ama");
        if (!fs.existsSync(amaDir)) {
          fs.mkdirSync(amaDir, { recursive: true });
          logger.verbose_log(`Created directory ${amaDir}.`);
        }

        // Add .gitignore if it doesn't exist or update it
        const gitignorePath = path.join(process.cwd(), ".gitignore");
        const gitignoreEntry = "\n# AtMyApp configuration\n.ama/session.json\n";

        if (!fs.existsSync(gitignorePath)) {
          fs.writeFileSync(gitignorePath, gitignoreEntry);
          logger.verbose_log(`Created ${gitignorePath} with AtMyApp ignore rules.`);
        } else {
          const currentContent = fs.readFileSync(gitignorePath, "utf8");
          if (!currentContent.includes(".ama/session.json")) {
            fs.appendFileSync(gitignorePath, gitignoreEntry);
            logger.verbose_log(`Updated ${gitignorePath} with AtMyApp ignore rules.`);
          }
        }

        const configData = { token: authToken, projectId, url: projectUrl };
        setConfig(configData);

        // Save session data to .ama/session.json
        fs.writeFileSync(
          path.join(amaDir, "session.json"),
          JSON.stringify(configData, null, 2)
        );

        logger.success(
          `CLI authentication verified for project '${projectId}' (${verifiedAuth.keyName}).`
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
