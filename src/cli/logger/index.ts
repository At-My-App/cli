import chalk from "chalk";

/**
 * Logger utility to handle verbose logging
 */
export class Logger {
  private verbose: boolean;

  constructor(verbose: boolean) {
    this.verbose = verbose;
  }

  info(message: string): void {
    console.log(chalk.blue(message));
  }

  success(message: string): void {
    console.log(chalk.green(message));
  }

  error(message: string, error?: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(message), error ? chalk.red(errorMessage) : "");
  }

  verbose_log(message: string): void {
    if (this.verbose) {
      console.log(chalk.cyan(`[VERBOSE] ${message}`));
    }
  }

  warn(message: string): void {
    console.warn(chalk.yellow(message));
  }
}
