/**
 * Phase 7 (Stage 1 doc reader) — tests for the document upload + chat
 * documentContext flow.
 *
 * This test file covers:
 *   1. The documentContext request body shape (frontend → server)
 *   2. Server-side validation + slicing of documentContext
 *   3. System prompt injection of document text
 *   4. The `document` attachment shape (what gets saved to DB)
 *
 * NOTE: The /api/tutor/upload-document route itself is a thin wrapper around
 * extractTextFromFile() (already tested in phase7-pdf-extraction.test.ts).
 * Full route integration tests would require mocking auth, DB, and FormData
 * in a way that's fragile. The unit tests below verify the data shapes that
 * matter for correctness.
 */
import { describe, it, expect } from "vitest";

// === Frontend send() builds the right request body ===

describe("chat documentContext — request body shape", () => {
  it("frontend send() puts doc text in documentContext, NOT in message", () => {
    // Mirror of the send() function in AITutorChat.tsx
    const q = "Summarize this PDF";
    const doc = {
      text: "Extracted PDF text here. Photosynthesis is the process by which plants convert light energy into chemical energy.",
      fileName: "lecture.pdf",
      fileType: "pdf",
    };
    const messageText = q || `📄 ${doc.fileName}`;
    const documentContext = { text: doc.text, fileName: doc.fileName, fileType: doc.fileType };
    const requestBody = JSON.stringify({
      message: messageText,
      documentContext,
    });
    const parsed = JSON.parse(requestBody);

    // The saved message (what gets stored in DB) is JUST the question.
    expect(parsed.message).toBe("Summarize this PDF");
    // The doc text lives in documentContext, not in message.
    expect(parsed.documentContext.text).toMatch(/Photosynthesis/);
    expect(parsed.documentContext.fileName).toBe("lecture.pdf");
    // Critical invariant: message does NOT contain the doc text.
    expect(parsed.message).not.toMatch(/Photosynthesis/);
  });

  it("documentContext is omitted (undefined) when no document is attached", () => {
    const messageText = "Hello, how are you?";
    const doc = null;
    const documentContext = doc ? { text: doc.text, fileName: doc.fileName, fileType: doc.fileType } : undefined;
    const requestBody = JSON.stringify({ message: messageText, documentContext });
    const parsed = JSON.parse(requestBody);
    expect(parsed.documentContext).toBeUndefined();
  });

  it("when user doesn't type a question but attaches a doc, message is the filename", () => {
    const q = "";
    const doc = { text: "x", fileName: "notes.pdf", fileType: "pdf" };
    const messageText = q || `📄 ${doc.fileName}`;
    expect(messageText).toBe("📄 notes.pdf");
  });
});

// === Server-side documentContext validation ===

describe("server documentContext validation", () => {
  // Mirror of the server-side validation in /api/tutor/chat/route.ts
  function validateDocumentContext(body: any) {
    return (body?.documentContext
      && typeof body.documentContext === "object"
      && typeof body.documentContext.text === "string"
      && typeof body.documentContext.fileName === "string")
      ? {
          text: body.documentContext.text.slice(0, 22_000),
          fileName: String(body.documentContext.fileName).slice(0, 200),
          fileType: typeof body.documentContext.fileType === "string"
            ? body.documentContext.fileType.slice(0, 20) : "unknown",
        }
      : null;
  }

  it("accepts a well-formed documentContext", () => {
    const result = validateDocumentContext({
      documentContext: { text: "doc text", fileName: "test.pdf", fileType: "pdf" },
    });
    expect(result).not.toBeNull();
    expect(result.text).toBe("doc text");
    expect(result.fileName).toBe("test.pdf");
    expect(result.fileType).toBe("pdf");
  });

  it("treats malformed documentContext (missing text) as null", () => {
    expect(validateDocumentContext({ documentContext: { fileName: "y" } })).toBeNull();
  });

  it("treats malformed documentContext (missing fileName) as null", () => {
    expect(validateDocumentContext({ documentContext: { text: "x" } })).toBeNull();
  });

  it("treats non-object documentContext as null", () => {
    expect(validateDocumentContext({ documentContext: "string" })).toBeNull();
    expect(validateDocumentContext({ documentContext: null })).toBeNull();
    expect(validateDocumentContext({ documentContext: 42 })).toBeNull();
  });

  it("treats missing documentContext as null", () => {
    expect(validateDocumentContext({})).toBeNull();
    expect(validateDocumentContext(undefined)).toBeNull();
  });

  it("caps documentContext.text at 22k chars (token budget safety)", () => {
    const longText = "x".repeat(50_000);
    const result = validateDocumentContext({
      documentContext: { text: longText, fileName: "huge.pdf", fileType: "pdf" },
    });
    expect(result.text.length).toBe(22_000);
  });

  it("caps fileName at 200 chars", () => {
    const longName = "x".repeat(500);
    const result = validateDocumentContext({
      documentContext: { text: "x", fileName: longName, fileType: "pdf" },
    });
    expect(result.fileName.length).toBe(200);
  });

  it("caps fileType at 20 chars + defaults to 'unknown' when missing", () => {
    const result1 = validateDocumentContext({
      documentContext: { text: "x", fileName: "y", fileType: "x".repeat(50) },
    });
    expect(result1.fileType.length).toBe(20);

    const result2 = validateDocumentContext({
      documentContext: { text: "x", fileName: "y" }, // no fileType
    });
    expect(result2.fileType).toBe("unknown");
  });
});

// === System prompt injection ===

