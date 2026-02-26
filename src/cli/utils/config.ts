import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import ts from "typescript";

export interface AmaConfig {
  token?: string;
  projectId?: string;
  url?: string;
  include?: string[];
  description?: string;
  args?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type AmaProjectConfig = Pick<
  AmaConfig,
  "include" | "description" | "args" | "metadata"
>;

const PROJECT_CONFIG_CANDIDATES = [
  "atmyapp.config.ts",
  "atmyapp.config.js",
] as const;

function getSessionPaths(cwd: string = process.cwd()): {
  configPath: string;
  configDir: string;
} {
  const configPath = path.join(cwd, ".ama", "session.json");
  return {
    configPath,
    configDir: path.dirname(configPath),
  };
}

function ensureConfigDir(cwd: string = process.cwd()): void {
  const { configDir } = getSessionPaths(cwd);
  try {
    mkdirSync(configDir, { recursive: true });
  } catch (error) {
    throw new Error(
      `Failed to create config directory: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

export function setConfig(
  config: AmaConfig,
  cwd: string = process.cwd(),
): void {
  const { configPath } = getSessionPaths(cwd);
  ensureConfigDir(cwd);
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(
      `Failed to save config: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export function getConfig(cwd: string = process.cwd()): AmaConfig {
  const { configPath } = getSessionPaths(cwd);
  ensureConfigDir(cwd);
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error) {
    throw new Error(
      `Failed to read config: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export function findProjectConfigPath(
  cwd: string = process.cwd(),
): string | null {
  for (const candidate of PROJECT_CONFIG_CANDIDATES) {
    const candidatePath = path.join(cwd, candidate);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

export function loadProjectConfig(
  cwd: string = process.cwd(),
): AmaProjectConfig {
  const configPath = findProjectConfigPath(cwd);
  if (!configPath) {
    return {};
  }

  try {
    const loadedConfig = loadConfigModule(configPath);
    const extractedConfig = normalizeDefaultExport(loadedConfig);

    if (!isPlainObject(extractedConfig)) {
      throw new Error("Default export must be an object.");
    }

    return validateProjectConfig(extractedConfig, configPath);
  } catch (error) {
    throw new Error(
      `Failed to load project config at ${configPath}: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

export function getMigrateConfig(cwd: string = process.cwd()): AmaConfig {
  const sessionConfig = getConfig(cwd);
  const projectConfig = loadProjectConfig(cwd);

  return {
    ...sessionConfig,
    include: projectConfig.include ?? sessionConfig.include,
    description: projectConfig.description ?? sessionConfig.description,
    args: mergeObjects(sessionConfig.args, projectConfig.args),
    metadata: mergeObjects(sessionConfig.metadata, projectConfig.metadata),
  };
}

function normalizeDefaultExport(moduleExport: unknown): unknown {
  if (
    isPlainObject(moduleExport) &&
    "default" in moduleExport &&
    moduleExport.default !== undefined
  ) {
    return moduleExport.default;
  }

  return moduleExport;
}

function validateProjectConfig(
  value: Record<string, unknown>,
  configPath: string,
): AmaProjectConfig {
  const config: AmaProjectConfig = {};

  if (value.include !== undefined) {
    if (
      !Array.isArray(value.include) ||
      value.include.some((item) => typeof item !== "string")
    ) {
      throw new Error(
        `Invalid \"include\" in ${configPath}. Expected string[].`,
      );
    }

    config.include = value.include;
  }

  if (value.description !== undefined) {
    if (typeof value.description !== "string") {
      throw new Error(
        `Invalid \"description\" in ${configPath}. Expected string.`,
      );
    }

    config.description = value.description;
  }

  if (value.args !== undefined) {
    if (!isPlainObject(value.args)) {
      throw new Error(`Invalid \"args\" in ${configPath}. Expected object.`);
    }

    if (
      "usesAtMyAppHeadConfig" in value.args &&
      value.args.usesAtMyAppHeadConfig !== undefined &&
      typeof value.args.usesAtMyAppHeadConfig !== "boolean"
    ) {
      throw new Error(
        `Invalid \"args.usesAtMyAppHeadConfig\" in ${configPath}. Expected boolean.`,
      );
    }

    config.args = value.args;
  }

  if (value.metadata !== undefined) {
    if (!isPlainObject(value.metadata)) {
      throw new Error(
        `Invalid \"metadata\" in ${configPath}. Expected object.`,
      );
    }

    config.metadata = value.metadata;
  }

  return config;
}

function loadConfigModule(configPath: string): unknown {
  try {
    return loadWithJiti(configPath);
  } catch (error) {
    if (isJitiResolutionError(error)) {
      return loadWithoutJiti(configPath);
    }

    throw error;
  }
}

function loadWithJiti(configPath: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jitiModule = require("jiti") as
    | ((
        filename: string,
        options?: Record<string, unknown>,
      ) => (id: string) => unknown)
    | {
        createJiti?: (
          filename: string,
          options?: Record<string, unknown>,
        ) => (id: string) => unknown;
      };

  const createJiti =
    typeof jitiModule === "function" ? jitiModule : jitiModule.createJiti;

  if (typeof createJiti !== "function") {
    throw new Error("Could not initialize jiti loader.");
  }

  const jiti = createJiti(__filename, {
    cache: false,
    interopDefault: false,
  });

  return jiti(configPath);
}

function loadWithoutJiti(configPath: string): unknown {
  if (configPath.endsWith(".js")) {
    return loadJsModule(configPath);
  }

  if (configPath.endsWith(".ts")) {
    return loadTsModule(configPath);
  }

  throw new Error(`Unsupported config extension for ${configPath}.`);
}

function loadJsModule(configPath: string): unknown {
  const localRequire = createRequire(configPath);
  const resolvedPath = localRequire.resolve(configPath);
  delete require.cache[resolvedPath];
  return localRequire(configPath);
}

function loadTsModule(configPath: string): unknown {
  const source = readFileSync(configPath, "utf-8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: configPath,
  });

  const module = { exports: {} as unknown };
  const localRequire = createRequire(configPath);
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    transpiled.outputText,
  );

  execute(
    module.exports,
    localRequire,
    module,
    configPath,
    path.dirname(configPath),
  );

  return module.exports;
}

function isJitiResolutionError(error: unknown): boolean {
  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message: string }).message
      : String(error);
  const code = (error as { code?: unknown })?.code;

  return (
    (code === "MODULE_NOT_FOUND" && message.includes("jiti")) ||
    message.includes("Cannot find module 'jiti'") ||
    message.includes('Cannot find module "jiti"')
  );
}

function mergeObjects(
  baseValue?: Record<string, unknown>,
  overrideValue?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const merged = {
    ...(baseValue || {}),
    ...(overrideValue || {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
