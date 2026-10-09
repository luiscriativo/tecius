/**
 * Longitude que o mapa deve pôr no centro para enquadrar um conjunto de pontos.
 *
 * O mapa é centrado no meridiano zero; pontos dos dois lados do Pacífico (Taiti
 * e Nova Zelândia, Japão e Califórnia) ficam um em cada borda. Aqui se acha o
 * menor arco de longitudes que contém todos (o complemento do maior vão entre
 * eles): se ele for bem menor que o intervalo "sem girar", o centro vai para o
 * meio desse arco. Senão fica no zero, a vista de sempre.
 */
export function bestCenterLng(lngs: number[], minGain = 30): number {
  const norm = (l: number) => ((((l + 180) % 360) + 360) % 360) - 180
  const s = [...new Set(lngs.map(norm))].sort((a, b) => a - b)
  if (s.length < 2) return 0
  // Maior vão entre longitudes vizinhas (o vão entre a última e a primeira dá a volta)
  let gap = s[0] + 360 - s[s.length - 1], start = s[0]
  for (let i = 1; i < s.length; i++) {
    const g = s[i] - s[i - 1]
    if (g > gap) { gap = g; start = s[i] }
  }
  const arc = 360 - gap
  const plain = s[s.length - 1] - s[0]
  if (plain - arc < minGain) return 0
  return Math.round(norm(start + arc / 2) * 100) / 100
}
