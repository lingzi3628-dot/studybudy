#!/usr/bin/env python3
"""
Phase 97a — Test which URLs from the data fetching guide actually work.

Probes each URL in the guide + reports HTTP status, content-type, and
whether it looks like a PDF or an HTML page. This tells us what's
actually fetchable vs. what requires manual download.
"""
import requests
import sys
from urllib.parse import urlparse

URLS_TO_PROBE = [
    # KICD
    ("KICD homepage", "https://www.kicd.ac.ke/"),
    ("KICD downloads", "https://www.kicd.ac.ke/downloads"),
    ("KICD grade-1 curriculum (guess)", "https://www.kicd.ac.ke/downloads/grade-1-curriculum-design"),
    ("KICD grade-4 curriculum (guess)", "https://www.kicd.ac.ke/downloads/grade-4-curriculum-design"),
    ("KICD grade-9 curriculum (guess)", "https://www.kicd.ac.ke/downloads/grade-9-curriculum-design"),
    ("KICD STEM senior (guess)", "https://www.kicd.ac.ke/downloads/stem-curriculum-design"),
    ("KICD resources page", "https://www.kicd.ac.ke/resources"),
    ("KICD approved textbooks", "https://www.kicd.ac.ke/resources/approved-textbooks"),
    # KNEC
    ("KNEC homepage", "https://www.knec.ac.ke/"),
    ("KNEC past papers", "https://www.knec.ac.ke/index.php/downloads/past-examination-papers"),
    ("KNEC marking schemes", "https://www.knec.ac.ke/index.php/downloads/marking-schemes"),
    # Ministry
    ("MoE homepage", "https://www.education.go.ke/"),
    ("MoE documents", "https://www.education.go.ke/documents"),
    ("MoE statistics", "https://www.education.go.ke/statistics"),
    # CUE
    ("CUE homepage", "https://www.cue.or.ke/"),
    # TVETA + CDACC
    ("TVETA homepage", "https://www.tveta.go.ke/"),
    ("CDACC homepage", "https://www.cdacc-kenya.org/"),
    # KBDC
    ("KBDC homepage", "https://www.kbdc.co.ke/"),
    # OER
    ("Elimu.io", "https://elimu.io"),
    ("SchoolPlus Kenya", "https://schoolpluskenya.com"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

def probe(label, url, timeout=15):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        final_url = r.url if r.url != url else "(no redirect)"
        content_type = r.headers.get("Content-Type", "unknown").split(";")[0]
        # Heuristic: detect if it's actually a PDF or HTML
        is_pdf = content_type == "application/pdf" or r.content[:4] == b"%PDF"
        is_html = "html" in content_type.lower()
        size_mb = len(r.content) / (1024 * 1024)
        # If HTML, look for PDF links
        pdf_link_count = 0
        if is_html:
            pdf_link_count = r.text.lower().count(".pdf")
        status_label = "OK" if r.status_code == 200 else f"FAIL ({r.status_code})"
        kind = "PDF" if is_pdf else ("HTML" if is_html else content_type)
        print(f"  [{status_label}] {kind:8s} {size_mb:6.2f}MB  {label}")
        print(f"           final: {final_url}")
        if is_html and pdf_link_count > 0:
            print(f"           📄 Found {pdf_link_count} '.pdf' mentions in HTML (likely downloadable)")
        elif is_html and pdf_link_count == 0:
            print(f"           ⚠️  No '.pdf' links found — page may be JS-rendered or gated")
        return r.status_code == 200
    except requests.exceptions.SSLError as e:
        print(f"  [FAIL SSL] {label}")
        print(f"           {str(e)[:120]}")
        return False
    except requests.exceptions.ConnectionError as e:
        print(f"  [FAIL CONN] {label}")
        print(f"           {str(e)[:120]}")
        return False
    except requests.exceptions.Timeout:
        print(f"  [FAIL TIMEOUT] {label}")
        return False
    except Exception as e:
        print(f"  [FAIL] {label}: {type(e).__name__}: {str(e)[:120]}")
        return False

print("=" * 72)
print("Phase 97a — Probing Kenyan education data source URLs")
print("=" * 72)
print()

ok = 0
fail = 0
for label, url in URLS_TO_PROBE:
    if probe(label, url):
        ok += 1
    else:
        fail += 1
    print()

print("=" * 72)
print(f"Summary: {ok} reachable, {fail} failed, {len(URLS_TO_PROBE)} total")
print("=" * 72)
