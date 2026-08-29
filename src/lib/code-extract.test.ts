/**
 * extractCodeFiles tests — Phase 48
 *
 * Tests the AI-reply → Project file extractor. Covers:
 *   - Annotated code blocks with path="..."
 *   - Plain code blocks (no path annotation)
 *   - Multi-file replies
 *   - Skipping non-code blocks (mathgraph, examgen, text)
 *   - Entry-point detection
 *
 * Run: npx vitest run src/lib/code-extract.test.ts
 */
import { describe, it, expect } from "vitest";
import { extractCodeFiles } from "./code-extract";

describe("extractCodeFiles — annotated code blocks", () => {
  it("extracts a single file with path= annotation", () => {
    const reply = `Here's your code:

\`\`\`python path="src/main.py"
print("hello")
\`\`\`

Let me know if you have questions.`;
    const files = extractCodeFiles(reply);
    expect(files).not.toBeNull();
    expect(files!.length).toBe(1);
    expect(files![0].path).toBe("src/main.py");
    expect(files![0].language).toBe("python");
    expect(files![0].content).toBe('print("hello")');
    expect(files![0].isEntry).toBe(true);
  });

  it("extracts multiple files with path= annotations", () => {
    const reply = `\`\`\`javascript path="src/index.js"
console.log("hello");
\`\`\`

\`\`\`javascript path="src/utils.js"
export const add = (a, b) => a + b;
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files!.length).toBe(2);
    expect(files![0].path).toBe("src/index.js");
    expect(files![0].isEntry).toBe(true);
    expect(files![1].path).toBe("src/utils.js");
    expect(files![1].isEntry).toBe(false);
  });

  it("extracts mixed languages", () => {
    const reply = `\`\`\`python path="app.py"
from flask import Flask
\`\`\`

\`\`\`sql path="schema.sql"
CREATE TABLE users (id INTEGER);
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files!.length).toBe(2);
    expect(files![0].language).toBe("python");
    expect(files![1].language).toBe("sql");
  });

  it("handles single-quoted path annotations", () => {
    const reply = `\`\`\`typescript path='src/app.ts'
const x: number = 1;
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files![0].path).toBe("src/app.ts");
    expect(files![0].language).toBe("typescript");
  });
});

describe("extractCodeFiles — plain code blocks (no path annotation)", () => {
  it("uses default filename for unannotated python block", () => {
    const reply = `Here's a function:

\`\`\`python
def greet(name):
    return f"Hello, {name}"
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files!.length).toBe(1);
    expect(files![0].path).toBe("main.py");
    expect(files![0].language).toBe("python");
    expect(files![0].isEntry).toBe(true);
  });

  it("uses default filename for unannotated javascript block", () => {
    const reply = `\`\`\`js
console.log("hi");
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files![0].path).toBe("main.js");
    expect(files![0].language).toBe("javascript");
  });

  it("marks the first runnable file as the entry point", () => {
    const reply = `\`\`\`markdown
# Project README
\`\`\`

\`\`\`python
print("entry")
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files!.length).toBe(2);
    // The python file should be the entry, not the markdown
    const entry = files!.find((f) => f.isEntry);
    expect(entry?.language).toBe("python");
  });
});

describe("extractCodeFiles — non-code blocks", () => {
  it("skips mathgraph blocks", () => {
    const reply = `\`\`\`mathgraph
{"type": "scatter", "points": [[0,0]]}
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files).toBeNull();
  });

  it("skips examgen blocks", () => {
    const reply = `\`\`\`examgen
{"topic": "Math", "numQuestions": 5}
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files).toBeNull();
  });

  it("skips plain text blocks", () => {
    const reply = `\`\`\`text
This is just text, not code.
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files).toBeNull();
  });

  it("returns null for reply with no code blocks", () => {
    expect(extractCodeFiles("Just a regular reply with no code.")).toBeNull();
    expect(extractCodeFiles("")).toBeNull();
  });

  it("skips non-code blocks but extracts real code blocks in the same reply", () => {
    const reply = `Here's a graph:

\`\`\`mathgraph
{"type": "scatter", "points": [[0,0]]}
\`\`\`

And here's the code to generate it:

\`\`\`python
import matplotlib.pyplot as plt
plt.scatter([0], [0])
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files!.length).toBe(1);
    expect(files![0].language).toBe("python");
  });
});

describe("extractCodeFiles — edge cases", () => {
  it("preserves multi-line content correctly", () => {
    const reply = `\`\`\`python
def foo():
    x = 1
    y = 2
    return x + y

foo()
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files![0].content).toContain("def foo():");
    expect(files![0].content).toContain("return x + y");
    expect(files![0].content).toContain("foo()");
  });

  it("handles empty code block", () => {
    const reply = `\`\`\`python
\`\`\``;
    const files = extractCodeFiles(reply);
    // Empty code blocks are still extracted (with empty content)
    expect(files!.length).toBe(1);
    expect(files![0].content).toBe("");
  });

  it("detects language from file extension when path= is used", () => {
    const reply = `\`\`\`text path="config.json"
{"key": "value"}
\`\`\``;
    const files = extractCodeFiles(reply);
    // Path-based detection wins over the language tag
    expect(files![0].language).toBe("json");
  });

  it("handles bash code blocks", () => {
    const reply = `\`\`\`bash
echo "hello"
npm install
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files![0].language).toBe("bash");
    expect(files![0].path).toBe("script.sh");
  });

  it("handles Rust code blocks", () => {
    const reply = `\`\`\`rust
fn main() {
    println!("hello");
}
\`\`\``;
    const files = extractCodeFiles(reply);
    expect(files![0].language).toBe("rust");
  });
});
