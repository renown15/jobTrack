#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_PY = ROOT / 'app.py'
BACKUP = ROOT / 'app.py.bak.annotate_routes'

print(f'Backing up {APP_PY} -> {BACKUP}')
shutil.copy(APP_PY, BACKUP)

text = APP_PY.read_text()
lines = text.splitlines()
out_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.lstrip()
    if stripped.startswith('@app.route'):
        # Collect contiguous decorator block starting at i
        decorators = []
        j = i
        while j < len(lines) and lines[j].lstrip().startswith('@'):
            decorators.append(lines[j])
            j += 1
        # If the next line is a def, write decorators and annotate the defline
        if j < len(lines) and lines[j].lstrip().startswith('def '):
            defline = lines[j]
            out_lines.extend(decorators)
            if '->' not in defline:
                m = re.match(r'^(\s*def\s+[A-Za-z0-9_]+\s*\(.*\))\s*:(.*)$', defline)
                if m:
                    prefix = m.group(1)
                    suffix = m.group(2) or ''
                    newdef = f"{prefix} -> ResponseReturnValue:{suffix}"
                else:
                    idx = defline.rfind(')')
                    if idx != -1:
                        colon_idx = defline.find(':', idx)
                        if colon_idx != -1:
                            newdef = defline[:colon_idx] + ' -> ResponseReturnValue' + defline[colon_idx:]
                        else:
                            newdef = defline + ' -> ResponseReturnValue'
                    else:
                        newdef = defline
                out_lines.append(newdef)
            else:
                out_lines.append(defline)
            i = j + 1
            continue
        else:
            # No def after decorators; just emit collected decorators
            out_lines.extend(decorators)
            i = j
            continue
    else:
        out_lines.append(line)
        i += 1

new_text = """""".join(out_lines) + """"""
APP_PY.write_text(new_text)
print('Wrote annotated app.py (backup at app.py.bak.annotate_routes)')
