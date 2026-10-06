// Debug script — test PDF extraction locally to see the EXACT error.
//
// Usage:
//   npx tsx scripts/test-pdf.ts /path/to/your.pdf
//
// This bypasses the HTTP API and calls extractPdfText() directly, printing
// the full error message (if any) + the first 500 chars of extracted text.
// Use this to diagnose 422 errors from /api/tutor/upload-document or
// /api/tutor/upload-outline.
import fs from 'fs';
import path from 'path';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/test-pdf.ts <path-to-pdf>');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(filePath);
  console.log(`File: ${filePath}`);
  console.log(`Size: ${buf.length} bytes (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

  // Test 1: direct extractPdfText call
  console.log('\n--- Test 1: extractPdfText (direct) ---');
  try {
    const { extractPdfText } = await import('../src/lib/pdf');
    const text = await extractPdfText(buf);
    console.log(`✅ Success — extracted ${text.length} chars`);
    console.log(`First 500 chars:\n${text.slice(0, 500)}`);
  } catch (err: any) {
    console.error(`❌ FAILED:`);
    console.error(`Error message: ${err?.message ?? err}`);
    console.error(`Error name: ${err?.name ?? 'n/a'}`);
    if (err?.stack) console.error(`Stack: ${err.stack.split('\n').slice(0, 5).join('\n')}`);
  }

  // Test 2: via extractTextFromFile (the route's helper)
  console.log('\n--- Test 2: extractTextFromFile (route helper) ---');
  try {
    const { extractTextFromFile } = await import('../src/lib/upload-helpers');
    const file = new File([buf], path.basename(filePath), {
      type: 'application/pdf',
    });
    const { text, error } = await extractTextFromFile(file, { maxLength: 100_000 });
    if (error) {
      console.error(`❌ FAILED: ${error}`);
    } else {
      console.log(`✅ Success — extracted ${text.length} chars`);
      console.log(`First 500 chars:\n${text.slice(0, 500)}`);
    }
  } catch (err: any) {
    console.error(`❌ THREW: ${err?.message ?? err}`);
  }

  // Test 3: check if pdfjs-dist standard fonts are resolvable
  console.log('\n--- Test 3: pdfjs-dist standard fonts check ---');
  try {
    const pdfjsPath = require.resolve('pdfjs-dist/package.json');
    const pdfjsDir = path.dirname(pdfjsPath);
    const fontsDir = path.join(pdfjsDir, 'standard_fonts');
    const cmapsDir = path.join(pdfjsDir, 'cmaps');
    const fontsExist = fs.existsSync(fontsDir);
    const cmapsExist = fs.existsSync(cmapsDir);
    console.log(`pdfjs-dist dir: ${pdfjsDir}`);
    console.log(`standard_fonts exists: ${fontsExist}`);
    console.log(`cmaps exists: ${cmapsExist}`);
    if (fontsExist) {
      const fonts = fs.readdirSync(fontsDir);
      console.log(`standard_fonts files: ${fonts.length} (first 3: ${fonts.slice(0, 3).join(', ')})`);
    }
  } catch (err: any) {
    console.error(`❌ Could not resolve pdfjs-dist: ${err?.message}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
