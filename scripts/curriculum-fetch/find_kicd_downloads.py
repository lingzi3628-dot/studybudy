#!/usr/bin/env python3
"""
Phase 97a (cont.) — Probe the REAL KICD curriculum designs page + extract
all PDF download links using the WordPress Simple Download Monitor plugin.

The KICD site uses the "Simple Download Monitor" (SDM) WordPress plugin.
Download URLs typically look like:
  https://kicd.ac.ke/download/{slug}/
  OR
  https://kicd.ac.ke/?smd_process_download=1&download_id={N}

Let's find them all.
"""
import requests
import re
from urllib.parse import urljoin, urlparse

BASE = "https://kicd.ac.ke"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# Pages to crawl — discovered from the inspect step
PAGES_TO_CRAWL = [
    f"{BASE}/cbc-materials/curriculum-designs/",
    f"{BASE}/cbc-materials/curriculum-designs/grade-eight-designs/",  # found in anchor
    f"{BASE}/cbc-materials/",
    f"{BASE}/cbc-materials/teacher-education/",
    f"{BASE}/curriculum-reform/basic-education-curriculum-framework/",
]

# SDM plugin download URL patterns
SDM_PATTERNS = [
    re.compile(r'href="(https?://[^"]*?/download/[^"]+)"', re.IGNORECASE),
    re.compile(r'href="([^"]*smd_process_download[^"]+)"', re.IGNORECASE),
    re.compile(r'href="([^"]*\.pdf)"', re.IGNORECASE),
    re.compile(r'data-download-url="([^"]+)"', re.IGNORECASE),
    # SDM commonly uses class "sdm_download" or "sdm-download"
    re.compile(r'<a[^>]*class="[^"]*sdm[^"]*"[^>]*href="([^"]+)"', re.IGNORECASE),
    re.compile(r'<a[^>]*href="([^"]+)"[^>]*class="[^"]*sdm[^"]*"', re.IGNORECASE),
]

found_downloads = {}  # url -> set of pages that linked to it

for page_url in PAGES_TO_CRAWL:
    print(f"\n=== Crawling: {page_url} ===")
    try:
        r = requests.get(page_url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            print(f"  Status: {r.status_code} — skipping")
            continue
        html = r.text
        print(f"  Status: 200, HTML size: {len(html)} chars")
        page_links = set()
        for pattern in SDM_PATTERNS:
            for match in pattern.findall(html):
                # Normalize to absolute URL
                url = urljoin(page_url, match)
                page_links.add(url)
        if page_links:
            print(f"  Found {len(page_links)} candidate download links:")
            for link in sorted(page_links)[:30]:
                print(f"    → {link}")
                found_downloads.setdefault(link, set()).add(page_url)
        else:
            print("  No SDM/PDF download links found on this page.")
            # Save HTML for manual review
            slug = urlparse(page_url).path.strip("/").replace("/", "_") or "root"
            with open(f"/home/z/my-project/data/kicd_page_{slug}.html", "w", encoding="utf-8") as f:
                f.write(html)
            print(f"  Saved HTML to /home/z/my-project/data/kicd_page_{slug}.html")
    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {str(e)[:150]}")

print(f"\n{'='*72}")
print(f"Summary: {len(found_downloads)} unique download URLs found")
print(f"{'='*72}")
if found_downloads:
    print("\nAll found download URLs (try these to see if they actually serve PDFs):")
    for url in sorted(found_downloads.keys()):
        # Try a HEAD request to see content-type
        try:
            r = requests.head(url, headers=HEADERS, timeout=10, allow_redirects=True)
            ct = r.headers.get("Content-Type", "unknown").split(";")[0]
            cl = r.headers.get("Content-Length", "?")
            cd = r.headers.get("Content-Disposition", "")
            print(f"  [{r.status_code}] {ct:30s} {cl:>10} bytes  {url}")
            if cd:
                print(f"          Content-Disposition: {cd[:120]}")
        except Exception as e:
            print(f"  [HEAD FAIL] {url}: {str(e)[:80]}")
