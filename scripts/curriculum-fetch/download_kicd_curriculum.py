#!/usr/bin/env python3
"""
Phase 97a — Working KICD curriculum design downloader.

DISCOVERY: KICD embeds curriculum design PDFs as Google Drive iframes.
Pattern:
  <h3 id="categoryN">Subject Name</h3>
  <p><iframe src="https://drive.google.com/file/d/{FILE_ID}/preview" ...></iframe></p>

This script:
  1. Crawls each grade's curriculum-designs page
  2. Extracts the Google Drive file IDs for each subject
  3. Downloads each PDF via the Google Drive direct-download URL
  4. Saves to data/kicd/curriculum/{grade}/{subject}.pdf
  5. Builds a metadata.json index

Run:
  python3 scripts/curriculum-fetch/download_kicd_curriculum.py
"""
import os
import re
import json
import time
import requests
from urllib.parse import urljoin, urlparse, parse_qs
from pathlib import Path

# ============================================================
# Configuration
# ============================================================

OUTPUT_DIR = Path("/home/z/my-project/data/kicd/curriculum")
METADATA_FILE = Path("/home/z/my-project/data/kicd/metadata.json")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# All known grade pages (discovered from the curriculum-designs index)
GRADE_PAGES = {
    # Lower primary
    "PP1": "https://kicd.ac.ke/cbc-materials/curriculum-designs/pp1-designs/",
    "PP2": "https://kicd.ac.ke/cbc-materials/curriculum-designs/pp2-designs/",
    "Grade 1": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-one-designs/",
    "Grade 2": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-two-designs/",
    "Grade 3": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-three-designs/",
    # Upper primary
    "Grade 4": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-four-designs/",
    "Grade 5": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-five-designs/",
    "Grade 6": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-six-designs/",
    # Junior school
    "Grade 7": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-seven-designs/",
    "Grade 8": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eight-designs/",
    "Grade 9": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-nine-designs/",
    # Senior school (Grade 10-12) — was MISSING from the hardcoded curriculum!
    "Grade 10": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-ten/",
    "Grade 11": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eleven/",
    "Grade 12": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-twelve/",
    # Teacher education
    "Diploma in Teacher Education": "https://kicd.ac.ke/cbc-materials/curriculum-designs/diploma-in-teacher-education/",
}

# Regex to extract subject + Google Drive file ID from iframes
# Pattern: <h3 id="categoryN">Subject Name</h3> ... <iframe src="https://drive.google.com/file/d/{ID}/preview" ...>
IFRAME_PATTERN = re.compile(
    r'<h3[^>]*>([^<]+)</h3>\s*<p>\s*<iframe[^>]*src="https://drive\.google\.com/file/d/([^/]+)/preview"',
    re.IGNORECASE,
)
# Fallback: catch iframes not immediately after an h3
STANDALONE_IFRAME_PATTERN = re.compile(
    r'<iframe[^>]*src="https://drive\.google\.com/file/d/([^/]+)/preview"',
    re.IGNORECASE,
)

# ============================================================
# Helpers
# ============================================================

def safe_filename(s: str) -> str:
    """Make a string safe for use as a filename."""
    return re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_")[:80]

def fetch_grade_page(grade: str, url: str) -> list[dict]:
    """Fetch a grade page + return list of {subject, drive_file_id} dicts."""
    print(f"\n[{grade}] Fetching {url}")
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            print(f"  ❌ HTTP {r.status_code}")
            return []
        html = r.text
        print(f"  ✓ HTML: {len(html)} chars")

        # Primary pattern: heading + iframe pair
        results = []
        seen_ids = set()
        for subject, file_id in IFRAME_PATTERN.findall(html):
            subject = subject.strip()
            if subject and file_id not in seen_ids:
                results.append({"grade": grade, "subject": subject, "drive_file_id": file_id})
                seen_ids.add(file_id)

        # Fallback: iframes without a preceding heading
        if not results:
            print(f"  ⚠️  No heading+iframe pairs found — trying standalone iframes")
            # Find all iframes + try to associate with the nearest preceding heading
            # Split the HTML on iframes + look backward for an h3
            parts = re.split(r'(<iframe[^>]*src="https://drive\.google\.com/file/d/([^/]+)/preview"[^>]*></iframe>)', html, flags=re.IGNORECASE)
            last_heading = None
            for i, part in enumerate(parts):
                if i % 3 == 0:  # text segment — look for headings
                    headings = re.findall(r'<h3[^>]*>([^<]+)</h3>', part, re.IGNORECASE)
                    if headings:
                        last_heading = headings[-1].strip()
                elif i % 3 == 2:  # file_id segment
                    file_id = part
                    if file_id and file_id not in seen_ids and last_heading:
                        results.append({"grade": grade, "subject": last_heading, "drive_file_id": file_id})
                        seen_ids.add(file_id)

        print(f"  Found {len(results)} subject PDFs:")
        for r in results[:10]:
            print(f"    • {r['subject']} (drive ID: {r['drive_file_id'][:20]}...)")
        if len(results) > 10:
            print(f"    ... and {len(results) - 10} more")
        return results
    except Exception as e:
        print(f"  ❌ ERROR: {type(e).__name__}: {str(e)[:150]}")
        return []

