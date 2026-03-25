# AtMyApp CLI

[![npm version](https://badge.fury.io/js/%40atmyapp%2Fcli.svg)](https://badge.fury.io/js/%40atmyapp%2Fcli)

The official CLI for working with AtMyApp projects.

It is now centered on the canonical schema flow:

- author definitions in `atmyapp.schema.ts`, `atmyapp.schema.mts`, `atmyapp.schema.js`, `atmyapp.schema.mjs`, or `atmyapp.schema.json`
- compile them with `@atmyapp/structure`
- generate the compatibility payload the platform currently accepts
- upload that payload with `atmyapp migrate`

## Installation

```bash
npm install -g @atmyapp/cli
```

## Quick Start

```bash
# 1. Authenticate this workspace
atmyapp use --token your-cli-token --url https://edge.atmyapp.com/projects/your-project-id

# 2. Generate a canonical schema + starter client
atmyapp init --template minimal

# 3. Compile and upload it
atmyapp migrate

# 4. Or preview the generated payload locally
atmyapp migrate --dry-run --verbose
```

## Canonical Schema

```ts
import {
  defineCollection,
  defineDocument,
  defineSchema,
  s,
} from "@atmyapp/structure";

export default defineSchema({
  definitions: {
    posts: defineCollection({
      fields: {
        title: s.string({ min: 3 }),
        slug: s.string({ format: "short" }),
        excerpt: s.string({ format: "long", default: "" }),
        cover: s.image({ optional: true }),
        publishedAt: s.date({ optional: true }),
      },
    }),
    settings: defineDocument({
      fields: {
        theme: s.string({ default: "light" }),
        supportEmail: s.string({ format: "email" }),
      },
    }),
  },
});
```

The CLI accepts either:

- a `default` export
- a named `schema` export

## Commands

### `atmyapp init`

Creates starter files for your project. By default it writes `atmyapp.schema.ts`.

```bash
atmyapp init
atmyapp init --template empty
atmyapp init --template minimal
atmyapp init --template blog
atmyapp init --path atmyapp.schema.json
atmyapp init --force
```

Templates:

- `empty` creates only a bare schema
- `minimal` creates a small document-based schema plus an exported client file
- `blog` creates a hero document, a blog-post collection, and an exported client file

For `minimal` and `blog`, `init` also asks whether you want to create a new project API key. If you confirm, it:

- fetches your project environments
- creates a new API key in the default environment
- prints `ATMYAPP_URL=...` and `ATMYAPP_API_KEY=...` lines to copy into your env file

If you want that API key flow, make sure you have already run `atmyapp use`, or pass `--url`, `--token`, and `--project-id` directly to `init`.

### `atmyapp use`

Stores your project URL and CLI token in `.ama/session.json`.

```bash
atmyapp use --token cli_... --url https://edge.atmyapp.com/projects/your-project-id
```

### `atmyapp migrate`

Finds your canonical schema file, validates it, generates `.ama/definitions.json`, and uploads it unless `--dry-run` is set.

```bash
atmyapp migrate [options]
```

Options:

- `--dry-run` Generate output without uploading it
- `--verbose` Print detailed timing and validation logs

If no canonical schema file is found, the command exits with a clear error.

The CLI looks for both:

- `atmyapp.schema.*`
- `ama.schema.*`

If both exist, `atmyapp.schema.*` wins.

For `minimal` and `blog`, the generated client file reads:

- `ATMYAPP_API_KEY`
- `ATMYAPP_URL`
- `ATMYAPP_API_URL`
- `ATMYAPP_BASE_URL`

### `atmyapp upload`

Uploads local files directly into project storage.

```bash
atmyapp upload "content/**/*" --base-path content --commit "Update content"
```

### `atmyapp generate`

Generates a placeholder file for a project storage path.

```bash
atmyapp generate --path content/settings.json
```

### `atmyapp snapshot`

Fetches a snapshot of project storage from the configured project.

## Project Config

Optional project config can live in:

- `atmyapp.config.ts`
- `atmyapp.config.js`

Supported fields:

```ts
export default {
  description: "Marketing site schema",
  args: {
    usesAtMyAppHeadConfig: true,
  },
  metadata: {
    source: "cli",
  },
};
```

`atmyapp migrate` merges this with the session config from `.ama/session.json`.

## Runtime API

The package also exports runtime helpers for custom tooling:

```ts
import {
  compileCanonicalSource,
  generateLegacyOutput,
  runCanonicalMigrate,
} from "@atmyapp/cli";
```

These APIs compile canonical schema modules with `@atmyapp/structure` and return the generated migration payload plus validation details.

## Notes

- The CLI no longer supports the old type-alias extraction flow based on exported `ATMYAPP` tuples.
- The generated output is still the compatibility payload expected by the current platform rollout.
- For schema authoring and inference helpers, use [`@atmyapp/structure`](https://www.npmjs.com/package/@atmyapp/structure).
