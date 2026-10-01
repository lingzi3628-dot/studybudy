#!/usr/bin/env python3
"""
Phase F6 — Migrate whole-store Zustand subscriptions to selectors.

Converts:  const { foo, bar } = useApp();
To:        const foo = useApp((s) => s.foo);
           const bar = useApp((s) => s.bar);

This reduces unnecessary re-renders: components only re-render when the
specific fields they read change, not on ANY store update.

Safety:
  - Only touches files in the safe list (no tutor/chatbot/graph files)
  - TypeScript will catch any missed usages
  - The behavior is identical — selectors return the same values
"""
import re
import sys
from pathlib import Path

# Files to migrate (top whole-store subscribers, excluding tutor files)
SAFE_FILES = [
    "src/components/studybuddy/screens/MLPlaygroundScreen.tsx",
    "src/components/studybuddy/screens/StudyRoom.tsx",
    "src/components/studybuddy/screens/NotebookScreen.tsx",
    "src/components/studybuddy/screens/LearningPath.tsx",
    "src/components/studybuddy/screens/ConceptMapScreen.tsx",
    "src/components/studybuddy/screens/PostOnboardingPopup.tsx",
    "src/components/studybuddy/screens/PathDashboard.tsx",
    "src/components/studybuddy/screens/Home.tsx",
    "src/components/studybuddy/screens/DataLabScreen.tsx",
]

# Pattern: const { field1, field2, field3 } = useApp();
# Also handles "useApp() as any" and multi-line versions
PATTERN = re.compile(
    r'const\s+\{([^}]+)\}\s*=\s*useApp\(\s*\)\s*(?:as\s+any\s*)?;',
    re.DOTALL
)

def migrate_file(filepath: str) -> tuple[int, str | None]:
    """Migrate one file. Returns (fields_migrated, error_message)."""
    path = Path(filepath)
    if not path.exists():
        return 0, f"File not found: {filepath}"

    content = path.read_text(encoding="utf-8")

    # Find all matches
    matches = list(PATTERN.finditer(content))
    if not matches:
        return 0, None  # No matches — already migrated or no useApp destructure

    total_fields = 0
    new_content = content

    # Process matches in reverse order so offsets don't shift
    for match in reversed(matches):
        fields_str = match.group(1)
        # Parse field names — handle "field1, field2" and "field1 as alias"
        fields = []
        for raw in fields_str.split(","):
            raw = raw.strip()
            if not raw:
                continue
            # Handle "field as alias" — keep the alias as the variable name
            if " as " in raw:
                parts = raw.split(" as ")
                actual = parts[0].strip()
                alias = parts[1].strip()
                fields.append((actual, alias))
            else:
                fields.append((raw, raw))

        if not fields:
            continue

        # Build the replacement: individual selector calls
        lines = []
        for actual, alias in fields:
            if actual == alias:
                lines.append(f"const {alias} = useApp((s) => s.{actual});")
            else:
                lines.append(f"const {alias} = useApp((s) => s.{actual});")
        replacement = "\n".join(lines)

        # Replace in the content (we're going backwards so offsets are valid)
        new_content = new_content[:match.start()] + replacement + new_content[match.end():]
        total_fields += len(fields)

    path.write_text(new_content, encoding="utf-8")
    return total_fields, None

# Main
print("=" * 60)
print("Phase F6 — Zustand selector migration")
print("=" * 60)

total_migrated = 0
errors = 0
for filepath in SAFE_FILES:
    count, err = migrate_file(filepath)
    if err:
        print(f"  ❌ {filepath}: {err}")
        errors += 1
    elif count > 0:
        print(f"  ✓ {filepath}: {count} fields → selectors")
        total_migrated += count
    else:
        print(f"  ⏭️  {filepath}: no match (already migrated or no useApp)")

print()
print(f"Total: {total_migrated} fields migrated across {len(SAFE_FILES)} files")
if errors:
    print(f"Errors: {errors}")
    sys.exit(1)
print("Done — verify with: npx tsc --noEmit")
