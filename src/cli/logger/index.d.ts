type LogLevel = "info" | "success" | "warn" | "error" | "verbose";
export interface LogEntry {
    level: LogLevel;
    message: string;
}
interface LoggerOptions {
    silent?: boolean;
    onLog?: (entry: LogEntry) => void;
}
/**
 * Logger utility to handle verbose logging with consistent formatting.
 */
export declare class Logger {
    private readonly verbose;
    private readonly silent;
    private readonly onLog?;
    constructor(verbose: boolean, options?: LoggerOptions);
    info(message: string): void;
    success(message: string): void;
    warn(message: string): void;
    error(message: string, error?: unknown): void;
    verbose_log(message: string): void;
    private write;
    private formatErrorDetail;
}
export {};
