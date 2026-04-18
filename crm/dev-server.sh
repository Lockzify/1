#!/usr/bin/env bash
# Startet das CRM lokal und ist im WLAN vom Handy erreichbar (Bindung 0.0.0.0).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8000}"

cd "$ROOT"

LAN=""
for IFACE in en0 en1 bridge0; do
  IP="$(ipconfig getifaddr "$IFACE" 2>/dev/null || true)"
  if [[ -n "$IP" ]]; then
    LAN="$IP"
    break
  fi
done

echo "CRM (alle Schnittstellen):  http://127.0.0.1:${PORT}/crm/"
if [[ -n "$LAN" ]]; then
  echo "Im gleichen WLAN (Handy):  http://${LAN}:${PORT}/crm/"
else
  echo "LAN-IP nicht ermittelt – im Mac unter Netzwerk → WLAN nachsehen."
fi
echo ""
echo "Strg+C zum Beenden."
echo ""

exec php -S "0.0.0.0:${PORT}"
