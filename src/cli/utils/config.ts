import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

type Config = {
  token?: string;
  projectId?: string;
  include?: string[];
  description?: string;
  args?: Record<string, string>;
};

const CONFIG_PATH = path.join(process.cwd(), "./.ama/session.json");
const CONFIG_DIR = path.dirname(CONFIG_PATH);

function ensureConfigDir(): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (error) {
    throw new Error(
      `Failed to create config directory: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}

export function setConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(
      `Failed to save config: ${error instanceof Error ? error.message : error}`
    );
  }
}

export function getConfig(): Config {
  ensureConfigDir();
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch (error) {
    throw new Error(
      `Failed to read config: ${error instanceof Error ? error.message : error}`
    );
  }
}
