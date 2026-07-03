#!/usr/bin/env bash
set -euo pipefail

password=''
if [[ -t 0 ]]; then
  read -r -s -p 'Contraseña: ' password
  printf '\n' >&2
else
  IFS= read -r password || true
fi

if [[ -z "$password" ]]; then
  printf 'Error: la contraseña no puede estar vacía.\n' >&2
  exit 1
fi

printf '%s' "$password" | pnpm exec tsx src/hash-password-cli.ts
unset password
