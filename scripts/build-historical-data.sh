#!/usr/bin/env bash
# Regenera as fronteiras históricas offline em src/renderer/src/assets/geo/historical/
# Fonte: historical-basemaps (André Ourednik e colaboradores) — GPL-3.0
#   https://github.com/aourednik/historical-basemaps
# Os mapas são simplificados para escala de mapa-múndi (mapshaper): polígonos
# muito pequenos saem e as linhas ficam com menos vértices.
# Uso (só desenvolvimento; os JSON gerados ficam versionados):
#   bash scripts/build-historical-data.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src/renderer/src/assets/geo/historical"
REPO=aourednik/historical-basemaps
TMP="$(mktemp -d)"
cd "$TMP"

# Fixa o commit usado (proveniência dos dados derivados)
COMMIT=$(curl -sSL "https://api.github.com/repos/$REPO/commits/master" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])')
FILES=$(curl -sSL "https://api.github.com/repos/$REPO/contents/geojson?ref=$COMMIT" \
  | python3 -c 'import json,sys; print(" ".join(x["name"] for x in json.load(sys.stdin) if x["name"].startswith("world_")))')

rm -rf "$OUT"; mkdir -p "$OUT"
YEARS=()
for f in $FILES; do
  curl -sSL -o "$f" "https://raw.githubusercontent.com/$REPO/$COMMIT/geojson/$f"
  # world_1492 → 1492 · world_bc500 → -500 (ano negativo = a.C., como no resto do app)
  base="${f%.geojson}"; y="${base#world_}"
  if [[ "$y" == bc* ]]; then y="-${y#bc}"; fi
  npx --yes mapshaper@0.6 "$f" -filter-fields NAME,SUBJECTO,BORDERPRECISION \
    -each 'NAME = NAME || ""; SUBJECTO = SUBJECTO || NAME; BORDERPRECISION = BORDERPRECISION || 1' \
    -dissolve2 NAME,SUBJECTO,BORDERPRECISION \
    -filter-islands min-area=5000km2 remove-empty -filter 'this.area > 5e9' \
    -simplify 3% keep-shapes -filter-slivers \
    -rename-fields n=NAME,s=SUBJECTO,p=BORDERPRECISION \
    -o "$OUT/$y.json" format=geojson precision=0.02 > /dev/null
  YEARS+=("$y")
done

python3 - "$OUT" "$COMMIT" "${YEARS[@]}" <<'PY'
import json, sys
out, commit, years = sys.argv[1], sys.argv[2], sorted(int(y) for y in sys.argv[3:])
json.dump({'source': 'https://github.com/aourednik/historical-basemaps', 'commit': commit,
           'license': 'GPL-3.0', 'years': years},
          open(f'{out}/../historical-index.json', 'w'), separators=(',', ':'))
PY

# Nomes em português (títulos equivalentes da Wikipédia + correções revisadas)
python3 "$ROOT/scripts/translate-historical-names.py" "$OUT" > "$OUT/../historical-names-pt.json"

cat > "$OUT/NOTICE.md" <<NOTICE
# Fronteiras históricas

Derivado de [historical-basemaps](https://github.com/$REPO) (commit \`$COMMIT\`),
de André Ourednik e colaboradores, licenciado sob a GNU General Public License v3.0.

Modificações: campos reduzidos a NAME/SUBJECTO/BORDERPRECISION (renomeados n/s/p),
polígonos com menos de 5000 km² removidos e geometria simplificada (mapshaper),
conforme \`scripts/build-historical-data.sh\`. Os nomes em português
(\`historical-names-pt.json\`) vêm dos títulos equivalentes na Wikipédia, com
correções feitas à mão (\`scripts/translate-historical-names.py\`).
NOTICE

du -sh "$OUT"
echo "Fronteiras geradas em $OUT (${#YEARS[@]} mapas)"
