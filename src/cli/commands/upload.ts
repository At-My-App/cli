import { Command } from "commander";
import fg from "fast-glob";
import path from "path";
import { promises as fs } from "fs";
import { Logger } from "../logger";
import {
  createAmaFetch,
  encodePathSegment,
  projectUrl,
  resolveSession,
  streamSse,
} from "../utils/http";
import type { AmaSession } from "../utils/http";

const DEFAULT_BRANCH = "main";
const DEFAULT_IGNORE_PATTERNS = ["**/.git/**", "**/.ama/**"];

interface UploadCommandOptions {
  token?: string;
  url?: string;
  projectId?: string;
  basePath?: string;
  branch?: string;
  environmentName?: string;
  stream?: boolean;
  delete?: string[];
  commit?: string;
  verbose?: boolean;
}

interface UploadFilePayload {
  path: string;
  content: string;
  metadata?: Record<string, string>;
}

interface UploadRequestBody {
  files: UploadFilePayload[];
  filesToDelete?: string[];
  commitMessage?: string;
}

interface UploadResponseBody {
  success: boolean;
  data: {
    success: boolean;
    status: string;
    updated?: string[];
    deleted?: string[];
    errors?: Record<string, string>;
  } | null;
  error: string;
}

interface UploadSseMessage {
  type?: string;
  message?: string;
  path?: string;
  index?: number;
  total?: number;
  updated?: string[];
  deleted?: string[];
  errors?: Record<string, string>;
  success?: boolean;
}

interface UploadSummary {
  updated: Set<string>;
  deleted: Set<string>;
  errors: Map<string, string>;
  hadErrorEvent: boolean;
}

interface UploadQueryParams {
  branch?: string;
  environment_name?: string;
  stream?: boolean;
}

