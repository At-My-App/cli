import { Logger } from "../logger";
import { OutputDefinition } from "../types/migrate";
import {
  uploadStructure,
  type UploadStructureClearRequest,
  type UploadStructureResult,
} from "../../runtime";

async function getFetchImplementation(): Promise<typeof fetch> {
  // Use native fetch if available (Node.js 18+)
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }

  // Fallback to node-fetch for older Node.js versions
  try {
    // @ts-ignore
    const nodeFetch = await import("node-fetch");
    return nodeFetch.default as unknown as typeof fetch;
  } catch (error) {
    throw new Error(
      "Neither native fetch nor node-fetch is available. For Node.js < 18, install node-fetch package."
    );
  }
}

// Uploads the generated definitions to the AtMyApp platform
export async function uploadDefinitions(
  output: OutputDefinition,
  config: any,
  logger: Logger,
  clear?: UploadStructureClearRequest,
): Promise<UploadStructureResult> {
  if (!(config as any).url) {
    const error =
      "Base URL not provided in session. Please run 'use' command first.";
    logger.error(error);
    return {
      success: false,
      error,
    };
  }

  try {
    const fetchApi = await getFetchImplementation();
    const url = (config as any).url as string;

    logger.info(`🔄 Posting definitions to server at ${url}/storage/structure`);

    const response = await uploadStructure({
      output,
      url,
      token: (config as any).token,
      clear,
      fetchImplementation: fetchApi,
    });
    logger.verbose_log(`Server response: ${response.body ?? ""}`);

    if (!response.success) {
      if (!response.conflict) {
        logger.error(
          `❌ Failed to post definitions: ${
            response.error ??
            `HTTP error! status: ${response.status}, message: ${response.body}`
          }`
        );
      }

      return response;
    }

    logger.success("🚀 Successfully posted definitions to storage.");
    return response;
  } catch (postError) {
    const error =
      postError instanceof Error ? postError.message : String(postError);
    logger.error("❌ Failed to post definitions:", postError);
    return {
      success: false,
      error,
    };
  }
}
