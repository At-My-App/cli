export interface Content {
  path: string;
  structure: any;
  type?: string;
}

export interface EventConfig {
  columns: string[];
  description?: string;
}

export interface OutputDefinition {
  description: string;
  definitions: Record<string, { structure: any; type?: string; description?: string }>;
  events: Record<string, EventConfig>;
  args: Record<string, unknown>;
  metadata?: any;
  mdx?: Record<
    string,
    { components: Record<string, { props?: Record<string, string> }> }
  >;
}

export interface MigrateOptions {
  dryRun: boolean;
  verbose: boolean;
}

export interface TypeTransformer {
  canTransform: (obj: any) => boolean;
  transform: (obj: any) => any;
}

export interface ProcessingResult {
  contents: Content[];
  errors: string[];
  successCount: number;
  failureCount: number;
}
