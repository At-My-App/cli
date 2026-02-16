import { Command } from "commander";
import { Logger } from "../logger";
import { resolveSession, projectUrl, type AmaSession } from "../utils/http";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

interface SnapshotCommandOptions {
  token?: string;
  url?: string;
  projectId?: string;
  verbose?: boolean;
  branch?: string;
  forceSync?: boolean;
  output?: string;
}

interface SnapshotResponse {
  success: boolean;
  data?: {
    success: boolean;
    projectId: string;
    branch: string;
    downloadUrl: string;
    stats: {
      collectionsProcessed: number;
      entriesIncluded: number;
      blobsIncluded: number;
      filesIncluded: number;
      totalSizeBytes: number;
      filesSkippedTooLarge: number;
      failedItems: number;
    };
    duration: number;
    expiresAt: string;
  };
  error?: string;
}

interface LatestSnapshotResponse {
  success: boolean;
  data?: {
    id: string;
    projectId: string;
    branch: string;
    status: string;
    downloadUrl: string;
    downloadKey: string;
    expiresAt: string;
    isExpired: boolean;
    stats: {
      collectionsProcessed: number;
      entriesIncluded: number;
      blobsIncluded: number;
      totalSizeBytes: number;
    };
    durationMs: number;
    createdAt: string;
    completedAt: string;
  };
  error?: string;
}

const DEFAULT_OUTPUT_PATH = ".ama/local";
const API_BASE = "https://ama-core.maciekgamro.workers.dev";

/**
 * Get the work-container API URL for snapshot operations
 */
function getSnapshotApiUrl(projectId: string, endpoint: string): string {
  return `${API_BASE}/v0/work-container/projects/${projectId}/${endpoint}`;
}

/**
 * Create a new snapshot
 */
async function createSnapshot(
  session: AmaSession,
  options: SnapshotCommandOptions,
  logger: Logger
): Promise<SnapshotResponse> {
  const url = getSnapshotApiUrl(session.projectId, "snapshot");

  logger.info(`Creating snapshot for project ${session.projectId}...`);
  logger.verbose_log(`POST ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch: options.branch ?? "main",
      forceFullSync: options.forceSync ?? false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create snapshot: ${response.status} - ${errorText}`
    );
  }

  return response.json();
}

/**
 * Get the latest snapshot info
 */
async function getLatestSnapshot(
  session: AmaSession,
  options: SnapshotCommandOptions,
  logger: Logger
): Promise<LatestSnapshotResponse> {
  const branch = options.branch ?? "main";
  const url = `${getSnapshotApiUrl(session.projectId, "latest-snapshot")}?branch=${branch}`;

  logger.verbose_log(`GET ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get latest snapshot: ${response.status} - ${errorText}`
    );
  }

  return response.json();
}

/**
 * Download a snapshot from the given URL
 */
