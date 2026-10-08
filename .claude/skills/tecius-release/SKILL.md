---
name: tecius-release
description: >
  Lança uma nova versão do Tecius (app Electron) pelo GitHub Actions: confere se o
  código local já está no GitHub, ajuda a escolher o tipo de versão, orienta o clique
  em "Run workflow" e acompanha o run até a release publicada. Use sempre que o usuário
  quiser criar uma release, publicar ou lançar uma versão, subir a versão, distribuir
  o app ou gerar instaladores — "criar release", "publicar versão", "nova versão tecius",
  "release tecius", "lançar versão", "fazer release", "gerar instalador" — mesmo sem
  essas palavras exatas.
---

# Tecius Release

Os instaladores são gerados pelo GitHub Actions (`.github/workflows/release.yml`), não
nesta máquina: cada sistema e arquitetura (Windows x64/ARM, Mac Apple Silicon/Intel,
Linux x64/ARM) é
compilado numa máquina própria, porque o bytecode do `scripts/protect.js` é específico da
arquitetura. O workflow sobe a versão, faz o commit "Versão X.Y.Z" na `main`, cria a tag
e publica a release — só se todos os builds passarem.

O usuário entra no GitHub com a conta do Google: **não tem senha nem token, e nunca peça
um**. Envio de commits é pelo VS Code (Sync / Push). Você não dispara o workflow — o
usuário clica em "Run workflow"; você prepara, orienta e acompanha.

Fale sempre em português (pt-BR).

**Repositório:** https://github.com/luiscriativo/tecius (público) · **Branch:** `main`

---

## Passo 1 — Projeto

Use a pasta atual se o `package.json` dela tiver `"name"` do Tecius e existir
`.github/workflows/release.yml`. Senão, pergunte onde está o projeto. Guarde como
`PROJECT_DIR` e use `git -C "<PROJECT_DIR>"` nos comandos git.

## Passo 2 — O GitHub tem tudo que vai na versão?

O workflow gera a versão a partir do que está **no GitHub**, não nesta máquina.

```bash
git -C "<PROJECT_DIR>" fetch origin
git -C "<PROJECT_DIR>" status -sb
git -C "<PROJECT_DIR>" status --short
```

- **Alterações não commitadas:** mostre a lista de arquivos e pergunte se entram na
  versão. Se sim, ofereça fazer o commit (mensagem curta, no estilo do usuário, ex.:
  "Ajustes no mapa") e peça para ele enviar pelo VS Code (**Sync / Push**). Se não, siga
  — elas ficam de fora.
- **`ahead` (commits não enviados):** peça para enviar pelo VS Code antes de continuar.
- **`behind`:** peça **Sync / Pull** antes — provavelmente o commit de uma versão anterior.
- Confira de novo depois que ele disser que enviou.

Rode também, como sanidade (o workflow repete isso, mas falhar aqui economiza 15 min):

```bash
npm --prefix "<PROJECT_DIR>" run typecheck && npm --prefix "<PROJECT_DIR>" test
```

## Passo 3 — Tipo de versão

Leia a versão atual do `package.json` e explique:

| Tipo | Exemplo | Quando usar |
|---|---|---|
| **patch** | 1.5.0 → 1.5.1 | só correções de bugs |
| **minor** | 1.5.0 → 1.6.0 | funcionalidades novas, nada quebrado |
| **major** | 1.5.0 → 2.0.0 | mudança grande ou incompatível |

Sugira um tipo com base nos commits desde a última tag
(`git -C "<PROJECT_DIR>" log $(git -C "<PROJECT_DIR>" describe --tags --abbrev=0)..origin/main --oneline`)
e deixe o usuário decidir. **Não edite o `package.json`** — o workflow sobe a versão.

## Passo 4 — Rodar o workflow

> 1. Abra https://github.com/luiscriativo/tecius/actions/workflows/release.yml
> 2. Clique em **Run workflow** → branch **main** → em "Tipo de versão" escolha **<tipo>**
> 3. Deixe **Publicar** marcado (ou desmarque para revisar como rascunho antes) → **Run workflow**
> 4. Me avise quando clicar.

Opção **teste**: só gera os builds (sem versão nem release) — útil para testar mudanças
no próprio processo de build.

## Passo 5 — Acompanhar

O repositório é público: dá para acompanhar sem login. Rode em segundo plano, a cada
~90 s, até o run terminar ou um job falhar:

