# Bisect Tool

A powerful binary search utility for finding the exact point where a regression was introduced in a sequence of items (commits, versions, configurations, etc.).

## Overview

This tool performs a binary search (bisect) through a list of items to help you quickly identify when something broke. It's particularly useful for:

- Finding the commit that introduced a bug
- Identifying when a test started failing
- Pinpointing configuration changes that caused issues
- Debugging version regressions

## Installation

```bash
deno install -A -g jsr:@sigma/bisect
```

Or run directly:

```bash
deno run -A jsr:@sigma/bisect --test-with "<test_command>" --items-from-file <file>
```

## Usage

```bash
bisect --test-with <command> --items-from-file <file> [--next-state-with <command>]
```

### Arguments

- `--test-with`, `-t`: Command to run for testing each item
- `--items-from-file`, `-f`: File containing the list of items to bisect through
- `--next-state-with`, `-n`: Optional command to run before each test (e.g., to change state)

### Placeholder Substitution

Use `@i` in your commands as a placeholder for the current item being tested.

## Examples

### Example 1: Git Commit Bisect

Find which commit broke your tests:

```bash
# Create a file with commit hashes
git log --oneline --reverse | cut -d' ' -f1 > commits.txt

# Run bisect
bisect \
  --test-with "npm test" \
  --items-from-file commits.txt \
  --next-state-with "git checkout @i"
```

### Example 2: Version Bisect

Find which version of a dependency introduced an issue:

```bash
# Create versions.txt with:
# 1.0.0
# 1.1.0
# 1.2.0
# 2.0.0

bisect \
  --test-with "deno test" \
  --items-from-file versions.txt \
  --next-state-with "deno add npm:some-package@i"
```

### Example 3: Configuration Bisect

Test different configuration values:

```bash
# Create config-values.txt with:
# 100
# 200
# 500
# 1000

bisect \
  --test-with "deno run --allow-net test-server.ts" \
  --items-from-file config-values.txt \
  --next-state-with "echo 'MAX_CONNECTIONS=@i' > .env"
```

### Example 4: Interactive Testing

Use an interactive command for manual testing:

```bash
bisect \
  --test-with "gnome-terminal -- deno run -A npm:@google/gemini-cli@0.1.12" \
  --items-from-file commits.txt \
  --next-state-with "deno upgrade @i"
```

## How It Works

1. **Load Items**: Reads the list of items from the specified file
2. **Binary Search**: Uses binary search algorithm to efficiently narrow down the problematic item
3. **State Management**: Optionally runs a command to change state before each test
4. **Test Execution**: Runs your test command for each item
5. **User Confirmation**: Asks you whether each test passed, failed, or should be ignored
6. **Result**: Reports the last good item and first bad item

## Input File Format

The items file should contain one item per line. Empty lines are ignored.

Example `commits.txt`:
```
abc123f
def456a
ghi789b
jkl012c
```

Example `versions.txt`:
```
1.0.0
1.1.0
1.2.0
2.0.0
```

## Interactive Workflow

During the bisect process, you'll see output like:

```
🎯 Starting bisect with 8 items
📋 Items: abc123f, def456a, ghi789b, jkl012c, mno345d, pqr678e, stu901f, vwx234g

🔍 Testing item 4/8: "jkl012c"
📍 Range: [1, 8], testing at 4

🔧 Running: git checkout jkl012c
🔧 Running: npm test

Test result for item "jkl012c":
  [p] Pass - the test succeeded
  [f] Fail - the test failed
  [i] Ignore - inconclusive/skip this item
Enter your choice (p/f/i):
```

### Test Result Options

- **Pass (`p`)**: The test succeeded for this item
- **Fail (`f`)**: The test failed for this item
- **Ignore (`i`)**: The test result is inconclusive or you want to skip this item

The ignore option is particularly useful when:
- A commit doesn't build
- Tests are flaky or unrelated failures occur
- The item is not relevant to the issue you're investigating
- You need to skip broken or incomplete states

When you ignore an item, the bisect algorithm will try the next item in sequence and continue the search intelligently.

## Output

When complete, you'll see a summary:

```
============================================================
🎉 Bisect complete!
⏭️  Ignored 2 items: "ghi789b" (3), "pqr678e" (6)
✅ Last good item: "def456a" (position 2)
❌ First bad item: "jkl012c" (position 4)
🔍 The issue was introduced somewhere in this range:
   After: "def456a" (good)
   Between: "ghi789b" (ignored)
   Before: "jkl012c" (bad)
💡 Consider testing the untested items to narrow down further.
```

The output clearly shows:
- Which items were ignored during the process
- The last known good item
- The first known bad item
- The range where the issue was introduced
- Suggestions for further investigation if needed

## Exit Codes

- `0`: Successful completion
- `1`: Error (missing arguments, file not found, etc.)

## Tips

- **Prepare your environment**: Make sure your test environment is clean and reproducible
- **Use automation**: Combine with shell scripts for complex setup/teardown
- **Test your commands**: Verify your test and state commands work manually first
- **Order matters**: Ensure your items file is in the correct chronological order
- **Use version control**: For git bisect, consider using `git log --reverse` to get chronological order
- **Use ignore wisely**: The ignore option helps handle problematic commits, but try to minimize its use for more accurate results
- **Document ignored items**: The tool tracks ignored items for you, but consider investigating them later if the issue remains unclear

## Requirements

- Deno 1.0 or later
- Unix-like shell (for command execution)

## License

MIT License