async function downloadSnapshotFile(
  downloadUrl: string,
  token: string,
  outputPath: string,
  logger: Logger
): Promise<string> {
  logger.info("Downloading snapshot...");
  logger.verbose_log(`GET ${downloadUrl}`);

  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to download snapshot: ${response.status} - ${errorText}`
    );
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write the ZIP file
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

/**
 * Extract a ZIP file to a directory
 */
function extractZip(zipPath: string, extractDir: string, logger: Logger): void {
  logger.info("Extracting snapshot...");

  // Ensure extract directory exists and is empty
  if (fs.existsSync(extractDir)) {
    // Remove existing contents
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  fs.mkdirSync(extractDir, { recursive: true });

  // Use tar on Unix or PowerShell on Windows
  const isWindows = process.platform === "win32";

  try {
    if (isWindows) {
      // Use PowerShell's Expand-Archive
      execSync(
        `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
        { stdio: "pipe" }
      );
    } else {
      // Use unzip on Unix
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" });
    }
  } catch (error) {
    throw new Error(
      `Failed to extract snapshot: ${error instanceof Error ? error.message : error}`
    );
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function snapshotCommand(): Command {
  const command = new Command("snapshot").description(
    "Manage storage snapshots for local fallback"
  );

  // Subcommand: create
  command
    .command("create")
    .description("Create a new storage snapshot (may take a few minutes)")
    .option("-t, --token <token>", "Authentication token")
    .option("-u, --url <url>", "Project base URL")
    .option("-p, --project-id <id>", "Project identifier")
    .option("-b, --branch <branch>", "Branch name", "main")
    .option("--force-sync", "Force full sync instead of incremental")
    .option("--verbose", "Enable verbose logging")
    .action(async (options: SnapshotCommandOptions) => {
      const logger = new Logger(Boolean(options.verbose));

      try {
        const session = resolveSession({
          token: options.token,
          projectId: options.projectId,
          url: options.url,
        });

        const result = await createSnapshot(session, options, logger);

        if (!result.success || !result.data) {
          throw new Error(result.error ?? "Failed to create snapshot");
        }

        const { data } = result;

        logger.success("Snapshot created successfully!");
        logger.info(`  Project: ${data.projectId}`);
        logger.info(`  Branch: ${data.branch}`);
        logger.info(`  Collections: ${data.stats.collectionsProcessed}`);
        logger.info(`  Entries: ${data.stats.entriesIncluded}`);
        logger.info(`  Blobs: ${data.stats.blobsIncluded}`);
        logger.info(`  Files: ${data.stats.filesIncluded}`);
        logger.info(`  Size: ${formatBytes(data.stats.totalSizeBytes)}`);
        logger.info(`  Duration: ${data.duration}ms`);
        logger.info(`  Download URL expires: ${data.expiresAt}`);
        logger.info("");
        logger.info("To download this snapshot, run:");
        logger.info("  ama snapshot download");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Snapshot creation failed: ${message}`, error);
        process.exit(1);
      }
    });

  // Subcommand: download
  command
    .command("download")
    .description("Download the latest snapshot to local storage")
    .option("-t, --token <token>", "Authentication token")
    .option("-u, --url <url>", "Project base URL")
    .option("-p, --project-id <id>", "Project identifier")
    .option("-b, --branch <branch>", "Branch name", "main")
    .option("-o, --output <path>", "Output directory", DEFAULT_OUTPUT_PATH)
    .option("--verbose", "Enable verbose logging")
    .action(async (options: SnapshotCommandOptions) => {
      const logger = new Logger(Boolean(options.verbose));

      try {
        const session = resolveSession({
          token: options.token,
          projectId: options.projectId,
          url: options.url,
        });

        // Get the latest snapshot info
        logger.info("Checking for latest snapshot...");
        const latestResult = await getLatestSnapshot(session, options, logger);

        let downloadUrl: string;

        if (latestResult.data && !latestResult.data.isExpired) {
          // Use existing snapshot
          logger.info(
            `Found existing snapshot from: ${latestResult.data.createdAt}`
          );
          downloadUrl = latestResult.data.downloadUrl;
        } else {
          // Need to create a new snapshot first
          if (latestResult.data?.isExpired) {
            logger.warn("Latest snapshot has expired, creating a new one...");
          } else {
            logger.info("No existing snapshot found, creating a new one...");
          }

          const createResult = await createSnapshot(session, options, logger);

          if (!createResult.success || !createResult.data) {
            throw new Error(createResult.error ?? "Failed to create snapshot");
          }

          downloadUrl = createResult.data.downloadUrl;
          logger.info(
            `Snapshot created (${formatBytes(createResult.data.stats.totalSizeBytes)})`
          );
        }

        // Download the snapshot
        const outputDir = path.resolve(
          process.cwd(),
          options.output ?? DEFAULT_OUTPUT_PATH
        );
        const zipPath = path.join(outputDir, "snapshot.zip");

        await downloadSnapshotFile(downloadUrl, session.token, zipPath, logger);
        logger.success(`Downloaded to: ${zipPath}`);

        // Extract the snapshot
        extractZip(zipPath, outputDir, logger);

        // Remove the ZIP file after extraction
        fs.unlinkSync(zipPath);

        logger.success(`Snapshot extracted to: ${outputDir}`);
        logger.info("");
        logger.info(
          "Your local storage is now ready. Configure your client with:"
        );
        logger.info('  clientMode: "local"');
        logger.info("  or");
        logger.info('  clientMode: "with-fallback"');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Snapshot download failed: ${message}`, error);
        process.exit(1);
      }
    });

  return command;
}