```bash
node -e "
const api='https://api.github.com/repos/luiscriativo/tecius';
const get=u=>fetch(u,{headers:{'User-Agent':'tecius-release'}}).then(r=>r.json());
(async()=>{const r=(await get(api+'/actions/workflows/release.yml/runs?per_page=1')).workflow_runs[0];
console.log('RUN',r.status,r.conclusion??'',r.html_url);
for(const j of (await get(r.jobs_url)).jobs){const bad=j.steps.find(s=>s.conclusion==='failure');
console.log(' ',j.name.padEnd(22),j.status,j.conclusion??'',bad?'FALHOU em: '+bad.name:'')}})()"
```

Etapas: **Versão** → **Checagem** (typecheck + testes) → 6× **Build** (mac-arm64, mac-x64,
win-x64, win-arm64, linux-x64, linux-arm64) → **Release**. Leva ~15–20 minutos.

**Máquina travada:** um build normal leva ~10 min. Se um job ficar parado num passo muito
mais que isso (já aconteceu no `npm ci` do mac-x64), é instabilidade do GitHub, não do
código. O workflow tem limites (45 min por build, 12 min no `npm ci`, com uma nova
tentativa), então ele falha sozinho; sem esperar, peça ao usuário para cancelar o run. O
cancelamento pode levar alguns minutos — se não pegar, **"…" → Force cancel**. Só uma
release roda por vez: um run novo fica na fila até o anterior terminar ou ser cancelado.

**Se falhar:** diga qual job e qual passo falharam. Os logs exigem login: peça ao usuário
para abrir o run, clicar no job com ✗ e colar as últimas linhas do erro. Nada foi gravado
(nem commit, nem tag, nem release) — corrija, envie e rode de novo. Se a falha for no
"Gravar a versão", provavelmente entrou um commit na `main` durante o run: basta rodar
de novo.

## Passo 6 — Conferir e concluir

Confere a release publicada contra a lista de arquivos esperada para a versão (nomes no
padrão `Tecius-<versão>-<sistema>-<arquitetura>`, definidos no `electron-builder.yml`):

```bash
node -e "
fetch('https://api.github.com/repos/luiscriativo/tecius/releases/latest',{headers:{'User-Agent':'x'}}).then(r=>r.json()).then(r=>{
const v=r.tag_name.replace(/^v/,''),T='Tecius-'+v+'-';
const exp=['win-x64-setup.exe','win-x64-setup.exe.blockmap','win-x64-portable.exe','win-arm64-setup.exe','win-arm64-setup.exe.blockmap',
 'mac-arm64.dmg','mac-x64.dmg','linux-x86_64.AppImage','linux-amd64.deb','linux-x86_64.rpm','linux-arm64.AppImage','linux-arm64.deb','linux-aarch64.rpm']
 .map(f=>T+f).concat(['latest.yml','latest-mac.yml','latest-linux.yml','latest-linux-arm64.yml','SHA256SUMS.txt']);
const got=r.assets.map(a=>a.name);
console.log(r.tag_name,r.draft?'(rascunho)':'publicada',got.length+' arquivos');
console.log('faltando:',exp.filter(n=>!got.includes(n)).join(', ')||'nada');
console.log('a mais:',got.filter(n=>!exp.includes(n)).join(', ')||'nada');})"
```

Esperado: a versão nova, **18 arquivos**, nada faltando e nada a mais. A descrição da
release começa com a tabela **Downloads** (gerada pelo workflow). Então:

> 🚀 **Tecius X.Y.Z publicada:** https://github.com/luiscriativo/tecius/releases/latest
>
> - Os apps instalados mostram o aviso de atualização ao abrir (≈8 s depois). No Windows e
>   no AppImage do Linux, baixam e instalam pelo app.
> - No Mac, o aviso leva à página para baixar o `.dmg` (sem certificado da Apple não há
>   atualização automática).
> - **Faça Sync no VS Code** para trazer o commit "Versão X.Y.Z" antes do próximo trabalho.

Se o usuário desmarcou **Publicar**: a release está como rascunho em
https://github.com/luiscriativo/tecius/releases (só visível logado) → lápis (Edit) →
**Publish release** no fim da página. Os apps só veem a versão depois de publicada.

## Não fazer

- Pedir senha, token ou `GH_TOKEN` — não é necessário e não deve ser colado na conversa.
- Gerar instaladores nesta máquina para distribuir (`npm run build:win` etc.): saem com
  uma só arquitetura de bytecode e quebram nas outras.
- Editar o `package.json`, criar tags ou commits de versão à mão — o workflow faz isso.
