import { Command } from "commander";
import chalk from "chalk";
import { setConfig } from "../utils/config";
import * as fs from "fs";
import * as path from "path";

export function useCommand(): Command {
  return new Command("use")
    .description("Set authentication token for AMA project")
    .option("-t, --token <token>", "Authentication token")
    .option("-u, --url <url>", "Project base URL")
    .action(async (options) => {
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

        // Create .ama directory if it doesn't exist
        const amaDir = path.join(process.cwd(), ".ama");
        if (!fs.existsSync(amaDir)) {
          fs.mkdirSync(amaDir, { recursive: true });
        }

        // Add .gitignore if it doesn't exist or update it
        const gitignorePath = path.join(process.cwd(), ".gitignore");
        const gitignoreEntry = "\n# AMA configuration\n.ama/session.json\n";

        if (!fs.existsSync(gitignorePath)) {
          fs.writeFileSync(gitignorePath, gitignoreEntry);
        } else {
          const currentContent = fs.readFileSync(gitignorePath, "utf8");
          if (!currentContent.includes(".ama/session.json")) {
            fs.appendFileSync(gitignorePath, gitignoreEntry);
          }
        }

        const projectId = "proj_" + Math.random().toString(36).slice(2, 9);
        const configData = { token: authToken, projectId, url: projectUrl };
        setConfig(configData);

        // Save session data to .ama/session.json
        fs.writeFileSync(
          path.join(amaDir, "session.json"),
          JSON.stringify(configData, null, 2)
        );

        console.log(
          chalk.green("🔐 Successfully authenticated and joined project")
        );
        console.log(
          chalk.yellow(
            "⚠️  Warning: Keep your .ama/session.json file private and do not commit it to version control"
          )
        );
        console.log(
          chalk.blue(
            "ℹ️  Note: Session file has been automatically added to .gitignore"
          )
        );
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(chalk.red(`❌ Error: ${message}`));
        process.exit(1);
      }
    });
}
