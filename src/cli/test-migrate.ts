#!/usr/bin/env node

import { migrateCommand } from "./commands/migrate";

// Create and execute the migrate command
const command = migrateCommand();
command.parse(process.argv);

// Sample usage:
// npm run build
// node dist/cli/test-migrate.js
