import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  findProjectConfigPath,
  getMigrateConfig,
  loadProjectConfig,
} from "../../src/cli/utils/config";

describe("project configuration loading", () => {
  const tempDirs: string[] = [];

  const createTempProject = (): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "atmyapp-config-"));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("prefers atmyapp.config.ts when both ts and js files exist", () => {
    const projectRoot = createTempProject();
    writeFileSync(path.join(projectRoot, "atmyapp.config.ts"), "export default {};\n");
    writeFileSync(path.join(projectRoot, "atmyapp.config.js"), "module.exports = {};\n");

    const foundPath = findProjectConfigPath(projectRoot);

    expect(foundPath).toBe(path.join(projectRoot, "atmyapp.config.ts"));
  });

  it("loads a .js project config", () => {
    const projectRoot = createTempProject();
    writeFileSync(
      path.join(projectRoot, "atmyapp.config.js"),
      "module.exports = { include: ['src/**/*.ts'], args: { usesAtMyAppHeadConfig: true } };\n"
    );

    const config = loadProjectConfig(projectRoot);

    expect(config.include).toEqual(["src/**/*.ts"]);
    expect(config.args).toEqual({ usesAtMyAppHeadConfig: true });
  });

  it("loads a .ts project config", () => {
    const projectRoot = createTempProject();
    writeFileSync(
      path.join(projectRoot, "atmyapp.config.ts"),
      [
        "const config = {",
        "  description: 'From TS',",
        "  args: { usesAtMyAppHeadConfig: true }",
        "};",
        "export default config;",
      ].join("\n")
    );

    const config = loadProjectConfig(projectRoot);

    expect(config.description).toBe("From TS");
    expect(config.args).toEqual({ usesAtMyAppHeadConfig: true });
  });

  it("merges migration fields from project config with session values", () => {
    const projectRoot = createTempProject();
    const amaDir = path.join(projectRoot, ".ama");

    mkdirSync(amaDir, { recursive: true });

    writeFileSync(
      path.join(amaDir, "session.json"),
      JSON.stringify(
        {
          token: "session-token",
          projectId: "project-123",
          url: "https://edge.atmyapp.com/projects/project-123",
          include: ["legacy/**/*.ts"],
          description: "Legacy description",
          args: {
            legacyOnly: true,
            conflictKey: "session",
          },
          metadata: {
            source: "session",
            keepMe: true,
          },
        },
        null,
        2
      )
    );

    writeFileSync(
      path.join(projectRoot, "atmyapp.config.js"),
      [
        "module.exports = {",
        "  include: ['src/**/*.ts'],",
        "  description: 'Project description',",
        "  args: { usesAtMyAppHeadConfig: true, conflictKey: 'project' },",
        "  metadata: { source: 'project', extra: true }",
        "};",
      ].join("\n")
    );

    const merged = getMigrateConfig(projectRoot);

    expect(merged.token).toBe("session-token");
    expect(merged.projectId).toBe("project-123");
    expect(merged.url).toBe("https://edge.atmyapp.com/projects/project-123");

    expect(merged.include).toEqual(["src/**/*.ts"]);
    expect(merged.description).toBe("Project description");

    expect(merged.args).toEqual({
      legacyOnly: true,
      usesAtMyAppHeadConfig: true,
      conflictKey: "project",
    });

    expect(merged.metadata).toEqual({
      source: "project",
      keepMe: true,
      extra: true,
    });
  });

  it("fails fast on invalid args shape", () => {
    const projectRoot = createTempProject();
    writeFileSync(
      path.join(projectRoot, "atmyapp.config.js"),
      "module.exports = { args: 'invalid' };\n"
    );

    expect(() => loadProjectConfig(projectRoot)).toThrow(
      /Invalid "args"/
    );
  });
});
