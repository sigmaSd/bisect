#!/usr/bin/env -S deno run -A

import { parseArgs } from "jsr:@std/cli@1.0.6/parse-args";
import { $ } from "jsr:@david/dax@0.43.2";

interface BisectOptions {
  testCommand: string;
  itemsFile: string;
  nextStateCommand?: string;
}

enum TestResult {
  PASS = "pass",
  FAIL = "fail",
  IGNORE = "ignore",
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
  const finalCommand = item ? command.replaceAll("@i", item) : command;
  console.log(`\n🔧 Running: ${finalCommand}`);

  const result = await $.raw`${finalCommand}`.noThrow();
  const success = result.code === 0;

  if (!success) {
    console.log(
      `⚠️  Command exited with non-zero status (code: ${result.code})`,
    );
  }
}

function confirmResult(item: string): TestResult {
  console.log(`\nTest result for item "${item}":`);
  console.log("  [p] Pass - the test succeeded");
  console.log("  [f] Fail - the test failed");
  console.log("  [i] Ignore - inconclusive/skip this item");

  while (true) {
    const input = prompt("Enter your choice (p/f/i):")?.toLowerCase().trim();

    switch (input) {
      case "p":
      case "pass":
        return TestResult.PASS;
      case "f":
      case "fail":
        return TestResult.FAIL;
      case "i":
      case "ignore":
        return TestResult.IGNORE;
      default:
        console.log(
          "Invalid input. Please enter 'p' for pass, 'f' for fail, or 'i' for ignore.",
        );
    }
  }
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
  const ignoredItems: number[] = [];

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    let currentIndex = mid;

    // Keep trying items starting from mid until we get a non-ignore result
    // or run out of items in the current range
    while (currentIndex <= right) {
      const currentItem = items[currentIndex];

      console.log(
        `\n🔍 Testing item ${
          currentIndex + 1
        }/${items.length}: "${currentItem}"`,
      );
      console.log(
        `📍 Range: [${left + 1}, ${right + 1}], testing at ${currentIndex + 1}`,
      );

      // Run next-state command if provided
      if (options.nextStateCommand) {
        await runCommand(options.nextStateCommand, currentItem);
      }

      // Run test command
      await runCommand(options.testCommand);

      // Get user confirmation
      const result = confirmResult(currentItem);

      if (result === TestResult.PASS) {
        console.log(`✅ Item "${currentItem}" passed`);
        lastGoodIndex = currentIndex;
        left = currentIndex + 1;
        break;
      } else if (result === TestResult.FAIL) {
        console.log(`❌ Item "${currentItem}" failed`);
        firstBadIndex = currentIndex;
        right = currentIndex - 1;
        break;
      } else { // TestResult.IGNORE
        console.log(`⏭️  Item "${currentItem}" ignored (inconclusive)`);
        ignoredItems.push(currentIndex);
        currentIndex++; // Try the next item
      }
    }

    // If we ignored all remaining items in this range, narrow the search to the left side
    if (currentIndex > right) {
      right = mid - 1;
    }
  }

  // Report results
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Bisect complete!");

  if (ignoredItems.length > 0) {
    console.log(
      `⏭️  Ignored ${ignoredItems.length} items: ${
        ignoredItems.map((i) => `"${items[i]}" (${i + 1})`).join(", ")
      }`,
    );
  }

  if (lastGoodIndex >= 0) {
    console.log(
      `✅ Last good item: "${items[lastGoodIndex]}" (position ${
        lastGoodIndex + 1
      })`,
    );
  } else {
    console.log("✅ No good items found");
  }

  if (firstBadIndex >= 0) {
    console.log(
      `❌ First bad item: "${items[firstBadIndex]}" (position ${
        firstBadIndex + 1
      })`,
    );
  } else {
    console.log("❌ No bad items found");
  }

  // Enhanced boundary detection that accounts for ignored items
  if (firstBadIndex >= 0 && lastGoodIndex >= 0) {
    const gap = firstBadIndex - lastGoodIndex;

    if (gap === 1) {
      console.log(`🔍 The issue was introduced between:`);
      console.log(
        `   "${items[lastGoodIndex]}" (good) and "${
          items[firstBadIndex]
        }" (bad)`,
      );
    } else if (gap > 1) {
      const itemsInBetween = [];
      for (let i = lastGoodIndex + 1; i < firstBadIndex; i++) {
        if (ignoredItems.includes(i)) {
          itemsInBetween.push(`"${items[i]}" (ignored)`);
        } else {
          itemsInBetween.push(`"${items[i]}" (untested)`);
        }
      }

      console.log(`🔍 The issue was introduced somewhere in this range:`);
      console.log(`   After: "${items[lastGoodIndex]}" (good)`);
      if (itemsInBetween.length > 0) {
        console.log(`   Between: ${itemsInBetween.join(", ")}`);
      }
      console.log(`   Before: "${items[firstBadIndex]}" (bad)`);

      if (itemsInBetween.some((item) => item.includes("(untested)"))) {
        console.log(
          `💡 Consider testing the untested items to narrow down further.`,
        );
      }
    }
  } else if (lastGoodIndex >= 0 && firstBadIndex === -1) {
    console.log(
      `🔍 All tested items after "${
        items[lastGoodIndex]
      }" were either ignored or not tested.`,
    );
  } else if (lastGoodIndex === -1 && firstBadIndex >= 0) {
    console.log(
      `🔍 All tested items before "${
        items[firstBadIndex]
      }" were either ignored or not tested.`,
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
