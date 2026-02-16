import {
  scanFiles,
  createProject,
  processFiles,
} from "../../src/cli/utils/schema-processor";
import { generateOutput } from "../../src/cli/utils/content-processor";
import { Logger } from "../../src/cli/logger";

const mockLogger = new Logger(false);

describe("MDX fields", () => {
  it("embeds mdx configs and converts mdx fields", async () => {
    const patterns = ["tests/definitions/mdxDefinitions.ts"];
    const files = await scanFiles(patterns, mockLogger);
    const project = createProject(files, "tsconfig.json", mockLogger);
    const processingResult = processFiles(
      project.getSourceFiles(),
      "tsconfig.json",
      false,
      mockLogger
    );

    const output = generateOutput(processingResult.contents, {}, mockLogger);

    expect(output.mdx).toBeDefined();
    expect(output.mdx?.blogComponents).toBeDefined();
    expect(output.mdx?.blogComponents.components).toHaveProperty("Callout");
    expect(output.mdx?.blogComponents.components.Callout.props).toEqual({
      title: "string",
      count: "number",
      isActive: "boolean",
      items: "string[]",
      metadata: "object",
    });

    const collection = output.definitions["blog"];
    expect(collection.type).toBe("collection");
    const props = collection.structure.properties;
    expect(props.content.format).toBe("mdx");
    expect(props.content.mdxConfig).toBe("blogComponents");
    expect(props.content.__amatype).toBe("AmaMdxDef");
    expect(props.sections.items.format).toBe("mdx");
    expect(props.sections.items.mdxConfig).toBe("blogComponents");
  });
});