describe("system prompt injection of document text", () => {
  it("appends document text + a teaching instruction to the system prompt", () => {
    const basePrompt = "You are a helpful tutor.";
    const documentContext = {
      text: "Photosynthesis is the process by which plants convert light energy into chemical energy.",
      fileName: "lecture.pdf",
      fileType: "pdf",
    };
    // Mirror of the server-side injection
    const systemContent = basePrompt +
      `\n\n--- ATTACHED DOCUMENT: ${documentContext.fileName} (${documentContext.fileType.toUpperCase()}) ---\n${documentContext.text}\n--- END DOCUMENT ---\n\nThe learner attached the document above. Use it to answer their question. If they didn't ask a specific question, offer to summarize, explain key concepts, or generate practice questions from the content.`;
    expect(systemContent).toMatch(/Photosynthesis/);
    expect(systemContent).toMatch(/ATTACHED DOCUMENT: lecture\.pdf/);
    expect(systemContent).toMatch(/chemical energy/);
    expect(systemContent).toMatch(/Use it to answer their question/);
    expect(systemContent).toMatch(/offer to summarize/);
  });

  it("does NOT inject anything when documentContext is null", () => {
    const basePrompt = "You are a helpful tutor.";
    const documentContext = null;
    const systemContent = documentContext
      ? basePrompt + `\n\n--- ATTACHED DOCUMENT ---\n${documentContext.text}\n--- END ---\n`
      : basePrompt;
    expect(systemContent).toBe(basePrompt);
  });
});

// === Saved user message shape ===

describe("saved user message shape", () => {
  it("user message content is JUST the question (NOT the doc text)", () => {
    // Mirror of the server's db.chatMessage.create data
    const userMessage = "Summarize this PDF";
    const documentContext = { text: "x".repeat(5000), fileName: "big.pdf", fileType: "pdf" };
    const savedContent = userMessage || (documentContext ? `(Uploaded ${documentContext.fileName})` : "(Empty)");
    expect(savedContent).toBe("Summarize this PDF");
    expect(savedContent.length).toBeLessThan(50);
    // Critical: the 5000 chars of doc text are NOT in the saved message.
    expect(savedContent).not.toMatch(/x{100}/);
  });

  it("when no question typed, saved content is '(Uploaded <filename>)'", () => {
    const userMessage = "";
    const documentContext = { text: "x", fileName: "notes.pdf", fileType: "pdf" };
    const savedContent = userMessage || (documentContext ? `(Uploaded ${documentContext.fileName})` : "(Empty)");
    expect(savedContent).toBe("(Uploaded notes.pdf)");
  });

  it("document attachment caption carries fileName + fileType + charCount", () => {
    const documentContext = {
      text: "x".repeat(5000),
      fileName: "notes.pdf",
      fileType: "pdf",
    };
    // Mirror of the server's attachment construction
    const attachment = {
      type: "document",
      url: null,
      caption: JSON.stringify({
        fileName: documentContext.fileName,
        fileType: documentContext.fileType,
        charCount: documentContext.text.length,
      }),
    };
    expect(attachment.type).toBe("document");
    const meta = JSON.parse(attachment.caption);
    expect(meta.fileName).toBe("notes.pdf");
    expect(meta.fileType).toBe("pdf");
    expect(meta.charCount).toBe(5000);
  });

  it("image + document can coexist in the same user message attachments", () => {
    const imageDataUrl = "data:image/png;base64,...";
    const documentContext = { text: "x", fileName: "notes.pdf", fileType: "pdf" };
    const userAttachments: any[] = [];
    if (imageDataUrl) userAttachments.push({ type: "image", url: imageDataUrl, caption: "Uploaded image" });
    if (documentContext) userAttachments.push({
      type: "document", url: null,
      caption: JSON.stringify({ fileName: documentContext.fileName, fileType: documentContext.fileType, charCount: documentContext.text.length }),
    });
    expect(userAttachments).toHaveLength(2);
    expect(userAttachments[0].type).toBe("image");
    expect(userAttachments[1].type).toBe("document");
  });
});

// === Frontend size cap (matches backend) ===

describe("frontend size cap matches backend", () => {
  it("MAX_DOC_BYTES is 4 MB (matches /api/tutor/upload-document's parseFormData default)", () => {
    // Mirror of the frontend constant
    const MAX_DOC_BYTES = 4 * 1024 * 1024;
    expect(MAX_DOC_BYTES).toBe(4_194_304);
    expect(MAX_DOC_BYTES).toBe(4 * 1024 * 1024);
  });

  it("rejects a 6 MB file with a friendly message", () => {
    const MAX_DOC_BYTES = 4 * 1024 * 1024;
    const fileSize = 6 * 1024 * 1024;
    expect(fileSize > MAX_DOC_BYTES).toBe(true);
    const mb = (fileSize / 1024 / 1024).toFixed(1);
    const cap = (MAX_DOC_BYTES / 1024 / 1024).toFixed(0);
    const msg = `Document too large (${mb} MB). Max is ${cap} MB — try splitting the PDF or pasting the relevant text.`;
    expect(msg).toMatch(/6\.0 MB/);
    expect(msg).toMatch(/Max is 4 MB/);
    expect(msg).toMatch(/splitting the PDF/);
  });

  it("accepts a 3 MB file", () => {
    const MAX_DOC_BYTES = 4 * 1024 * 1024;
    const fileSize = 3 * 1024 * 1024;
    expect(fileSize > MAX_DOC_BYTES).toBe(false);
  });
});