def download_drive_pdf(file_id: str, output_path: Path) -> bool:
    """Download a PDF from Google Drive by file ID."""
    # Google Drive direct-download URL
    # For large files, Google shows a confirmation page — handle that
    download_url = f"https://drive.google.com/uc?export=download&id={file_id}"

    try:
        # First attempt — may return HTML for large files (virus scan warning)
        r = requests.get(download_url, headers=HEADERS, timeout=60, allow_redirects=True, stream=True)

        content_type = r.headers.get("Content-Type", "")
        if "text/html" in content_type:
            # Large file — need to extract the confirmation token
            # Look for: confirm={token}
            html = r.text[:5000]  # only read first 5KB
            match = re.search(r'confirm=([a-zA-Z0-9_-]+)', html)
            if match:
                token = match.group(1)
                download_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm={token}"
                r = requests.get(download_url, headers=HEADERS, timeout=60, stream=True)
                content_type = r.headers.get("Content-Type", "")
            else:
                # Try the alternate download URL pattern
                download_url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download"
                r = requests.get(download_url, headers=HEADERS, timeout=60, stream=True)
                content_type = r.headers.get("Content-Type", "")

        # Check if we got a PDF
        first_bytes = next(r.iter_content(chunk_size=4))
        if first_bytes != b"%PDF":
            print(f"    ❌ Not a PDF (Content-Type: {content_type}, first bytes: {first_bytes!r})")
            return False

        # Stream the rest to disk
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(first_bytes)
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"    ✓ Downloaded: {output_path.name} ({size_mb:.2f} MB)")
        return True

    except Exception as e:
        print(f"    ❌ Download error: {type(e).__name__}: {str(e)[:100]}")
        return False

# ============================================================
# Main
# ============================================================

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_FILE.parent.mkdir(parents=True, exist_ok=True)

    metadata = {
        "source": "KICD curriculum designs (https://kicd.ac.ke/cbc-materials/curriculum-designs/)",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "grades": {},
    }

    total_subjects = 0
    total_downloaded = 0
    total_failed = 0

    for grade, url in GRADE_PAGES.items():
        subjects = fetch_grade_page(grade, url)
        metadata["grades"][grade] = {
            "source_url": url,
            "subjects": [],
        }

        grade_dir = OUTPUT_DIR / safe_filename(grade)
        grade_dir.mkdir(parents=True, exist_ok=True)

        for subject_info in subjects:
            total_subjects += 1
            subject_name = subject_info["subject"]
            file_id = subject_info["drive_file_id"]
            safe_name = safe_filename(subject_name)
            output_path = grade_dir / f"{safe_name}.pdf"

            subject_meta = {
                "subject": subject_name,
                "drive_file_id": file_id,
                "drive_url": f"https://drive.google.com/file/d/{file_id}/view",
                "local_path": str(output_path.relative_to(OUTPUT_DIR.parent.parent)) if output_path.exists() else None,
                "downloaded": False,
            }

            # Skip if already downloaded
            if output_path.exists() and output_path.stat().st_size > 1000:
                print(f"  ⏭️  Already exists: {output_path.name}")
                subject_meta["downloaded"] = True
                subject_meta["size_mb"] = round(output_path.stat().st_size / (1024 * 1024), 2)
                total_downloaded += 1
            else:
                if download_drive_pdf(file_id, output_path):
                    subject_meta["downloaded"] = True
                    subject_meta["size_mb"] = round(output_path.stat().st_size / (1024 * 1024), 2)
                    total_downloaded += 1
                else:
                    total_failed += 1
                    # Clean up partial file
                    if output_path.exists():
                        output_path.unlink()

            metadata["grades"][grade]["subjects"].append(subject_meta)
            # Be polite — don't hammer Google Drive
            time.sleep(1)

        # Save metadata incrementally so a crash doesn't lose progress
        with open(METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*72}")
    print(f"DONE")
    print(f"{'='*72}")
    print(f"Grades processed: {len(GRADE_PAGES)}")
    print(f"Subjects found:   {total_subjects}")
    print(f"Downloaded:       {total_downloaded}")
    print(f"Failed:           {total_failed}")
    print(f"\nMetadata saved to: {METADATA_FILE}")
    print(f"PDFs saved to:     {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()