export function uploadCommand(): Command {
  return new Command("upload")
    .description("Upload files to project storage")
    .argument("[inputs...]")
    .option("-t, --token <token>", "Authentication token override")
    .option("-u, --url <url>", "Project base URL override")
    .option("-p, --project-id <id>", "Project identifier override")
    .option("-b, --base-path <path>", "Base remote path (relative to project root)")
    .option("--branch <name>", "Branch to write to", DEFAULT_BRANCH)
    .option("--environment-name <name>", "Environment name for scoped writes")
    .option("--commit <message>", "Commit message recorded with the upload")
    .option(
      "--delete <path>",
      "Remote file path to delete (repeatable)",
      collectValues,
      [] as string[]
    )
    .option("--no-stream", "Disable streaming progress output (enabled by default)")
    .option("--verbose", "Enable verbose logging")
    .action(async (inputPatterns: string[], options: UploadCommandOptions) => {
      const logger = new Logger(Boolean(options.verbose));

      try {
        const session = resolveSession({
          token: options.token,
          projectId: options.projectId,
          url: options.url,
        });

        const basePath = normalizeBasePath(options.basePath);
        const streamEnabled = options.stream !== false;

        const files = await prepareFiles(inputPatterns, basePath, logger);
        const filesToDelete = normalizeDeletionPaths(
          options.delete ?? [],
          basePath,
          logger
        );

        if (files.length === 0 && filesToDelete.length === 0) {
          throw new Error(
            "Nothing to upload. Provide file inputs or --delete paths to process."
          );
        }

        const body: UploadRequestBody = {
          files,
        };

        if (filesToDelete.length > 0) {
          body.filesToDelete = filesToDelete;
        }

        if (options.commit) {
          body.commitMessage = options.commit;
        }

        const query: UploadQueryParams = {
          branch: options.branch ?? DEFAULT_BRANCH,
        };

        if (options.environmentName) {
          query.environment_name = options.environmentName;
        }

        if (streamEnabled) {
          query.stream = true;
          await performStreamingUpload(session, basePath, body, query, logger);
        } else {
          await performStandardUpload(session, basePath, body, query, logger);
        }

        logger.success("Upload completed successfully.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Upload failed: ${message}`);
        process.exit(1);
      }
    });
}

function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function normalizeBasePath(basePath?: string): string | undefined {
  if (!basePath) {
    return undefined;
  }

  const trimmed = basePath.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = toPosix(trimmed)
    .replace(/^\.\/?/, "")
    .replace(/\/+$/, "");

  return normalized || undefined;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

async function prepareFiles(
  patterns: string[],
  basePath: string | undefined,
  logger: Logger
): Promise<UploadFilePayload[]> {
  if (!patterns || patterns.length === 0) {
    return [];
  }

  const resolvedPaths = new Set<string>();

  for (const pattern of patterns) {
    const expanded = await expandInput(pattern);

    if (expanded.length === 0) {
      logger.warn(`No files matched pattern '${pattern}'.`);
    }

    for (const filePath of expanded) {
      resolvedPaths.add(path.resolve(filePath));
    }
  }

  const sortedPaths = Array.from(resolvedPaths).sort();
  const files: UploadFilePayload[] = [];

  for (const absolutePath of sortedPaths) {
    const buffer = await fs.readFile(absolutePath);
    const relativePath = path.relative(process.cwd(), absolutePath) ||
      path.basename(absolutePath);
    const posixPath = toPosix(relativePath);
    const remotePath = computeRemotePath(posixPath, basePath, logger);

    logger.verbose_log(
      `Preparing file '${absolutePath}' as remote path '${remotePath}'.`
    );

    files.push({
      path: remotePath,
      content: buffer.toString("base64"),
    });
  }

  return files;
}

async function expandInput(input: string): Promise<string[]> {
  const cwd = process.cwd();
  const absoluteCandidate = path.resolve(cwd, input);

  try {
    const stats = await fs.stat(absoluteCandidate);
    if (stats.isDirectory()) {
      const entries = await fg("**/*", {
        cwd: absoluteCandidate,
        dot: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: DEFAULT_IGNORE_PATTERNS,
      });

      return entries.map((entry) => path.resolve(absoluteCandidate, entry));
    }

    if (stats.isFile()) {
      return [absoluteCandidate];
    }
  } catch (error) {
    // Treat as glob when path resolution fails
  }

  const normalizedPattern = toPosix(input);
  const matches = await fg(normalizedPattern, {
    cwd,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: DEFAULT_IGNORE_PATTERNS,
    unique: true,
  });

  return matches.map((match) => path.resolve(cwd, match));
}

function computeRemotePath(
  posixPath: string,
  basePath: string | undefined,
  logger: Logger
): string {
  const cleaned = posixPath.replace(/^\.\//, "");

  if (!basePath) {
    return cleaned;
  }

  const relativeToBase = path.posix.relative(basePath, cleaned);

  if (relativeToBase.startsWith("..")) {
    logger.warn(
      `File '${cleaned}' is outside the base path '${basePath}'. Using absolute path.`
    );
    return cleaned;
  }

  const normalized = relativeToBase.replace(/^\.\//, "");
  const finalSegment = normalized || path.posix.basename(cleaned);
  return `./${finalSegment}`;
}

function normalizeDeletionPaths(
  values: string[],
  basePath: string | undefined,
  logger: Logger
): string[] {
  if (!values || values.length === 0) {
    return [];
  }

  const result: string[] = [];

  for (const original of values) {
    const trimmed = original.trim();
    if (!trimmed) {
      continue;
    }

    const posix = toPosix(trimmed);

    if (posix.startsWith("./")) {
      result.push(`./${posix.replace(/^\.\/+/, "")}`);
      continue;
    }

    if (posix.startsWith("/")) {
      result.push(posix.replace(/^\/+/, ""));
      continue;
    }

    result.push(computeRemotePath(posix, basePath, logger));
  }

  return result;
}

function buildUploadEndpoint(
  session: AmaSession,
  basePath: string | undefined
): string {
  const projectSegment = `v0/projects/${encodeURIComponent(
    session.projectId
  )}/storage/f`;

  if (!basePath) {
    return projectSegment;
  }

  const encodedBase = encodePathSegment(basePath);
  return `${projectSegment}/${encodedBase}`;
}

async function performStreamingUpload(
  session: AmaSession,
  basePath: string | undefined,
  body: UploadRequestBody,
  query: UploadQueryParams,
  logger: Logger
): Promise<void> {
  const endpoint = buildUploadEndpoint(session, basePath);
  const url = projectUrl(session, endpoint, {
    branch: query.branch,
    environment_name: query.environment_name,
    stream: true,
  });

  const summary: UploadSummary = {
    updated: new Set<string>(),
    deleted: new Set<string>(),
    errors: new Map<string, string>(),
    hadErrorEvent: false,
  };

  await streamSse<UploadSseMessage>({
    url,
    fetchInit: {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(body),
    },
    onEvent: async (event) => {
      if (event.data === "[DONE]") {
        return;
      }

      const payload = event.parsed;

      if (!payload) {
        logger.verbose_log(`SSE: ${event.data}`);
        return;
      }

      if (payload.message) {
        logger.info(payload.message);
      }

      if (payload.updated) {
        payload.updated.forEach((item) => summary.updated.add(item));
      }

      if (payload.deleted) {
        payload.deleted.forEach((item) => summary.deleted.add(item));
      }

      if (payload.errors) {
        Object.entries(payload.errors).forEach(([key, value]) => {
          summary.errors.set(key, value);
          logger.error(`Error processing '${key}': ${value}`);
        });
      }

      if (payload.type === "error" || payload.success === false) {
        summary.hadErrorEvent = true;
      }

      if (payload.type === "complete") {
        logger.info("Upload stream completed.");
      }
    },
  });

  if (summary.updated.size > 0) {
    logger.success(
      `Updated ${summary.updated.size} file(s): ${Array.from(summary.updated).join(", ")}`
    );
  }

  if (summary.deleted.size > 0) {
    logger.warn(
      `Deleted ${summary.deleted.size} file(s): ${Array.from(summary.deleted).join(", ")}`
    );
  }

  if (summary.errors.size > 0 || summary.hadErrorEvent) {
    throw new Error("Upload completed with errors. Check the log for details.");
  }
}

async function performStandardUpload(
  session: AmaSession,
  basePath: string | undefined,
  body: UploadRequestBody,
  query: UploadQueryParams,
  logger: Logger
): Promise<void> {
  const endpoint = buildUploadEndpoint(session, basePath);
  const url = projectUrl(session, endpoint, {
    branch: query.branch,
    environment_name: query.environment_name,
  });

  const fetcher = createAmaFetch(session);

  const { data, error } = await fetcher<UploadResponseBody>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
    throw new Error("No response data received from the server.");
  }

  if (!data.success) {
    throw new Error(data.error || "Upload failed without a server error message.");
  }

  const payload = data.data;

  if (!payload) {
    logger.success("Server reported success with no additional details.");
    return;
  }

  if (payload.updated && payload.updated.length > 0) {
    logger.success(`Updated files: ${payload.updated.join(", ")}`);
  }

  if (payload.deleted && payload.deleted.length > 0) {
    logger.warn(`Deleted files: ${payload.deleted.join(", ")}`);
  }

  if (payload.errors && Object.keys(payload.errors).length > 0) {
    for (const [pathKey, value] of Object.entries(payload.errors)) {
      logger.error(`Error for '${pathKey}': ${value}`);
    }

    throw new Error("Upload completed with file-specific errors.");
  }
}
