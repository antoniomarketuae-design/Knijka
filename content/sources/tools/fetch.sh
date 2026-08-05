#!/usr/bin/env bash
# Re-fetch every original pinned in content/sources/sources.json.
#
# Same contract as content/law and content/medical: the originals are NOT
# committed, sources.json pins each by URL, byte count and sha256, and
# verify.mjs re-checks every quote against the re-fetched bytes.
#
#   cd content/sources/tools && bash fetch.sh && node build.mjs .. && node verify.mjs ..
set -euo pipefail
cd "$(dirname "$0")"

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

get() { # get <outfile> <url>
  printf '  %-26s ' "$1"
  curl -sSL --max-time 180 -A "$UA" -w '%{http_code} %{size_download}B\n' -o "$1" "$2"
}

get nsi_ptp2023.pdf       'https://www.nsi.bg/sites/default/files/files/publications/PTP_2023.pdf'
get nsi_ptp2023_press.pdf 'https://www.nsi.bg/tsb/wp-content/uploads/2024/10/Traffic-accidents-2023-brgs.pdf'
# КРС serves the consolidated Правила from a directory whose name contains a
# space and Cyrillic; the URL below is the percent-encoded form curl needs.
get krs_pravila112.pdf    'https://crc.bg/files/2024%20%D0%B4%D0%B8%D1%80%D0%B5%D0%BA%D1%86%D0%B8%D1%8F%20%D0%9F%D1%80%D0%B0%D0%B2%D0%BD%D0%B0/Pravila%20za%20112%20-%20final%20(2024).pdf'
get ecc_report_324.pdf    'https://docdb.cept.org/download/3552'

echo "fetched. now: node build.mjs .. && node verify.mjs .."
