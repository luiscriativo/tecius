#!/usr/bin/env python3
"""
Traduz para português os nomes das fronteiras históricas (historical-basemaps).

Para cada nome, consulta a Wikipédia em inglês pelo título (seguindo
redirecionamentos, ignorando páginas de desambiguação) e usa o título da página
equivalente em português. Depois aplica correções revisadas à mão: casos em que
o título coincidiu com outro assunto, grafias de Portugal → Brasil, e sufixos
coloniais ("(Spain)" → "(Espanha)").

Uso (chamado por scripts/build-historical-data.sh):
  python3 scripts/translate-historical-names.py <pasta dos mapas> > historical-names-pt.json
Saída: { "nome em inglês": "nome em português" } só para os nomes que mudam.
"""

import glob
import json
import re
import sys
import time
import urllib.parse
import urllib.request

# Títulos que coincidiram com outro assunto, ou nomes melhores para um mapa histórico.
# None = manter o nome original.
OVERRIDES = {
    '?': None, 'Air': None, 'Kali': None, 'Miller': None, 'Nasa': None, 'Pewa': None, 'Qom': None,
    'Rayados (Borrados)': None, 'Waka Waka': None, 'Pit River': None, 'Valdivia': None, 'Oxus': None,
    'Pagan': 'Reino de Pagã', 'Bagan': 'Reino de Pagã', 'Hail': 'Emirado de Hail', 'Fox': 'Fox (Meskwaki)',
    'Mon-Khmer': 'Mon-Khmer', 'Persia': 'Pérsia', 'Burma': 'Birmânia', 'Ceylon': 'Ceilão', 'Ceylon (Dutch)': 'Ceilão (Países Baixos)',
    'Siam': 'Sião', 'Greek city-states': 'Cidades-estado gregas', 'city-states': 'Cidades-estado',
    'Islamic states': 'Estados islâmicos', 'Slavic tribes': 'Tribos eslavas', 'Babylonia': 'Babilônia',
    'Carthaginian Empire': 'Império Cartaginês', 'Hunnic Empire': 'Império Huno', 'Jin Empire': 'Império Jin',
    'Han Empire': 'Império Han', 'Ming Empire': 'Império Ming', 'Qing Empire': 'Império Qing',
    'Song Empire': 'Império Song', 'Sui Empire': 'Império Sui', 'Tang Empire': 'Império Tang',
    'Great Khanate': 'Grande Canato (Yuan)', 'Eastern Roman Empire': 'Império Romano do Oriente',
    'Erie': 'Eries', 'Omaha': 'Omahas', 'Peoria': 'Peorias', 'Kandy': 'Reino de Kandy',
    'Bosnia': 'Bósnia', 'Swiss Confederation': 'Confederação Suíça', 'Sardinia-Piedmont': 'Reino da Sardenha',
    'Mauretania': 'Mauritânia', 'Massachusetts Bay': 'Colônia da Baía de Massachusetts',
    'Portuguese East Africa': 'África Oriental Portuguesa', 'Imerina': 'Reino Merina', 'Merina Kingdom': 'Reino Merina',
    'Sixteen Kingdoms': 'Dezesseis Reinos', 'Ibadites': 'Ibaditas', 'Fulani Empire': 'Império Fula',
    'Vedic Aryans': 'Arianos védicos', 'Saka Kingdom': 'Reino Saka', 'Kushites': 'Cuxitas', 'Rajputs': 'Rajputes',
    'Württemberg': 'Württemberg', 'Holstein': 'Holstein', 'Schleswig': 'Schleswig', 'Novgorod': 'Novgorod',
    'Principality of Novgorod': 'Principado de Novgorod', 'Principality of Polotsk': 'Principado de Polotsk',
    'Hainan': 'Hainan', 'Assam': 'Assam', 'Mon state': 'Mon', 'Orissa': 'Orissa',
    'Ireland': 'Irlanda', 'Irlanda': None, 'Athabascan': 'Atabascanos', 'Athabaskan': 'Atabascanos',
    'Luisiana': None, 'Senas': 'Senas', 'Kanem-Bornu': 'Canem-Bornu',
    'Castille': 'Castela', 'Wattasid Caliphate': 'Sultanato Oatácida',
}

