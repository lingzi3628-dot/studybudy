#!/usr/bin/env python3
"""
Phase 97a (cont.) — Crawl a specific grade's curriculum designs page
to find the actual PDF download links.

KICD structure:
  /cbc-materials/curriculum-designs/  (index — links to each grade)
    /grade-four-designs/  (grade page — should link to subject PDFs)
    /grade-five-designs/
    ...
    /grade-ten/, /grade-eleven/, /grade-twelve/  (SENIOR SCHOOL — was missing!)
"""
import requests
import re
from urllib.parse import urljoin

GRADE_PAGES = [
    "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-four-designs/",
    "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-nine-designs/",
    "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-ten/",  # senior school
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

for grade_url in GRADE_PAGES:
    print(f"\n{'='*72}")
    print(f"Crawling: {grade_url}")
    print('='*72)
    try:
        r = requests.get(grade_url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            print(f"Status: {r.status_code}")
            continue
        html = r.text
        print(f"Status: 200, HTML size: {len(html)} chars")

        # The SDM plugin stores download links with specific patterns.
        # Look for ALL anchor tags with class containing "download" or pointing to /download/
        # Also look for the SDM data attributes
        anchor_pattern = re.compile(
            r'<a\s+([^>]*?)href="([^"]+)"([^>]*)>([^<]*)</a>',
            re.IGNORECASE | re.DOTALL,
        )
        download_anchors = []
        for attrs_before, href, attrs_after, text in anchor_pattern.findall(html):
            all_attrs = (attrs_before + " " + attrs_after).lower()
            text_clean = text.strip()[:80]
            if (
                "download" in all_attrs
                or "/download/" in href.lower()
                or "smd_" in all_attrs
                or ".pdf" in href.lower()
            ):
                download_anchors.append((href, text_clean, all_attrs))

        if download_anchors:
            print(f"Found {len(download_anchors)} download-related anchors:")
            for href, text, attrs in download_anchors[:20]:
                # Resolve to absolute URL
                abs_url = urljoin(grade_url, href)
                print(f"  → {text!r}")
                print(f"     URL: {abs_url}")
                # Try a HEAD request to see content type
                try:
                    head = requests.head(abs_url, headers=HEADERS, timeout=10, allow_redirects=True)
                    ct = head.headers.get("Content-Type", "?").split(";")[0]
                    cl = head.headers.get("Content-Length", "?")
                    print(f"     HEAD: {head.status_code} | {ct} | {cl} bytes")
                except Exception as e:
                    print(f"     HEAD failed: {str(e)[:60]}")
        else:
            print("No download anchors found — checking content body for hints...")
            # Look for headings, list items, etc.
            h2_pattern = re.compile(r'<h[23][^>]*>([^<]+)</h[23]>', re.IGNORECASE)
            headings = h2_pattern.findall(html)
            print(f"Headings on this page ({len(headings)}):")
            for h in headings[:15]:
                print(f"  # {h.strip()[:80]}")
            # Look for any URL containing "download"
            all_urls = re.findall(r'href="([^"]+)"', html)
            downloadish = [u for u in all_urls if "download" in u.lower()][:20]
            if downloadish:
                print(f"\nURLs containing 'download' ({len(downloadish)}):")
                for u in downloadish:
                    print(f"  {urljoin(grade_url, u)}")
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {str(e)[:200]}")
