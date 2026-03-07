#!/usr/bin/env python3
"""Lightweight wrapper that runs the real tool from `tools/`.

This keeps the canonical implementation in `tools/` (excluded from mypy)
while preserving the old `scripts/` entrypoint for convenience.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(__file__)
TOOLS_SCRIPT = os.path.join(HERE, "..", "tools", "check_nav_decrypt.py")

if not os.path.exists(TOOLS_SCRIPT):
    print("tools/check_nav_decrypt.py not found; please run the tool from tools/")
    sys.exit(1)

subprocess.run([sys.executable, TOOLS_SCRIPT], check=True)
