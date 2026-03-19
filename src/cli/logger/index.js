import chalk from "chalk";
var LEVEL_CONFIG = {
    info: { label: "INFO", style: function (text) { return chalk.blueBright.bold(text); }, method: "log" },
    success: { label: "SUCCESS", style: function (text) { return chalk.greenBright.bold(text); }, method: "log" },
    warn: { label: "WARN", style: function (text) { return chalk.yellowBright.bold(text); }, method: "warn" },
    error: { label: "ERROR", style: function (text) { return chalk.redBright.bold(text); }, method: "error" },
    verbose: { label: "VERBOSE", style: function (text) { return chalk.gray.bold(text); }, method: "log" },
};
/**
 * Logger utility to handle verbose logging with consistent formatting.
 */
var Logger = /** @class */ (function () {
    function Logger(verbose, options) {
        if (options === void 0) { options = {}; }
        var _a;
        this.verbose = verbose;
        this.silent = (_a = options.silent) !== null && _a !== void 0 ? _a : false;
        this.onLog = options.onLog;
    }
    Logger.prototype.info = function (message) {
        this.write("info", message);
    };
    Logger.prototype.success = function (message) {
        this.write("success", message);
    };
    Logger.prototype.warn = function (message) {
        this.write("warn", message);
    };
    Logger.prototype.error = function (message, error) {
        var detail = this.formatErrorDetail(error);
        var formatted = detail ? "".concat(message, "\n").concat(chalk.gray(detail)) : message;
        this.write("error", formatted);
    };
    Logger.prototype.verbose_log = function (message) {
        if (!this.verbose) {
            return;
        }
        this.write("verbose", message);
    };
    Logger.prototype.write = function (level, message) {
        var _a;
        (_a = this.onLog) === null || _a === void 0 ? void 0 : _a.call(this, { level: level, message: message });
        if (this.silent) {
            return;
        }
        var _b = LEVEL_CONFIG[level], label = _b.label, style = _b.style, method = _b.method;
        var rawLabel = "[".concat(label, "]");
        var styledLabel = style(rawLabel);
        var lines = message.split(/\r?\n/);
        var continuationPrefix = " ".repeat(rawLabel.length + 1);
        for (var _i = 0, _c = lines.entries(); _i < _c.length; _i++) {
            var _d = _c[_i], index = _d[0], line = _d[1];
            var output = index === 0 ? "".concat(styledLabel, " ").concat(line) : "".concat(continuationPrefix).concat(line);
            if (method === "warn") {
                console.warn(output);
            }
            else if (method === "error") {
                console.error(output);
            }
            else {
                console.log(output);
            }
        }
    };
    Logger.prototype.formatErrorDetail = function (error) {
        var _a;
        if (!error) {
            return undefined;
        }
        if (error instanceof Error) {
            return (_a = error.stack) !== null && _a !== void 0 ? _a : error.message;
        }
        if (typeof error === "string") {
            return error;
        }
        try {
            return JSON.stringify(error, null, 2);
        }
        catch (_b) {
            return String(error);
        }
    };
    return Logger;
}());
export { Logger };
