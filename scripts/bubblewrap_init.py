#!/usr/bin/env python3
"""Drive `bubblewrap init` interactively.

Answers all prompts with sensible defaults from bubblewrap-config.json,
and tells Bubblewrap to NOT install its own JDK (we provide JDK 17).
"""

import os
import sys
import time
import re
import pexpect

# Env
env = os.environ.copy()
env["JAVA_HOME"] = os.path.expanduser("~/jdk17")
env["PATH"] = (
    env["JAVA_HOME"] + "/bin:"
    + os.path.expanduser("~/android-sdk/cmdline-tools/latest/bin") + ":"
    + os.path.expanduser("~/android-sdk/platform-tools") + ":"
    + env["PATH"]
)
env["ANDROID_HOME"] = os.path.expanduser("~/android-sdk")
env["ANDROID_SDK_ROOT"] = env["ANDROID_HOME"]

# Use the local bubblewrap
BUBBLEWRAP = os.path.expanduser("~/.npm-global/bin/bubblewrap")

cmd = (
    f"{BUBBLEWRAP} init "
    f"--manifest https://studybudy-chi.vercel.app/manifest.json "
    f"--directory ./twa"
)

print(f"[+] Spawning: {cmd}", flush=True)
print(f"[+] JAVA_HOME={env['JAVA_HOME']}", flush=True)
print(f"[+] ANDROID_HOME={env['ANDROID_HOME']}", flush=True)

# Spawn with a pty so bubblewrap's TTY-aware prompts work
child = pexpect.spawn(
    cmd,
    env=env,
    cwd="/home/z/my-project",
    timeout=600,  # 10 min per individual expect
    encoding="utf-8",
    maxread=8192,
)
child.logfile = sys.stdout  # stream live

# Map of expected prompts -> answers. Empty string = press Enter (accept default).
answers = [
    # "Do you want Bubblewrap to install the JDK (recommended)?"
    ("install JDK", "n"),
    # "Path to your existing JDK 17:"
    ("Path to your existing JDK", env["JAVA_HOME"]),
    # If the manifest is good, it might still prompt for confirmation that
    # the manifest is valid — accept default.
    ("Hostname for the app", "studybudy-chi.vercel.app"),
    # Start URL
    ("start URL", "/"),
    # App name
    ("name for the app", "StudyBuddy AI"),
    # Launcher name
    ("Launcher name", "StudyBuddy"),
    # Package ID
    ("package id", "ai.studybuddy.app"),
    # Version code
    ("version code", "1"),
    # Display mode — accept default standalone
    ("display mode", ""),
    # Orientation
    ("orientation", ""),
    # Theme color
    ("theme color", "#4F46E5"),
    # Background color
    ("background color", "#ffffff"),
    # Icon URL
    ("icon", "/icon-512.png"),
    # Maskable icon — accept default
    ("maskable icon", ""),
    # Monochrome icon — accept default (no)
    ("monochrome icon", ""),
    # Signing key path
    ("key path", "./android.keystore"),
    # Signing key alias
    ("alias", "studybuddy"),
    # Key full name
    ("full name", "StudyBuddy"),
    # Org unit
    ("organizational unit", "App"),
    # Organization
    ("organization", "StudyBuddy"),
    # Country (2 letters)
    ("country", "US"),
    # Keystore password
    ("keystore password", "studybuddy"),
    # Key password
    ("key password", "studybuddy"),
]

# Patterns we expect to be done
done_pattern = pexpect.EOF

i = 0
matched = 0
while True:
    # Build pattern list — case-insensitive contains match for any prompt
    patterns = [pexpect.EOF, pexpect.TIMEOUT] + [
        re.compile(p, re.IGNORECASE) for p, _ in answers
    ]
    try:
        idx = child.expect(patterns, timeout=120)
    except pexpect.TIMEOUT:
        print(f"\n[!] Timeout waiting for prompt. Last output:", flush=True)
        print(child.before, flush=True)
        sys.exit(2)

    if idx == 0:  # EOF — done
        print("\n[+] Bubblewrap init finished (EOF).", flush=True)
        break
    if idx == 1:  # Timeout
        print(f"\n[!] Timeout. Last output:\n{child.before}", flush=True)
        sys.exit(3)

    # Matched prompt idx-2 in the answers list
    prompt_text, answer = answers[idx - 2]
    print(f"\n[+] Answering '{prompt_text}' -> '{answer}'", flush=True)
    child.sendline(answer)
    matched += 1
    time.sleep(0.2)

# Wait for process to fully exit
child.expect(pexpect.EOF, timeout=120)
print(f"\n[+] Exit status: {child.exitstatus}", flush=True)
sys.exit(child.exitstatus or 0)
