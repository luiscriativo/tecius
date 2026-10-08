#!/usr/bin/env node
/**
 * Code Protection Script
 *
 * Applies two layers of protection after `electron-vite build`:
 *
 *  1. MAIN PROCESS  → V8 Bytecode via bytenode
 *     - Compiles out/main/index.js to out/main/index.jsc using Electron's own V8 engine
 *     - Replaces index.js with a tiny loader (require bytenode + load .jsc)
 *     - Bytecode is tied to the Electron/V8 version → cannot be decompiled
 *
 *  2. PRELOAD + RENDERER → Obfuscation via javascript-obfuscator
 *     - Renames identifiers to hex, shuffles and splits strings (no control-flow
 *       flattening: it made the UI 6–25× slower — see OBFUSCATOR_OPTIONS)
 *     - Adds self-defending code that breaks when formatted/debugged
 *     - The renderer is already minified by Vite; this adds a second layer
 *
 * Usage:
 *   node scripts/protect.js              (protect all targets)
 *   node scripts/protect.js --no-bytecode (skip bytecode, only obfuscate)
 *   node scripts/protect.js --only-win   (same result, just a label)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ── Paths ──────────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const MAIN_FILE = path.join(OUT_DIR, 'main', 'index.js');
const MAIN_BYTECODE = path.join(OUT_DIR, 'main', 'index.jsc');
const PRELOAD_DIR = path.join(OUT_DIR, 'preload');
const RENDERER_DIR = path.join(OUT_DIR, 'renderer');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const skipBytecode = args.includes('--no-bytecode');

// ── Obfuscator configuration ──────────────────────────────────────────────────
// Ofuscação "leve": renomeia identificadores, embaralha e quebra as strings e se
// defende de formatação, mas sem as transformações que pesam em código executado
// muitas vezes. Medido no mapa com 5 mil eventos (passo da régua / passo de zoom):
//   sem ofuscar 2 ms / 6 ms · leve (esta) 4 ms / 6 ms · completa 53 ms / 36 ms
// A completa (controlFlowFlattening, deadCodeInjection, numbersToExpressions,
// strings em base64 e chamadas transformadas) travava a interface ao arrastar.
const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,     // pesado: embaralha o fluxo de cada laço
  deadCodeInjection: false,         // pesado: código morto nos caminhos quentes
  debugProtection: false,           // set true to break devtools (affects perf)
  debugProtectionInterval: 0,
  disableConsoleOutput: false,      // set true to silence console in production
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: false,      // pesado: cada número vira uma expressão
  renameGlobals: false,
  selfDefending: true,              // breaks when code is reformatted/debugged
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 12,
  stringArray: true,
  stringArrayCallsTransform: false, // pesado: chamadas passam por funções intermediárias
  stringArrayEncoding: [],          // sem base64: decodificar a cada acesso pesava
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: false,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,     // true = much larger output
  target: 'browser',               // 'node' for preload would be ideal but browser works
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) {
  process.stdout.write(msg + '\n');
}

function obfuscateFile(filePath) {
  // Lazy-require so the script fails clearly if the package is missing
  const JavaScriptObfuscator = require('javascript-obfuscator');
  const rel = path.relative(ROOT, filePath);
  const before = fs.statSync(filePath).size;

  const code = fs.readFileSync(filePath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
  fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');

  const after = fs.statSync(filePath).size;
  const ratio = ((after / before) * 100).toFixed(0);
  log(`    ✓ ${rel}  (${kb(before)} → ${kb(after)}, ${ratio}%)`);
}

function obfuscateDir(dir) {
  if (!fs.existsSync(dir)) {
    log(`    ⚠  Directory not found, skipping: ${dir}`);
    return;
  }
  walkJs(dir).forEach(obfuscateFile);
}

// Pastas que não são código: dados geográficos (JSON empacotado como JS).
// Ofuscá-los só aumentaria muito o tamanho e o tempo de build; os mapas de
// fronteiras, além disso, são GPL e devem ficar legíveis.
const SKIP_DIRS = new Set([path.join(RENDERER_DIR, 'assets', 'data')]);

/** Recursively collect all .js files */
function walkJs(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && SKIP_DIRS.has(full)) { log(`    ↷ ${path.relative(ROOT, full)}  (dados, não ofuscados)`); continue; }
    if (entry.isDirectory()) results.push(...walkJs(full));
    else if (entry.name.endsWith('.js')) results.push(full);
  }
  return results;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

// ── Step 1: V8 Bytecode (main process) ────────────────────────────────────────
async function compileMainToBytecode() {
  if (!fs.existsSync(MAIN_FILE)) {
    log('  ⚠  out/main/index.js not found — run `npm run build` first.');
    process.exit(1);
  }

  // Use Electron's own binary so the V8 version matches at runtime
  const electronBin = require('electron');
  const compileScript = `
    require('bytenode').compileFile({
      filename: ${JSON.stringify(MAIN_FILE)},
      output:   ${JSON.stringify(MAIN_BYTECODE)},
      electron: true
    });
  `;

  log(`  Compiling with Electron's V8 (${electronBin})...`);
  // ELECTRON_RUN_AS_NODE: sem isso o Electron ignora o `-e`, abre a janela
  // padrão e o build fica parado esperando
  execFileSync(electronBin, ['-e', compileScript], {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  if (!fs.existsSync(MAIN_BYTECODE)) {
    throw new Error('Bytecode file was not created — compilation failed.');
  }

  // Replace index.js with a minimal loader
  const loader = [
    "'use strict';",
    "require('bytenode');",
    "require('./index.jsc');",
  ].join('\n');

  fs.writeFileSync(MAIN_FILE, loader, 'utf8');
  log(`  ✓ out/main/index.jsc  (${kb(fs.statSync(MAIN_BYTECODE).size)})`);
  log(`  ✓ out/main/index.js   → replaced with bytecode loader`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  log('\n╔══════════════════════════════════════════════╗');
  log('║         CODE PROTECTION PIPELINE             ║');
  log('╚══════════════════════════════════════════════╝\n');

  // --- Step 1 ---
  if (skipBytecode) {
    log('▶ Step 1/3  Main process bytecode  [SKIPPED via --no-bytecode]\n');
  } else {
    log('▶ Step 1/3  Main process → V8 bytecode (bytenode)');
    await compileMainToBytecode();
    log('');
  }

  // --- Step 2 ---
  log('▶ Step 2/3  Preload → obfuscation (javascript-obfuscator)');
  obfuscateDir(PRELOAD_DIR);
  log('');

  // --- Step 3 ---
  log('▶ Step 3/3  Renderer → obfuscation (javascript-obfuscator)');
  obfuscateDir(RENDERER_DIR);
  log('');

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`✅  Protection complete in ${elapsed}s — ready for electron-builder\n`);
}

main().catch((err) => {
  log(`\n❌  Protection failed: ${err.message}`);
  process.exit(1);
});
