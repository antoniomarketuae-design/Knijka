#!/usr/bin/env bash
# Re-fetch every original in content/medical/sources.json.
#
# The originals are NOT committed (see .gitignore) — sources.json pins each by
# URL, byte count and sha256, exactly like content/law. Run this, then
# build-sources.mjs, then verify-claims.mjs; if a guideline changed under a
# quote, verify-claims.mjs fails instead of letting a stale figure ship.
#
#   cd content/medical/tools && bash fetch.sh && node build-sources.mjs .. && node verify-claims.mjs ..
set -euo pipefail
cd "$(dirname "$0")"

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

get() { # get <outfile> <url>
  printf '  %-28s ' "$1"
  curl -sSL --max-time 180 -A "$UA" -w '%{http_code} %{size_download}B\n' -o "$1" "$2"
}

# resus.org.uk answers 403 to a default curl/wget UA. That is the whole reason
# an earlier attempt recorded "could not re-fetch"; -A above fixes it.
get naredba24_lex.html    'https://lex.bg/laws/ldoc/2135461835'
get naredba24.pdf         'https://www.sars.gov.bg/wp-content/uploads/2023/07/%D0%9D%D0%B0%D1%80%D0%B5%D0%B4%D0%B1%D0%B0-%E2%84%96-24-%D0%BE%D1%82-2-%D0%B4%D0%B5%D0%BA%D0%B5%D0%BC%D0%B2%D1%80%D0%B8-2002-%D0%B3.pdf'
get erc2025_layperson.pdf 'https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf'
get rcuk_bls.html         'https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines'
get rcuk_fa.html          'https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines'
get bchk_bls.html         'https://www.redcross.bg/first-help/-----------.-------------------------------------------.html'
get bchk_page5.html       'https://www.redcross.bg/first-help/page-5.html'
get bchk_course25.html    'https://firstaid.redcross.bg/home/courseinfo/25'

echo "fetched. now: node build-sources.mjs .. && node verify-claims.mjs .."
