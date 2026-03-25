export interface VerifyCliAuthResponseBody {
  success: boolean;
  data: {
    valid: boolean;
    projectId: string;
    keyName: string;
  } | null;
  error: string;
}

export interface VerifiedCliAuth {
  projectId: string;
  keyName: string;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

async function safeReadText(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export function buildCliAuthVerifyUrl(url: string): string {
  const parsedUrl = new URL(stripTrailingSlashes(url));
  parsedUrl.search = "";
  parsedUrl.hash = "";
  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const projectSegmentIndex = pathSegments.findIndex(
    (segment) => segment === "projects",
  );

  if (projectSegmentIndex !== -1 && pathSegments[projectSegmentIndex + 1]) {
    const preservedSegments = pathSegments.slice(0, projectSegmentIndex);
    parsedUrl.pathname =
      preservedSegments.length > 0 ? `/${preservedSegments.join("/")}` : "/";
  }

  const normalizedPathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const verifyPath =
    normalizedPathSegments[normalizedPathSegments.length - 1] === "v0"
      ? "cli-keys/auth/verify"
      : "v0/cli-keys/auth/verify";

  return new URL(
    verifyPath,
    `${stripTrailingSlashes(parsedUrl.toString())}/`,
  ).toString();
}

export async function verifyCliAuthentication(options: {
  url: string;
  token: string;
  fetchImplementation?: typeof fetch;
}): Promise<VerifiedCliAuth> {
  const fetchApi = options.fetchImplementation ?? globalThis.fetch;
  if (typeof fetchApi !== "function") {
    throw new Error("Fetch is not available in this runtime.");
  }

  const verifyUrl = buildCliAuthVerifyUrl(options.url);
  const response = await fetchApi(verifyUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${options.token}`,
    },
  });

  let responseBody: VerifyCliAuthResponseBody | null = null;

  try {
    responseBody = (await response.json()) as VerifyCliAuthResponseBody;
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const errorMessage =
      responseBody?.error ||
      (await safeReadText(response)) ||
      `CLI authentication failed with status ${response.status}.`;

    throw new Error(errorMessage);
  }

  if (!responseBody?.success || !responseBody.data?.valid) {
    throw new Error(responseBody?.error || "CLI authentication failed.");
  }

  return {
    projectId: responseBody.data.projectId,
    keyName: responseBody.data.keyName,
  };
}
