#!/usr/bin/env zsh
set -euo pipefail

# generate_jobtrack_pg_key.sh
# Generate a secure random base64-encoded key suitable for JOBTRACK_PG_KEY.
# By default prints the generated key to stdout.
# Use -w to append an `JOBTRACK_PG_KEY=` line to an env file (default: .env.local).

usage() {
  cat <<EOF
Usage: $(basename $0) [-b bytes] [-w env_file]

Options:
  -b bytes      Number of random bytes to generate (default: 32 -> 256-bit)
  -w env_file   Append `JOBTRACK_PG_KEY='<key>'` to env_file (default: .env.local)
  -h            Show this help

Examples:
  # Print a 32-byte base64 key
  $(basename $0)

  # Generate a 48-byte key and append to .env.local
  $(basename $0) -b 48 -w .env.local
EOF
}

BYTES=32
WRITE_FILE=""

while getopts ":b:w:h" opt; do
  case $opt in
    b)
      BYTES=$OPTARG
      ;;
    w)
      WRITE_FILE=$OPTARG
      ;;
    h)
      usage
      exit 0
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      usage
      exit 2
      ;;
    :) 
      echo "Option -$OPTARG requires an argument." >&2
      usage
      exit 2
      ;;
  esac
done

# Try openssl first, fallback to python3's secrets if openssl missing
generate_key_openssl() {
  if command -v openssl >/dev/null 2>&1; then
    # openssl rand -base64 expects number of bytes
    openssl rand -base64 ${BYTES} 2>/dev/null || return 1
  else
    return 1
  fi
}

generate_key_python() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import secrets, base64, sys
n = int(sys.argv[1])
print(base64.b64encode(secrets.token_bytes(n)).decode())
PY
    return 0
  fi
  return 1
}

KEY=""
if KEY="$(generate_key_openssl)"; then
  :
elif KEY="$(generate_key_python ${BYTES})"; then
  :
else
  echo "ERROR: neither openssl nor python3 available to generate a key" >&2
  exit 1
fi

if [[ -n "$WRITE_FILE" ]]; then
  # Append an export line but do not overwrite existing file
  mkdir -p "$(dirname "$WRITE_FILE")" 2>/dev/null || true
  # Protect from accidental git commits by warning; user is responsible for .gitignore
  printf "# WARNING: this file contains secrets. Do not commit to VCS.\n" >> "$WRITE_FILE"
  printf "JOBTRACK_PG_KEY='%s'\n" "$KEY" >> "$WRITE_FILE"
  echo "Wrote JOBTRACK_PG_KEY to $WRITE_FILE (do NOT commit this file)"
  echo "Generated key: $KEY"
else
  echo "$KEY"
fi
