import chalk from "chalk";

type LogLevel = "info" | "success" | "warn" | "error" | "verbose";

type ConsoleMethod = "log" | "warn" | "error";

interface LevelConfig {
  label: string;
  style: (text: string) => string;
  method: ConsoleMethod;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
}

interface LoggerOptions {
  silent?: boolean;
  onLog?: (entry: LogEntry) => void;
}

const LEVEL_CONFIG: Record<LogLevel, LevelConfig> = {
  info: { label: "INFO", style: (text) => chalk.blueBright.bold(text), method: "log" },
  success: { label: "SUCCESS", style: (text) => chalk.greenBright.bold(text), method: "log" },
  warn: { label: "WARN", style: (text) => chalk.yellowBright.bold(text), method: "warn" },
  error: { label: "ERROR", style: (text) => chalk.redBright.bold(text), method: "error" },
  verbose: { label: "VERBOSE", style: (text) => chalk.gray.bold(text), method: "log" },
};

/**
 * Logger utility to handle verbose logging with consistent formatting.
 */
export class Logger {
  private readonly verbose: boolean;
  private readonly silent: boolean;
  private readonly onLog?: (entry: LogEntry) => void;

  constructor(verbose: boolean, options: LoggerOptions = {}) {
    this.verbose = verbose;
    this.silent = options.silent ?? false;
    this.onLog = options.onLog;
  }

  info(message: string): void {
    this.write("info", message);
  }

  success(message: string): void {
    this.write("success", message);
  }

  warn(message: string): void {
    this.write("warn", message);
  }

  error(message: string, error?: unknown): void {
    const detail = this.formatErrorDetail(error);
    const formatted = detail ? `${message}\n${chalk.gray(detail)}` : message;
    this.write("error", formatted);
  }

  verbose_log(message: string): void {
    if (!this.verbose) {
      return;
    }

    this.write("verbose", message);
  }

  private write(level: LogLevel, message: string): void {
    this.onLog?.({ level, message });

    if (this.silent) {
      return;
    }

    const { label, style, method } = LEVEL_CONFIG[level];
    const rawLabel = `[${label}]`;
    const styledLabel = style(rawLabel);
    const lines = message.split(/\r?\n/);
    const continuationPrefix = " ".repeat(rawLabel.length + 1);

    for (const [index, line] of lines.entries()) {
      const output = index === 0 ? `${styledLabel} ${line}` : `${continuationPrefix}${line}`;

      if (method === "warn") {
        console.warn(output);
      } else if (method === "error") {
        console.error(output);
      } else {
        console.log(output);
      }
    }
  }

  private formatErrorDetail(error: unknown): string | undefined {
    if (!error) {
      return undefined;
    }

    if (error instanceof Error) {
      return error.stack ?? error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }
}