# Descrições genéricas sem página própria na Wikipédia (as que cobrem áreas maiores)
OVERRIDES.update({
    'Paleo-Siberian hunter-gatherers': 'Caçadores-coletores paleossiberianos',
    'Arctic marine mammal hunters': 'Caçadores de mamíferos marinhos do Ártico',
    'Australian aboriginal hunter-gatherers': 'Caçadores-coletores aborígenes australianos',
    'Tasmanian hunter-gatherers': 'Caçadores-coletores da Tasmânia',
    'West African cereal farmers': 'Agricultores de cereais da África Ocidental',
    'Finno-Ugric taiga hunter-gatherers': 'Caçadores-coletores fino-úgricos da taiga',
    'Amazon hunter-gatherers': 'Caçadores-coletores amazônicos',
    'Savanna hunter-gatherers': 'Caçadores-coletores da savana',
    'Desert hunter-gatherers': 'Caçadores-coletores do deserto',
    'Andean hunter-gatherers': 'Caçadores-coletores andinos',
    'Caribbean hunter-gatherers': 'Caçadores-coletores do Caribe',
    'Subarctic forest hunter-gatherers': 'Caçadores-coletores das florestas subárticas',
    'Eastern North American hunter-gatherers': 'Caçadores-coletores do leste da América do Norte',
    'Archaic Amerindian hunter-gatherers': 'Caçadores-coletores ameríndios arcaicos',
    'Hunters-gatherers': 'Caçadores-coletores',
    'Mesoamerican hunter-gatherers and maïze farmers': 'Caçadores-coletores e agricultores de milho mesoamericanos',
    'Patagonian shellfish and marine mammal hunters': 'Caçadores de mariscos e mamíferos marinhos da Patagônia',
    'Plateau fichers and hunter gatherers': 'Pescadores e caçadores-coletores do planalto',
    'North American Pacific foraging, hunting and fishing peoples': 'Povos coletores, caçadores e pescadores do Pacífico norte-americano',
    'Shellfish gatherers': 'Coletores de mariscos',
    'Plain bison hunters': 'Caçadores de bisões das planícies',
    'Saharan pastoral nomads': 'Nômades pastoris do Saara',
    'Arabian pastoral nomads': 'Nômades pastoris da Arábia',
    'Saharan Nomadic Tribes': 'Tribos nômades do Saara',
    'Tuareg Nomadic Tribes': 'Tribos nômades tuaregues',
    'Iranian pastoralists': 'Pastores iranianos',
    'Proto-Altaic pastoralists': 'Pastores proto-altaicos',
    'Manioc farmers': 'Agricultores de mandioca',
    'Maize farmers': 'Agricultores de milho',
    'Ethiopian highland farmers': 'Agricultores do planalto etíope',
    'Papuan neolithic farmers': 'Agricultores neolíticos papuas',
    'Austro-Asiatic rice cultures': 'Culturas austro-asiáticas do arroz',
    'Proto-Tibetan cultures': 'Culturas prototibetanas',
    'N. European Bronze Age cultures': 'Culturas da Idade do Bronze do norte da Europa',
    'Pampas cultures': 'Culturas dos pampas',
    'Siberians': 'Siberianos', 'Bantu': 'Bantos', 'Bantu peoples': 'Povos bantos', 'Papuans': 'Papuas',
    'Aboriginal tribes': 'Tribos aborígenes', 'Berber Tribes': 'Tribos berberes',
    'Manchu Empire': 'Império Manchu', 'Ming Chinese Empire': 'Império Ming', 'Empire of Alexander': 'Império de Alexandre',
    'White Russia': 'Rússia Branca', 'central Asian khanates': 'Canatos da Ásia Central', 'Zhou states': 'Estados Zhou',
    'Chinese Warlords': 'Senhores da guerra chineses', 'Chinese warlords': 'Senhores da guerra chineses',
    'Post-Ming Warlords': 'Senhores da guerra pós-Ming',
    'Hindu kingdoms': 'Reinos hindus', 'minor Hindu kingdoms': 'Reinos hindus menores',
    'Hindu kingdoms and republics': 'Reinos e repúblicas hindus', 'minor Hindu and Buddhist states': 'Estados hindus e budistas menores',
    'Islamic and Hindu states': 'Estados islâmicos e hindus', 'Malaysian Islamic states': 'Estados islâmicos malaios',
    'Islamic city-states': 'Cidades-estado islâmicas', 'Rajput kingdoms': 'Reinos rajputes',
    'Rajput Clans and Small States': 'Clãs e pequenos estados rajputes', 'Burmese kingdoms': 'Reinos birmaneses',
    'Mesoamerican city-states and chiefdoms': 'Cidades-estado e chefaturas mesoamericanas',
    'Maya city-states': 'Cidades-estado maias', 'Maya states': 'Estados maias', 'Maya chiefdoms and states': 'Chefaturas e estados maias',
    'Andean states and chiefdoms': 'Estados e chefaturas andinos', 'Aymara kingdoms': 'Reinos aimarás',
    # Antiguidade e pré-história (rótulos mais visíveis nos mapas antes de Cristo)
    'Saami': 'Sámis', 'Sinic': 'Povos siníticos', 'Burmese': 'Birmaneses', 'Thai': 'Tais', 'Malays': 'Malaios',
    'Papuan': 'Papuas', 'Ainu': 'Ainus', 'Arameans': 'Arameus', 'Phrygians': 'Frígios', 'Saces': 'Sacas',
    'Paleo-Koreans': 'Paleocoreanos', 'Tibeto-Burmanese': 'Tibeto-birmaneses', 'Turcik tribes': 'Tribos túrquicas',
    'Anatolian tribes': 'Tribos anatólias', 'Kush': 'Reino de Cuxe', 'Saba': 'Sabá', 'minor states': 'Estados menores',
    'Kingdom of Antigonus': 'Reino de Antígono', 'Kingdom of David and Solomon': 'Reino de Davi e Salomão',
    'Kingdom of Syphax': 'Reino de Sífax', 'state societies and Aramaean kingdoms': 'Sociedades estatais e reinos arameus',
    'Hopewell Culture': 'Cultura Hopewell', 'Swift Creek Culture': 'Cultura Swift Creek', 'Marksville Culture': 'Cultura Marksville',
    'Karasuk culture': 'Cultura Karasuk', 'Kelteminar culture': 'Cultura Kelteminar', 'Late Jomon culture': 'Cultura Jomon tardia',
    'Brushed Pottery culture': 'Cultura da cerâmica escovada', 'Plain-Pottery culture': 'Cultura da cerâmica lisa',
    'Funnel-Beaker': 'Cultura dos vasos de funil', 'Early combware': 'Cultura da cerâmica pentiforme',
    'Bell-shaped burials culture': 'Cultura dos sepultamentos campaniformes', 'Proto-Thai cultures': 'Culturas proto-tai',
    'Iron Age megalith cultures': 'Culturas megalíticas da Idade do Ferro', 'Iron Age chieftainships': 'Chefaturas da Idade do Ferro',
    'Veracruz civilization': 'Civilização de Veracruz',
    'Coastal and Woodland Mesolithic Hunter-Foragers': 'Caçadores-coletores mesolíticos do litoral e das florestas',
    'Steppe Mesolithic Hunter-Foragers': 'Caçadores-coletores mesolíticos das estepes',
    'Alluvial Lowland Mesolithic Hunter-Foragers': 'Caçadores-coletores mesolíticos das planícies aluviais',
})

