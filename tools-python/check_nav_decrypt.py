#!/usr/bin/env python3
import base64
import os

print('running check_nav_decrypt')
try:
    from jobtrack_core import db as jobdb
except Exception as e:
    print('failed to import jobtrack_core.db:', e)
    raise

pgk = os.environ.get('JOBTRACK_PG_KEY')
print('JOBTRACK_PG_KEY present:', bool(pgk))

with jobdb.get_conn() as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT briefingid, questionanswer FROM navigatorapplicantbriefing ORDER BY briefingid DESC LIMIT 20;')
        rows = cur.fetchall()

    if not rows:
        print('no rows found')

    for r in rows:
        try:
            bid = r[0]
            raw = r[1]
        except Exception:
            # dict-like
            bid = r.get('briefingid') if isinstance(r, dict) else None
            raw = r.get('questionanswer') if isinstance(r, dict) else None

        print("""--- briefingid""", bid, '---')
        print('raw (first 200 chars):', (raw or '')[:200])
        # normalize by stripping whitespace/newlines which may be present from storage
        norm = None
        if isinstance(raw, str):
            norm = ''.join(raw.split())
            if norm != raw:
                print('normalized (first 200 chars):', norm[:200])
        else:
            norm = raw
        if raw is None:
            print('raw is None')
            continue
        # try base64 validate
        try:
            base64.b64decode(norm, validate=True)
            print('looks like base64 (after normalization)')
            if pgk:
                try:
                    with conn.cursor() as dec_cur:
                        dec_cur.execute("SELECT pgp_sym_decrypt(decode(%s, 'base64')::bytea, %s)::text", (norm, pgk))
                        dec = dec_cur.fetchone()
                        if dec is None:
                            print('db decrypted result: NULL')
                        else:
                            # dec may be a single-column row tuple or string depending on cursor
                            val = dec[0] if isinstance(dec, (list, tuple)) else dec
                            print('db decrypted result (first 400 chars):', (val or '')[:400])
                except Exception as e:
                    print('db decryption failed:', e)
            else:
                print('no pg key available')
        except Exception as e:
            print('not base64 or invalid:', e)
            try:
                # attempt application-level decrypt fallback from navigator module
                import jobtrack_navigator_ai.__init__ as navmod
                dec_app = navmod._decrypt_answer(raw)
                print('app-level decrypt result (first 400 chars):', (dec_app or '')[:400])
            except Exception as e2:
                print('app-level decrypt failed:', e2)

print("""check complete""")

