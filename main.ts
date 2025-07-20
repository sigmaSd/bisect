#!/usr/bin/env -S deno run -A

import { parseArgs } from "jsr:@std/cli@1.0.6/parse-args";
import { $ } from "jsr:@david/dax@0.43.2";

interface BisectOptions {
  testCommand: string;
  itemsFile: string;
  nextStateCommand?: string;
}

function parseArguments(): BisectOptions {
  const args = parseArgs(Deno.args, {
    string: ["test-with", "items-from-file", "next-state-with"],
    alias: {
      "test-with": "t",
      "items-from-file": "f",
      "next-state-with": "n",
    },
  });

  if (!args["test-with"] || !args["items-from-file"]) {
    console.error(
      "Usage: bisect --test-with <command> --items-from-file <file> [--next-state-with <command>]",
    );
    console.error(
      "Example: bisect --test-with 'gnome-terminal -- deno -A npm:@google/gemini-cli@0.1.12' --items-from-file commits.txt --next-state-with 'deno upgrade @i'",
    );
    Deno.exit(1);
  }

  return {
    testCommand: args["test-with"],
    itemsFile: args["items-from-file"],
    nextStateCommand: args["next-state-with"],
  };
}

async function loadItems(filename: string): Promise<string[]> {
  try {
    const text = await Deno.readTextFile(filename);
    return text.split("\n").filter((line) => line.trim().length > 0);
  } catch (error) {
    console.error(`Failed to read items file: ${error}`);
    Deno.exit(1);
  }
}

async function runCommand(command: string, item?: string): Promise<void> {
  const finalCommand = item ? command.replace("@i", item) : command;
  console.log(`\n🔧 Running: ${finalCommand}`);

  const result = await $.raw`${finalCommand}`.noThrow();
  const success = result.code === 0;

  if (!success) {
    console.log(
      `⚠️  Command exited with non-zero status (code: ${result.code})`,
    );
  }
}

function confirmResult(item: string): boolean {
  return confirm(`Did the test PASS for item "${item}"?`);
}

async function bisect(options: BisectOptions): Promise<void> {
  const items = await loadItems(options.itemsFile);

  if (items.length === 0) {
    console.error("No items found in file");
    Deno.exit(1);
  }

  console.log(`🎯 Starting bisect with ${items.length} items`);
  console.log(`📋 Items: ${items.join(", ")}`);

  let left = 0;
  let right = items.length - 1;
  let lastGoodIndex = -1;
  let firstBadIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const currentItem = items[mid];

    console.log(
      `\n🔍 Testing item ${mid + 1}/${items.length}: "${currentItem}"`,
    );
    console.log(
      `📍 Range: [${left + 1}, ${right + 1}], testing middle at ${mid + 1}`,
    );

    // Run next-state command if provided
    if (options.nextStateCommand) {
      await runCommand(options.nextStateCommand, currentItem);
    }

    // Run test command
    await runCommand(options.testCommand);

    // Get user confirmation
    const passed = confirmResult(currentItem);

    if (passed) {
      console.log(`✅ Item "${currentItem}" passed`);
      lastGoodIndex = mid;
      left = mid + 1;
    } else {
      console.log(`❌ Item "${currentItem}" failed`);
      firstBadIndex = mid;
      right = mid - 1;
    }
  }

  // Report results
  console.log("\n" + "=".repeat(50));
  console.log("🎉 Bisect complete!");

  if (lastGoodIndex >= 0) {
    console.log(
      `✅ Last good item: "${items[lastGoodIndex]}" (position ${
        lastGoodIndex + 1
      })`,
    );
  }

  if (firstBadIndex >= 0) {
    console.log(
      `❌ First bad item: "${items[firstBadIndex]}" (position ${
        firstBadIndex + 1
      })`,
    );
  }

  if (
    firstBadIndex >= 0 && lastGoodIndex >= 0 &&
    firstBadIndex === lastGoodIndex + 1
  ) {
    console.log(`🔍 The issue was introduced between:`);
    console.log(
      `   "${items[lastGoodIndex]}" (good) and "${items[firstBadIndex]}" (bad)`,
    );
  }
}

async function main(): Promise<void> {
  try {
    const options = parseArguments();
    await bisect(options);
  } catch (error) {
    console.error(`Error: ${error}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