# Grafias de Portugal (comuns na Wikipédia lusófona) → Brasil
PT_BR = {
    'Arménia': 'Armênia', 'Estónia': 'Estônia', 'Génova': 'Gênova', 'Letónia': 'Letônia', 'Polónia': 'Polônia',
    'Eslovénia': 'Eslovênia', 'Quénia': 'Quênia', 'Iémen': 'Iêmen', 'Gronelândia': 'Groenlândia',
    'Madagáscar': 'Madagascar', 'Caledónia': 'Caledônia', 'Amsterdão': 'Amsterdã', 'Colónia': 'Colônia',
    'Teutónica': 'Teutônica', 'Checoslováquia': 'Tchecoslováquia', 'Chéquia': 'Tchéquia', 'Checos': 'Tchecos',
    'Usbequistão': 'Uzbequistão', 'Tunes': 'Túnis', 'Dezasseis': 'Dezesseis', 'Turquemenistão': 'Turcomenistão',
    'Sénas': 'Senas', 'Macedónia': 'Macedônia',
}

# Sufixos entre parênteses (potência colonial, imperador, observação)
SUFFIXES = {
    'FR': 'França', 'France': 'França', 'Spain': 'Espanha', 'UK': 'Reino Unido', 'GB': 'Reino Unido',
    'USA': 'EUA', 'USSR': 'URSS', 'Soviet': 'URSS', 'Portugal': 'Portugal', 'Belgium': 'Bélgica',
    'Austria': 'Áustria', 'Dutch': 'Países Baixos', 'Netherlands': 'Países Baixos', 'Italy': 'Itália',
    'IT': 'Itália', 'RU': 'Rússia', 'Danemark': 'Dinamarca', 'Egypt': 'Egito',
    'Indian princely state': 'estado principesco indiano', 'Warring States': 'Período Sengoku',
    'Constantinus': 'Constantino', 'Diocletianus': 'Diocleciano', 'Galerius': 'Galério', 'Maximian': 'Maximiano',
    'Frech Lybia': 'Líbia Francesa', 'UK Lybia': 'Líbia Britânica', 'Amazónico': 'amazônico',
}

