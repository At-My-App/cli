// Test setup file for Jest
import { definitionPipeline } from "../src/cli/utils/definition-processor";

// Clean up the pipeline before each test
beforeEach(() => {
  definitionPipeline.clear();
});

// Set longer timeout for integration tests
jest.setTimeout(30000);
