#!/usr/bin/env python3
"""
Phase 91 — Delete the moved-out section from tutor-chat-engine.ts.

Removes lines 248–669 inclusive (1-indexed) of src/lib/tutor-chat-engine.ts,
which contain:
  - The "3. System prompt" section header
  - The STUDY_PROMPT_GRAPH_RULES constant
  - The buildTutorSystemPrompt function

These have been moved verbatim to src/lib/tutor/context-builder.ts.
Replaces them with a one-line pointer comment so future readers know where
the code went.
"""
from pathlib import Path

PATH = Path("/home/z/my-project/src/lib/tutor-chat-engine.ts")

# Read full file
text = PATH.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)

# Sanity-check: line 248 (index 247) should start the section header
assert lines[247].startswith("// ---------------------------------------------------------------"), \
    f"Expected section header at line 248, got: {lines[247]!r}"
# Line 669 (index 668) should be the closing brace of the function
assert lines[668].rstrip() == "}", \
    f"Expected closing brace at line 669, got: {lines[668]!r}"

# Replace lines 248..669 with a brief pointer comment.
# Keep the blank line 247 (index 246) and the blank line 670 (index 669) intact.
replacement = (
    "// ---------------------------------------------------------------\n"
    "// 3. System prompt  → moved to src/lib/tutor/context-builder.ts (Phase 91)\n"
    "// ---------------------------------------------------------------\n"
    "\n"
)

# Slice: keep [0..247) + replacement + keep [669..end)
new_lines = lines[:247] + [replacement] + lines[669:]
PATH.write_text("".join(new_lines), encoding="utf-8")

# Report
new_total = len(new_lines)
print(f"OK: removed lines 248-669 ({669 - 248 + 1} lines). File now has {new_total} lines (was {len(lines)}).")