UA = {'User-Agent': 'Tecius-build/1.0 (https://github.com/luiscriativo/tecius)'}


def wiki(params):
    url = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})
    for attempt in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
        except Exception:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'Falha ao consultar a Wikipédia: {url}')


def split_suffix(name):
    """'Algeria (France)' → ('Algeria', 'France')"""
    m = re.match(r'^(.*?)\s*\(([^()]*)\)$', name)
    return (m.group(1), m.group(2)) if m else (name, None)


def clean_pt(title):
    title = re.sub(r'\s*\([^)]*\)$', '', title)          # "Irlanda (ilha)" → "Irlanda"
    if re.match(r'^Língua ', title):                     # página da língua, não do povo
        return None
    title = re.sub(r'^Povo ', '', title)
    title = title[:1].upper() + title[1:]
    for pt, br in PT_BR.items():
        title = re.sub(rf'\b{pt}\b', br, title)
    return title


def main():
    folder = sys.argv[1]
    names = sorted({f['properties']['n'] for p in glob.glob(folder + '/*.json')
                    for f in json.load(open(p))['features'] if f['properties']['n']})
    print(f'{len(names)} nomes', file=sys.stderr)

    found = {}   # título consultado → título em português
    bases = sorted({split_suffix(n)[0] for n in names})
    for i in range(0, len(bases), 50):
        batch = bases[i:i + 50]
        d = wiki({'action': 'query', 'titles': '|'.join(batch), 'redirects': 1, 'prop': 'langlinks|pageprops',
                  'lllang': 'pt', 'lllimit': 'max', 'ppprop': 'disambiguation'})['query']
        alias = {r['from']: r['to'] for k in ('normalized', 'redirects') for r in d.get(k, [])}
        pages = {p['title']: p for p in d.get('pages', [])}
        for b in batch:
            t = b
            while t in alias:
                t = alias[t]
            p = pages.get(t)
            if not p or p.get('missing') or 'disambiguation' in p.get('pageprops', {}) or not p.get('langlinks'):
                continue
            pt = clean_pt(p['langlinks'][0]['title'])
            if pt:
                found[b] = pt
        time.sleep(0.2)

    out = {}
    for n in names:
        if n in OVERRIDES:
            if OVERRIDES[n] is not None and OVERRIDES[n] != n:
                out[n] = OVERRIDES[n]
            continue
        base, suffix = split_suffix(n)
        pt_base = OVERRIDES.get(base, found.get(base)) if base in OVERRIDES else found.get(base)
        pt_base = pt_base or base
        pt_suffix = SUFFIXES.get(suffix, suffix) if suffix is not None else None
        pt = f'{pt_base} ({pt_suffix})' if pt_suffix is not None else pt_base
        if pt != n:
            out[n] = pt
    print(f'{len(out)} traduzidos', file=sys.stderr)
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


if __name__ == '__main__':
    main()
