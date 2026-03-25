import { Command, Option } from "commander";
import { Logger } from "../logger";
import {
  DEFAULT_CANONICAL_SCHEMA_FILENAME,
  DEFAULT_CANONICAL_SCHEMA_TEMPLATE,
  type CanonicalSchemaTemplateName,
  initializeCanonicalSchema,
} from "../utils/canonical-schema";
import {
  createProjectApiKey,
  listProjectEnvironments,
  resolveSession,
  type ProjectEnvironment,
} from "../utils/http";

interface InitCommandOptions {
  path?: string;
  template?: CanonicalSchemaTemplateName;
  force?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  projectId?: string;
}

function askQuestion(query: string): Promise<string> {
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
}

async function askYesNo(query: string): Promise<boolean> {
  const answer = (await askQuestion(query)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

function selectDefaultEnvironment(
  environments: ProjectEnvironment[],
): ProjectEnvironment | undefined {
  const preferredNames = ["production", "prod", "main", "default"];

  for (const name of preferredNames) {
    const match = environments.find(
      (environment) => environment.name.toLowerCase() === name,
    );
    if (match) {
      return match;
    }
  }

  return [...environments].sort((left, right) => left.id - right.id)[0];
}

function supportsClientTemplate(template: CanonicalSchemaTemplateName): boolean {
  return template === "minimal" || template === "blog";
}

function getDefaultApiKeyName(template: CanonicalSchemaTemplateName): string {
  switch (template) {
    case "blog":
      return "Blog Template Key";
    case "minimal":
      return "Minimal Template Key";
    default:
      return "AtMyApp API Key";
  }
}

async function maybeCreateApiKey(
  logger: Logger,
  options: InitCommandOptions,
  template: CanonicalSchemaTemplateName,
): Promise<void> {
  if (!supportsClientTemplate(template)) {
    return;
  }

  let session;
  try {
    session = resolveSession({
      token: options.token,
      url: options.url,
      projectId: options.projectId,
    });
  } catch {
    logger.info(
      "Skipping API key creation. Run `atmyapp use` first or pass --url, --token, and --project-id to enable it.",
    );
    return;
  }

  const shouldCreateKey = await askYesNo(
    "Create a new project API key for this template now? [y/N]: ",
  );
  if (!shouldCreateKey) {
    return;
  }

  const environments = await listProjectEnvironments(session);
  const environment = selectDefaultEnvironment(environments);

  if (!environment) {
    logger.warn(
      "No environments were found for this project, so no API key was created.",
    );
    return;
  }

  const defaultName = getDefaultApiKeyName(template);
  const providedName = (
    await askQuestion(`API key name (${defaultName}): `)
  ).trim();
  const apiKeyName = providedName || defaultName;

  const apiKey = await createProjectApiKey({
    ...session,
    name: apiKeyName,
    environmentId: environment.id,
  });

  logger.success(
    `Created API key "${apiKey.name}" for environment "${environment.name}".`,
  );
  logger.info("Copy these lines into your env file:");
  console.log(`ATMYAPP_URL=${session.url}`);
  console.log(`ATMYAPP_API_KEY=${apiKey.id}`);
}

export function initCommand(): Command {
  return new Command("init")
    .description("Create starter AtMyApp schema and client files")
    .addOption(
      new Option("--template <template>", "Template name")
        .choices(["empty", "minimal", "blog"])
        .default(DEFAULT_CANONICAL_SCHEMA_TEMPLATE),
    )
    .option(
      "--path <path>",
      "Schema file path",
      DEFAULT_CANONICAL_SCHEMA_FILENAME,
    )
    .option("--force", "Overwrite generated files if they already exist", false)
    .option("-t, --token <token>", "Authentication token override")
    .option("-u, --url <url>", "Project URL override")
    .option("-p, --project-id <id>", "Project identifier override")
    .option("--verbose", "Enable verbose logging", false)
    .action(async (options: InitCommandOptions) => {
      const logger = new Logger(Boolean(options.verbose));

      try {
        const result = await initializeCanonicalSchema(logger, {
          filePath: options.path,
          template: options.template,
          force: Boolean(options.force),
        });

        logger.info(`Schema ready at ${result.schemaPath}.`);
        if (result.clientPath) {
          logger.info(`Client ready at ${result.clientPath}.`);
        }

        try {
          await maybeCreateApiKey(logger, options, result.template);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          logger.warn(`Template files were created, but API key creation failed: ${message}`);
        }

        logger.info("Next step: run `atmyapp migrate --dry-run --verbose`.");
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Init failed: ${message}`, error);
        process.exit(1);
      }
    });
}
