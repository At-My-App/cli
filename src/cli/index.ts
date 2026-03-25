#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { migrateCommand } from "./commands/migrate";
import { useCommand } from "./commands/use";
import { uploadCommand } from "./commands/upload";
import { generateCommand } from "./commands/generate";
import { snapshotCommand } from "./commands/snapshot";

const program = new Command()
  .name("atmyapp")
  .description("AtMyApp CLI Tool")
  .version("0.1.0");

program.addCommand(initCommand());
program.addCommand(useCommand());
program.addCommand(migrateCommand());
program.addCommand(uploadCommand());
program.addCommand(generateCommand());
program.addCommand(snapshotCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
