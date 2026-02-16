#!/usr/bin/env node
import { Command } from "commander";
import { migrateCommand } from "./commands/migrate";
import { useCommand } from "./commands/use";
import { uploadCommand } from "./commands/upload";
import { generateCommand } from "./commands/generate";
import { snapshotCommand } from "./commands/snapshot";

const program = new Command()
  .name("ama")
  .description("AtMyApp CLI Tool")
  .version("1.0.0");

program.addCommand(useCommand());
program.addCommand(migrateCommand());
program.addCommand(uploadCommand());
program.addCommand(generateCommand());
program.addCommand(snapshotCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
