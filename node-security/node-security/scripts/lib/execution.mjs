// What the scripts of a package.json run, and code that hides from the reader. Read-only.
// The scripts of the repository are never run: the command text is parsed.

import fs from 'node:fs';
import path from 'node:path';
import { readTextSafe, walk } from './common.mjs';

// ---------- Command parsing ----------

// Splits a shell command into segments at &&, ||, ;, | and &, outside quotes.
export function splitCommands(cmd) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      cur += c;
      if (c === '\\' && quote === '"') { cur += cmd[i + 1] ?? ''; i++; } else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === '&' || c === '|' || c === ';') {
      if (cmd[i + 1] === c) i++;
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// Splits a command segment into tokens. Each token records if it was quoted.
export function tokenize(segment) {
  const tokens = [];
  let cur = '';
  let quoted = false;
  let quote = null;
  let has = false;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (quote) {
      if (c === '\\' && quote === '"' && segment[i + 1] === '"') { cur += '"'; i++; } else if (c === quote) quote = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      quoted = true;
      has = true;
    } else if (/\s/.test(c)) {
      if (has) tokens.push({ text: cur, quoted });
      cur = '';
      quoted = false;
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has) tokens.push({ text: cur, quoted });
  return tokens;
}

const INTERPRETERS = new Set(['node', 'nodejs', 'tsx', 'ts-node', 'ts-node-esm', 'bun', 'deno', 'sh', 'bash', 'zsh', 'python', 'python3', 'py', 'powershell', 'pwsh']);
const INLINE_FLAGS = new Set(['-e', '-p', '--eval', '--print', '-c', '-Command', '-command', '-EncodedCommand', '-encodedcommand', '-enc']);
const FLAGS_WITH_VALUE = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '--env-file', '--conditions', '-C', '--title', '--inspect-port']);
const DOWNLOADERS = new Set(['curl', 'wget', 'iwr', 'irm', 'invoke-webrequest', 'invoke-restmethod', 'certutil', 'bitsadmin', 'start-bitstransfer']);
const RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const PARALLEL_TOOLS = new Set(['concurrently', 'npm-run-all', 'npm-run-all2', 'run-p', 'run-s']);
const PATH_LIKE = /^(\.{1,2}[\\/]|[\w.-]+[\\/])|\.(c|m)?[jt]s$|\.(sh|ps1|cmd|bat|py)$/i;

// Resolves what a script runs, following "npm run <script>" chains. Never runs anything.
export function mapScript(scripts, name, pkgDir, deps) {
  const result = { files: [], tools: [], inline: [], downloads: [], remote: [], missing: [] };
  const seen = new Set();
  const addUnique = (list, v) => { if (!list.includes(v)) list.push(v); };

  // npm also runs pre<name> and post<name>. They are included to be conservative.
  const visitScript = (scriptName) => {
    if (seen.has(scriptName) || typeof scripts[scriptName] !== 'string') return;
    seen.add(scriptName);
    for (const s of [`pre${scriptName}`, scriptName, `post${scriptName}`]) {
      if (s === scriptName) visitCommand(scripts[s]);
      else if (typeof scripts[s] === 'string' && !seen.has(s)) { seen.add(s); visitCommand(scripts[s]); }
    }
  };

  // Resolves like Node: the exact path, then with an extension, then an index file.
  const localFile = (file) => {
    const base = path.resolve(pkgDir, file);
    const candidates = [base, ...['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].map((e) => base + e),
      ...['index.js', 'index.mjs', 'index.ts'].map((n) => path.join(base, n))];
    const found = candidates.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } });
    if (found) addUnique(result.files, found);
    else addUnique(result.missing, file);
  };

  const visitCommand = (cmd) => {
    for (const segment of splitCommands(cmd)) visitSegment(segment);
  };

  const visitSegment = (segment) => {
    let toks = tokenize(segment);
    // Environment assignments and environment wrappers.
    while (toks.length && /^[A-Za-z_][\w]*=/.test(toks[0].text)) toks = toks.slice(1);
    while (toks.length && ['cross-env', 'env', 'dotenv'].includes(toks[0].text)) {
      toks = toks.slice(1);
      while (toks.length && (/^[A-Za-z_][\w]*=/.test(toks[0].text) || toks[0].text.startsWith('-'))) {
        const t = toks.shift();
        if (t.text === '-e' || t.text === '-c') toks.shift();
      }
      if (toks[0]?.text === '--') toks = toks.slice(1);
    }
    if (!toks.length) return;
    const head = toks[0].text;
    const lower = head.toLowerCase();
    const rest = toks.slice(1);

    if (DOWNLOADERS.has(lower)) { addUnique(result.downloads, segment.slice(0, 140)); return; }

    if (RUNNERS.has(lower)) {
      const sub = rest[0]?.text;
      if (!sub) return;
      if (sub === 'run' || sub === 'run-script') { if (rest[1]) visitScript(rest[1].text); return; }
      if (['start', 'test', 'stop', 'restart'].includes(sub)) { visitScript(sub); return; }
      if (sub === 'exec' || sub === 'x') { if (rest[1]) visitSegment(rest.slice(1).map((t) => t.text).join(' ')); return; }
      if (sub === 'dlx' || (lower === 'yarn' && sub === 'dlx')) { if (rest[1]) addUnique(result.remote, rest[1].text); return; }
      if (lower !== 'npm' && typeof scripts[sub] === 'string') { visitScript(sub); return; }
      return;
    }

    if (lower === 'npx') {
      const pkg = rest.find((t) => !t.text.startsWith('-'))?.text;
      if (!pkg) return;
      const name = pkg.replace(/@[^@/]*$/, '') || pkg;
      if (deps.has(name)) addUnique(result.tools, name);
      else addUnique(result.remote, pkg);
      return;
    }

    if (PARALLEL_TOOLS.has(lower)) {
      addUnique(result.tools, lower);
      for (const t of rest) {
        if (t.quoted) visitCommand(t.text);
        else if (lower !== 'concurrently' && !t.text.startsWith('-')) {
          const pattern = t.text;
          if (pattern.endsWith('*')) {
            for (const s of Object.keys(scripts)) if (s.startsWith(pattern.slice(0, -1))) visitScript(s);
          } else visitScript(pattern);
        }
      }
      return;
    }

    if (lower === 'cmd' && /^\/c$/i.test(rest[0]?.text ?? '')) { visitCommand(rest.slice(1).map((t) => t.text).join(' ')); return; }

    if (INTERPRETERS.has(lower)) {
      for (let i = 0; i < rest.length; i++) {
        const t = rest[i].text;
        if (INLINE_FLAGS.has(t)) { addUnique(result.inline, segment.slice(0, 140)); return; }
        if (t === '-File' || t === '-file') { if (rest[i + 1]) localFile(rest[i + 1].text); return; }
        if (FLAGS_WITH_VALUE.has(t)) { if (rest[i + 1] && PATH_LIKE.test(rest[i + 1].text)) localFile(rest[i + 1].text); i++; continue; }
        if (t.startsWith('-')) continue;
        if (lower === 'deno' && t === 'run') continue;
        localFile(t);
        return;
      }
      return;
    }

    if (PATH_LIKE.test(head) && !/^[@\w-]+$/.test(head)) { localFile(head); return; }
    addUnique(result.tools, head);
  };

  visitScript(name);
  return result;
}

