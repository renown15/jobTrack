#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pattern = re.compile(
    r"(?P<prefix>f?)(?P<quote>['\"])\\n(?P<body>.*?)(?P=quote)", re.DOTALL
)

py_files = list(ROOT.rglob("*.py"))
changed_files = []
for p in py_files:
    if "venv" in str(p) or "build" in str(p):
        continue
    text = p.read_text(encoding="utf-8")

    def repl(m):
        prefix = m.group("prefix") or ""
        body = m.group("body")
        # Replace escaped \n with real newlines
        new = body.replace("\\n", """""")
        # Trim a leading newline if present due to pattern
        if new.startswith(""""""):
            new = new[1:]
        # Strip trailing spaces on lines produced
        lines = new.split("""""")
        # Normalize indentation: remove common leading indent from lines after first
        if len(lines) > 1:
            # Determine minimal indent of non-empty lines after first
            indents = [
                len(re.match(r"^(\s*)", ln).group(1)) for ln in lines[1:] if ln.strip()
            ]
            min_indent = min(indents) if indents else 0
            if min_indent > 0:
                for i in range(1, len(lines)):
                    if len(lines[i]) >= min_indent:
                        lines[i] = lines[i][min_indent:]
        new = """""".join(lines)
        # Escape triple quotes inside body
        new = new.replace('"""', '"""')
        return f'{prefix}"""{new}"""'

    new_text, n = pattern.subn(repl, text)
    if n > 0 and new_text != text:
        p.write_text(new_text, encoding="utf-8")
        changed_files.append((p, n))

print(f"Processed {len(py_files)} .py files, updated {len(changed_files)} files")
for p, n in changed_files:
    print(f"Updated {p}: {n} replacements")
