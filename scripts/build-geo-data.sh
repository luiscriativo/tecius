#!/usr/bin/env bash
# Regenera os dados geográficos offline em src/renderer/src/assets/geo/
# Fonte: Natural Earth (domínio público) — https://www.naturalearthdata.com
# Uso (só desenvolvimento; os JSON gerados ficam versionados):
#   bash scripts/build-geo-data.sh
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/src/renderer/src/assets/geo"
TMP="$(mktemp -d)"
cd "$TMP"
B=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_50m_admin_0_countries ne_50m_admin_1_states_provinces ne_10m_admin_1_states_provinces ne_10m_populated_places; do
  curl -sSL -o "$f.geojson" "$B/$f.geojson"
done
MS="npx --yes mapshaper@0.6"

# Polígonos (mapa base e destaque de país/estado)
$MS ne_50m_admin_0_countries.geojson -filter-fields ADM0_A3,NAME_PT,NAME \
  -rename-fields id=ADM0_A3,n=NAME_PT,en=NAME -simplify 25% keep-shapes \
  -o countries.json format=geojson precision=0.01
$MS ne_50m_admin_1_states_provinces.geojson -filter-fields iso_3166_2,name_pt,name,adm0_a3 \
  -each 'n = name_pt || name; id = iso_3166_2; c = adm0_a3' -filter-fields id,n,c \
  -simplify 25% keep-shapes -o regions.json format=geojson precision=0.01

# Centroides + raio aproximado (busca offline)
$MS ne_10m_admin_1_states_provinces.geojson \
  -each 'cx=+this.centroidX.toFixed(3); cy=+this.centroidY.toFixed(3); b=this.bounds; r=Math.round(Math.max(b[2]-b[0], b[3]-b[1])*111/2)' \
  -o adm1_points.json format=json
$MS ne_50m_admin_0_countries.geojson \
  -each 'cx=+this.centroidX.toFixed(3); cy=+this.centroidY.toFixed(3); b=this.bounds; r=Math.round(Math.max(b[2]-b[0], b[3]-b[1])*111/2)' \
  -o adm0_points.json format=json

# Índice compacto: países, estados/províncias e cidades
python3 - <<'EOF'
import json
c0 = json.load(open('adm0_points.json')); a1 = json.load(open('adm1_points.json'))
pp = json.load(open('ne_10m_populated_places.geojson'))
cname, countries, regions, cities = {}, [], [], []
for p in c0:
    nm = p.get('NAME_PT') or p['NAME']; cname[p['ADM0_A3']] = nm
    countries.append([p['ADM0_A3'], nm, p['NAME'], p['cx'], p['cy'], max(p['r'], 20)])
for p in a1:
    nm = p.get('name_pt') or p.get('name') or ''
    if nm:
        regions.append([p.get('iso_3166_2') or '', nm, cname.get(p.get('adm0_a3'), p.get('admin') or ''),
                        p['cx'], p['cy'], max(p['r'], 5), p.get('adm0_a3') or ''])
for f in pp['features']:
    p = f['properties']
    cities.append([p.get('NAME_PT') or p['NAME'], p.get('ADM1NAME') or '', cname.get(p.get('ADM0_A3'), p.get('ADM0NAME') or ''),
                   round(p['LONGITUDE'], 3), round(p['LATITUDE'], 3), int(p.get('POP_MAX') or 0), p.get('ADM0_A3') or ''])
cities.sort(key=lambda c: -c[5])
json.dump({'v': 1, 'source': 'Natural Earth (public domain)', 'countries': countries, 'regions': regions, 'cities': cities},
          open('gazetteer.json', 'w'), ensure_ascii=False, separators=(',', ':'))
EOF

cp countries.json regions.json gazetteer.json "$OUT/"
echo "Dados gerados em $OUT"
