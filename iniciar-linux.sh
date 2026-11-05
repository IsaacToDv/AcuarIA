#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Falta Node.js o npm. Instala Node.js LTS (22.12 o superior) desde https://nodejs.org/ y vuelve a ejecutar este archivo.' >&2
  exit 1
fi
node scripts/check-node.cjs
printf '\nInstalando dependencias; se necesita conexión a Internet...\n'
npm ci
printf '\nIniciando acuarIA. Mantén esta terminal abierta; para salir pulsa Ctrl+C.\n'
exec npm run dev -- --open
