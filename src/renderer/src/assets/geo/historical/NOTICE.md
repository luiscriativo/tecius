# Fronteiras históricas

Derivado de [historical-basemaps](https://github.com/aourednik/historical-basemaps) (commit `da7a4b735ecef70aebdc9c73e409d8a2500d50f3`),
de André Ourednik e colaboradores, licenciado sob a GNU General Public License v3.0.

Modificações: campos reduzidos a NAME/SUBJECTO/BORDERPRECISION (renomeados n/s/p),
polígonos com menos de 5000 km² removidos e geometria simplificada (mapshaper),
conforme `scripts/build-historical-data.sh`. Os nomes em português
(`historical-names-pt.json`) vêm dos títulos equivalentes na Wikipédia, com
correções feitas à mão (`scripts/translate-historical-names.py`).
