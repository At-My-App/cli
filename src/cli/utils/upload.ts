import { Logger } from "../logger";
import { OutputDefinition } from "../types/migrate";

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
  logger: Logger
): Promise<boolean> {
  if (!(config as any).url) {
    logger.error(
      "Base URL not provided in session. Please run 'use' command first."
    );
    return false;
  }

  try {
    const fetchApi = await getFetchImplementation();
    const url = `${(config as any).url}/storage/structure`;

    logger.info(`🔄 Posting definitions to server at ${url}`);

    const response = await fetchApi(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(config as any).token}`,
      },
      body: JSON.stringify({ content: JSON.stringify(output) }),
    });
    const responseText = await response.text();
    logger.verbose_log(`Server response: ${responseText}`);

    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${responseText}`
      );
    }

    logger.success("🚀 Successfully posted definitions to storage.");
    return true;
  } catch (postError) {
    logger.error("❌ Failed to post definitions:", postError);
    return false;
  }
}
