import { Command } from "commander";
import path from "path";
import { promises as fs } from "fs";
import { Logger } from "../logger";
import { createAmaFetch, projectUrl, resolveSession } from "../utils/http";

const DEFAULT_BRANCH = "main";

interface GenerateCommandOptions {
  token?: string;
  url?: string;
  projectId?: string;
  branch?: string;
  path: string;
  json?: boolean;
  save?: string;
  warningsAsError?: boolean;
  verbose?: boolean;
}

interface PlaceholderResponseBody {
  success: boolean;
  data: {
    path: string;
    content: string;
    metadata?: Record<string, unknown>;
    warnings?: string[];
    saved?: boolean;
  } | null;
  error: string;
}

export function generateCommand(): Command {
  return new Command("generate")
    .description("Generate a placeholder file in project storage")
    .requiredOption("--path <path>", "POSIX project-relative path to generate")
    .option("-t, --token <token>", "Authentication token override")
    .option("-u, --url <url>", "Project base URL override")
    .option("-p, --project-id <id>", "Project identifier override")
    .option("--branch <name>", "Branch to target", DEFAULT_BRANCH)
    .option("--save <file>", "Save generated content to a local file path")
    .option("--json", "Print raw JSON response")
    .option("--warnings-as-error", "Treat validation warnings as errors")
    .option("--verbose", "Enable verbose logging")
    .action(async (options: GenerateCommandOptions) => {
      const logger = new Logger(Boolean(options.verbose));

      try {
        const session = resolveSession({
          token: options.token,
          projectId: options.projectId,
          url: options.url,
        });

        const targetPath = normalizePlaceholderPath(options.path);
        const endpoint = buildGenerateEndpoint(session);
        const url = projectUrl(session, endpoint, {
          branch: options.branch ?? DEFAULT_BRANCH,
        });

        const fetcher = createAmaFetch(session);
        const { data, error } = await fetcher<PlaceholderResponseBody>(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: targetPath }),
        });

        if (error) {
          const errorMessage =
            typeof error === "string"
              ? error
              : error instanceof Error
              ? error.message
              : (error as { message?: string; status?: number }).message ??
                ((error as { status?: number }).status
                  ? `HTTP ${(error as { status?: number }).status}`
                  : "Unknown error");

          throw new Error(`Request failed: ${errorMessage}`);
        }

        if (!data) {
          throw new Error("No response received from the server.");
        }

        if (!data.success || !data.data) {
          throw new Error(data.error || "Placeholder generation failed.");
        }

        const result = data.data;

        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          logger.success(`Generated placeholder for ${result.path}.`);

          if (result.warnings && result.warnings.length > 0) {
            logger.warn(
              `Warnings (${result.warnings.length}):\n${result.warnings
                .map((warning) => `  • ${warning}`)
                .join("\n")}`
            );
          }
        }

        if (options.save) {
          await persistContent(options.save, result.content, logger);
        }

        if (
          options.warningsAsError &&
          result.warnings &&
          result.warnings.length > 0
        ) {
          throw new Error("Generation returned warnings treated as errors.");
        }

        logger.success("Placeholder generation completed.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Generation failed: ${message}`);
        process.exit(1);
      }
    });
}

function normalizePlaceholderPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Path is required and cannot be empty.");
  }

  return trimmed.replace(/\\/g, "/");
}

function buildGenerateEndpoint(session: { projectId: string }): string {
  return `v0/projects/${encodeURIComponent(
    session.projectId
  )}/storage/ghost/placeholders`;
}

async function persistContent(destination: string, content: string, logger: Logger) {
  const absolutePath = path.resolve(process.cwd(), destination);
  const directory = path.dirname(absolutePath);

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  logger.success(`Saved generated content to ${absolutePath}.`);
}
