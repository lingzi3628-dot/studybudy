#!/usr/bin/env python3
"""
Phase 97a (cont.) — Inspect the KICD downloads page in detail.

The probe showed KICD's homepage + /downloads are reachable but had no
'.pdf' mentions in the raw HTML. This suggests JS-rendered content.
Let's check what IS in the HTML — meta tags, scripts, iframes, etc.
"""
import requests
from html.parser import HTMLParser
import re

URL = "https://kicd.ac.ke/downloads/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

r = requests.get(URL, headers=HEADERS, timeout=15)
html = r.text
print(f"Status: {r.status_code}")
print(f"Content-Type: {r.headers.get('Content-Type')}")
print(f"HTML size: {len(html)} chars")
print()

# Look for common patterns
patterns = [
    (r'href="([^"]*\.pdf[^"]*)"', "PDF links (href)"),
    (r'src="([^"]*\.pdf[^"]*)"', "PDF sources (src)"),
    (r'<iframe[^>]*src="([^"]+)"', "Iframes (often used for embedded PDFs)"),
    (r'<a[^>]*href="([^"]+)"[^>]*>([^<]*)(?:pdf|download|curriculum|design|past paper)([^<]*)</a>', "Anchor text mentioning pdf/download/curriculum"),
    (r'data-src="([^"]+)"', "data-src attributes (lazy-loaded)"),
    (r'window\.location\s*=\s*[\'"]([^\'"]+)[\'"]', "JS redirects"),
    (r'<script[^>]*src="([^"]+)"', "External scripts"),
    (r'<title>([^<]+)</title>', "Page title"),
    (r'<meta[^>]*name="description"[^>]*content="([^"]+)"', "Meta description"),
]

for pattern, label in patterns:
    matches = re.findall(pattern, html, re.IGNORECASE)
    print(f"=== {label} ({len(matches)} matches) ===")
    if matches:
        for m in matches[:10]:
            if isinstance(m, tuple):
                print(f"  {m[0][:120]} | {m[1][:80] if len(m) > 1 else ''}")
            else:
                print(f"  {m[:120]}")
    else:
        print("  (none found)")
    print()

# Also check if it's a WordPress site (KNEC URL had index.php — common WP sign)
print("=== Platform detection ===")
if "wp-content" in html or "wp-includes" in html:
    print("  WordPress detected (wp-content / wp-includes found)")
if "index.php" in html:
    print("  PHP site (index.php references found)")
if "react" in html.lower() or "__next" in html.lower():
    print("  React/Next.js SPA detected")
if "<noscript" in html.lower():
    print("  <noscript> tag found — content may require JS")

# Save the HTML for manual inspection
with open("/home/z/my-project/data/kicd_downloads_page.html", "w", encoding="utf-8") as f:
    f.write(html)
print(f"\nSaved HTML to /home/z/my-project/data/kicd_downloads_page.html for manual review")
