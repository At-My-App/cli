var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import path from "path";
import vm from "vm";
import ts from "typescript";
import { compileSchema, diffSchemas, planMigration, renderMigrationPrompts, validateSchemaDocument, } from "@atmyapp/structure";
import { Logger } from "../cli/logger";
function detectFormat(filename, format) {
    if (format) {
        return format;
    }
    if (filename.endsWith(".json")) {
        return "json";
    }
    if (filename.endsWith(".js") || filename.endsWith(".mjs")) {
        return "js";
    }
    return "ts";
}
function getSchemaFromModule(moduleExports) {
    return (moduleExports.default ||
        moduleExports.schema ||
        moduleExports.ATMYAPP_SCHEMA ||
        null);
}
function buildMetadata(output, config) {
    return __assign({ generatedAt: new Date().toISOString(), totalDefinitions: Object.keys(output.definitions).length, totalEvents: Object.keys(output.events).length, version: "1.0.0" }, (config.metadata && typeof config.metadata === "object"
        ? config.metadata
        : {}));
}
function createRuntimeLogger(verbose) {
    if (verbose === void 0) { verbose = false; }
    var entries = [];
    return {
        logger: new Logger(verbose, {
            silent: true,
            onLog: function (entry) {
                entries.push(entry);
            },
        }),
        entries: entries,
    };
}
function getFetchImplementation(fetchImplementation) {
    return __awaiter(this, void 0, void 0, function () {
        var nodeFetch, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (fetchImplementation) {
                        return [2 /*return*/, fetchImplementation];
                    }
                    if (typeof globalThis.fetch === "function") {
                        return [2 /*return*/, globalThis.fetch.bind(globalThis)];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, import("node-fetch")];
                case 2:
                    nodeFetch = _b.sent();
                    return [2 /*return*/, nodeFetch.default];
                case 3:
                    _a = _b.sent();
                    throw new Error("Neither native fetch nor node-fetch is available. For Node.js < 18, install node-fetch.");
                case 4: return [2 /*return*/];
            }
        });
    });
}
export function generateLegacyOutput(schema, config) {
    var _a;
    if (config === void 0) { config = {}; }
    var compiled = compileSchema(schema);
    var output = __assign({ description: compiled.legacyStructure.description ||
            (typeof config.description === "string"
                ? config.description
                : "AMA Definitions"), definitions: compiled.legacyStructure.definitions, events: ((_a = (compiled.legacyStructure.events ||
            schema.events)) !== null && _a !== void 0 ? _a : {}), args: (compiled.legacyStructure.args || {}) }, (compiled.legacyStructure.mdx
        ? { mdx: compiled.legacyStructure.mdx }
        : {}));
    output.metadata = buildMetadata(output, config);
    return output;
}
export function loadCanonicalModuleValue(_a) {
    var filename = _a.filename, code = _a.code, format = _a.format;
    var resolvedFormat = detectFormat(filename, format);
    if (resolvedFormat === "json") {
        return JSON.parse(code);
    }
    var transpiled = ts.transpileModule(code, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            esModuleInterop: true,
            resolveJsonModule: true,
        },
        fileName: filename,
    });
    var module = { exports: {} };
    var sandbox = {
        module: module,
        exports: module.exports,
        require: function (specifier) {
            if (specifier === "@atmyapp/structure") {
                return require("@atmyapp/structure");
            }
            if (specifier === "@atmyapp/core") {
                return require("@atmyapp/core");
            }
            throw new Error("Unsupported import \"".concat(specifier, "\" in ").concat(filename, ". Use the helper for local or non-AtMyApp imports."));
        },
        __filename: filename,
        __dirname: path.dirname(filename),
        console: console,
    };
    vm.runInNewContext(transpiled.outputText, sandbox, {
        filename: filename,
        timeout: 5000,
    });
    return getSchemaFromModule(module.exports);
}
export function compileCanonicalSource(input) {
    var startedAt = Date.now();
    var _a = createRuntimeLogger(false), logger = _a.logger, entries = _a.entries;
    var warnings = [];
    var errors = [];
    try {
        logger.info("Compiling canonical source ".concat(input.filename));
        var loadStartedAt = Date.now();
        var rawValue = loadCanonicalModuleValue(input);
        var loadMs = Date.now() - loadStartedAt;
        if (!rawValue || typeof rawValue !== "object") {
            var error = "Canonical schema file ".concat(input.filename, " must export a schema as default, ") +
                "'schema', or 'ATMYAPP_SCHEMA'";
            errors.push(error);
            return {
                validation: {
                    valid: false,
                    issues: [{ path: input.filename, message: error }],
                },
                logs: entries,
                warnings: warnings,
                errors: errors,
                timings: {
                    loadMs: loadMs,
                    validateMs: 0,
                    compileMs: 0,
                    totalMs: Date.now() - startedAt,
                },
            };
        }
        var validateStartedAt = Date.now();
        var validation = validateSchemaDocument(rawValue);
        var validateMs = Date.now() - validateStartedAt;
        if (!validation.valid) {
            validation.issues.forEach(function (issue) {
                warnings.push("".concat(issue.path, ": ").concat(issue.message));
            });
        }
        var compileStartedAt = Date.now();
        var schema = rawValue;
        var compiled = compileSchema(schema);
        var output = generateLegacyOutput(schema, {});
        var compileMs = Date.now() - compileStartedAt;
        return {
            schema: schema,
            compiled: compiled,
            output: output,
            validation: validation,
            logs: entries,
            warnings: warnings,
            errors: errors,
            timings: {
                loadMs: loadMs,
                validateMs: validateMs,
                compileMs: compileMs,
                totalMs: Date.now() - startedAt,
            },
        };
    }
    catch (error) {
        var message = error instanceof Error ? error.message : "Unknown compilation error";
        logger.error(message, error);
        errors.push(message);
        return {
            validation: {
                valid: false,
                issues: [{ path: input.filename, message: message }],
            },
            logs: entries,
            warnings: warnings,
            errors: errors,
            timings: {
                loadMs: 0,
                validateMs: 0,
                compileMs: 0,
                totalMs: Date.now() - startedAt,
            },
        };
    }
}
export function uploadStructure(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var fetchApi, response, body, error_1;
        var output = _b.output, url = _b.url, token = _b.token, fetchImplementation = _b.fetchImplementation;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, getFetchImplementation(fetchImplementation)];
                case 1:
                    fetchApi = _c.sent();
                    return [4 /*yield*/, fetchApi("".concat(url, "/storage/structure"), {
                            method: "POST",
                            headers: __assign({ "Content-Type": "application/json" }, (token ? { Authorization: "Bearer ".concat(token) } : {})),
                            body: JSON.stringify({ content: JSON.stringify(output) }),
                        })];
                case 2:
                    response = _c.sent();
                    return [4 /*yield*/, response.text()];
                case 3:
                    body = _c.sent();
                    if (!response.ok) {
                        return [2 /*return*/, {
                                success: false,
                                status: response.status,
                                body: body,
                                error: "HTTP error ".concat(response.status),
                            }];
                    }
                    return [2 /*return*/, {
                            success: true,
                            status: response.status,
                            body: body,
                        }];
                case 4:
                    error_1 = _c.sent();
                    return [2 /*return*/, {
                            success: false,
                            error: error_1 instanceof Error ? error_1.message : String(error_1),
                        }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
export function runCanonicalMigrate(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var startedAt, _c, logger, entries, warnings, errors, generateStartedAt, output, generateMs, uploadResult, uploadMs, message, uploadStartedAt, message;
        var _d;
        var schema = _b.schema, _e = _b.config, config = _e === void 0 ? {} : _e, _f = _b.dryRun, dryRun = _f === void 0 ? false : _f, _g = _b.upload, upload = _g === void 0 ? false : _g, url = _b.url, token = _b.token, fetchImplementation = _b.fetchImplementation, _h = _b.verbose, verbose = _h === void 0 ? false : _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    startedAt = Date.now();
                    _c = createRuntimeLogger(verbose), logger = _c.logger, entries = _c.entries;
                    warnings = [];
                    errors = [];
                    generateStartedAt = Date.now();
                    output = generateLegacyOutput(schema, config);
                    generateMs = Date.now() - generateStartedAt;
                    logger.success("Generated ".concat(Object.keys(output.definitions).length, " definitions from canonical schema."));
                    uploadMs = 0;
                    if (!(upload && !dryRun)) return [3 /*break*/, 4];
                    if (!!url) return [3 /*break*/, 1];
                    message = "Upload requested but no base URL was provided in runtime config.";
                    errors.push(message);
                    logger.error(message);
                    return [3 /*break*/, 3];
                case 1:
                    uploadStartedAt = Date.now();
                    return [4 /*yield*/, uploadStructure({
                            output: output,
                            url: url,
                            token: token,
                            fetchImplementation: fetchImplementation,
                        })];
                case 2:
                    uploadResult = _j.sent();
                    uploadMs = Date.now() - uploadStartedAt;
                    if (uploadResult.success) {
                        logger.success("Uploaded structure to ".concat(url, "/storage/structure"));
                    }
                    else {
                        message = (_d = uploadResult.error) !== null && _d !== void 0 ? _d : "Upload failed".concat(uploadResult.status ? " (".concat(uploadResult.status, ")") : "");
                        errors.push(message);
                        logger.error(message);
                    }
                    _j.label = 3;
                case 3: return [3 /*break*/, 5];
                case 4:
                    if (dryRun) {
                        logger.info("Dry run mode enabled. Skipping upload.");
                    }
                    _j.label = 5;
                case 5: return [2 /*return*/, {
                        output: output,
                        upload: uploadResult,
                        logs: entries,
                        warnings: warnings,
                        errors: errors,
                        timings: {
                            generateMs: generateMs,
                            uploadMs: uploadMs,
                            totalMs: Date.now() - startedAt,
                        },
                    }];
            }
        });
    });
}
export function analyzeMigration(currentInput, nextInput) {
    var diff = diffSchemas(currentInput, nextInput);
    var migrationPlan = planMigration(currentInput, nextInput);
    return {
        diff: diff,
        migrationPlan: __assign(__assign({}, migrationPlan), { prompts: renderMigrationPrompts(migrationPlan) }),
    };
}