// Configuration files that tools load and run (next.config.js, vite.config.ts, tailwind.config.js, .eslintrc.js...).
const CONFIG_FILE = /^(?:[\w.-]+[.-]config|\.[\w-]+rc)\.(?:c|m)?[jt]sx?$/i;
export function configFiles(dir) {
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name); } catch { return []; }
  return names.filter((n) => CONFIG_FILE.test(n)).map((n) => path.join(dir, n));
}

// ---------- Hidden and obfuscated code ----------

// 100 or more blank characters (spaces, tabs, no-break and zero-width spaces) followed by code on the same line.
const WHITESPACE_PAD = /[ \t  -​　]{100,}(?=\S)/;
const INDICATORS = [
  ['eval', /\beval\s*\(|new\s+Function\s*\(/],
  ['child_process', /child_process|\bexecSync\s*\(|\bspawnSync\s*\(/],
  ['encoded-data', /String\.fromCharCode|\batob\s*\(|Buffer\.from\([^)]{0,300}['"](?:base64|hex)['"]/],
  ['long-encoded-string', /[A-Za-z0-9+/]{300,}={0,2}|(?:\\x[0-9a-fA-F]{2}){60,}/],
];

export function scanCode(full) {
  const text = readTextSafe(full);
  const result = { hidden: [], indicators: [], longLines: 0, lines: 0 };
  if (!text || text.length > 2_000_000) return result;
  const lines = text.split(/\r?\n/);
  result.lines = lines.length;
  lines.forEach((line, i) => {
    const m = WHITESPACE_PAD.exec(line);
    if (m) {
      const col = m.index + m[0].length;
      // An odd number of quotes before the run: the run is probably inside a string (for example an ASCII banner).
      const before = line.slice(0, m.index);
      const inString = ['"', "'", '`'].some((q) => (before.split(q).length - 1) % 2 === 1);
      result.hidden.push({ line: i + 1, column: col + 1, blanks: m[0].length, inString, snippet: line.slice(col, col + 60) });
    }
    if (line.length > 1000) result.longLines++;
  });
  for (const [name, re] of INDICATORS) if (re.test(text)) result.indicators.push(name);
  return result;
}

const SOURCE_EXT = /\.(c|m)?[jt]sx?$/i;
const SKIP_DIRS = new Set(['dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.angular', '.svelte-kit', '.output', 'vendor', '.turbo', '.cache']);

// All source files of the repository, for the hidden-code check. Skips build output and minified files.
export function sourceFiles(root, max = 5000) {
  const out = [];
  walk(root, {
    maxDepth: 10,
    onFile: (full, rel) => {
      if (out.length >= max) return;
      if (!SOURCE_EXT.test(rel) || /\.min\./i.test(rel)) return;
      if (rel.split('/').some((p) => SKIP_DIRS.has(p))) return;
      out.push(full);
    },
  });
  return out;
}
