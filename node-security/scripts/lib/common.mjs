// Shared helpers for node-security scripts.
// Constraints: Node.js built-in modules only, read-only file access, same behavior on Windows and Linux.

import fs from 'node:fs';
import path from 'node:path';

export const PROTOCOL_VERSION = '0.1.0';

// Minimum release age accepted by the protocol, in minutes.
// 1440 (one day) is the pnpm 11+ default; most compromised versions are removed within hours.
export const MIN_RELEASE_AGE_MINUTES = 1440;

// Oldest pnpm major with supply-chain defaults on (minimumReleaseAge, blockExoticSubdeps, strictDepBuilds).
export const MIN_PNPM_MAJOR = 11;

// First npm major that blocks dependency install scripts by default.
export const MIN_NPM_MAJOR = 12;

export const NPM_REGISTRY_HOSTS = ['registry.npmjs.org', 'registry.npmjs.com', 'registry.yarnpkg.com'];

export const FOREIGN_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'bun.lock', 'bun.lockb'];

// Agent files: instructions that agents load automatically. The protocol never writes them.
const AGENT_FILE_NAMES = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'copilot-instructions.md']);
const AGENT_DIR_NAMES = new Set(['.claude', '.agents', '.cursor', '.codex', '.gemini', '.kimi-code', '.windsurf']);

export function isAgentPath(relPath) {
  const parts = toPosix(relPath).split('/').filter(Boolean);
  if (parts.some((p) => AGENT_DIR_NAMES.has(p))) return true;
  return AGENT_FILE_NAMES.has(parts[parts.length - 1] ?? '');
}

export function toPosix(p) {
  return p.split(path.sep).join('/').replace(/\\/g, '/');
}

// Returns file text, or null if the file is missing, is not a regular file, or is a symbolic link.
// Symbolic links are not followed: a link can point outside the repository.
export function readTextSafe(file) {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function isSymlink(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

export function exists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

export function readJsonSafe(file) {
  const text = readTextSafe(file);
  if (text === null) return { value: null, error: null, missing: true };
  try {
    return { value: JSON.parse(text.replace(/^﻿/, '')), error: null, missing: false };
  } catch (err) {
    return { value: null, error: err.message, missing: false };
  }
}

// Parses .npmrc (ini key=value). Comments start with ';' or '#'.
export function parseNpmrc(text) {
  const out = {};
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '') return null;
  if (v === '{}') return {};
  if (v === '[]') return [];
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

const KEY_RE = /^("([^"]+)"|'([^']+)'|([^\s:][^:]*?))\s*:(\s+(.*)|\s*)$/;

// Minimal YAML reader for pnpm-workspace.yaml: top-level scalars, and one level of lists or maps.
// Deeper structures are kept as { __unparsed: true }. This is enough for the keys that the protocol checks.
export function parseSimpleYaml(text) {
  const out = {};
  if (!text) return out;
  let current = null;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const noComment = stripComment(raw);
    if (!noComment.trim()) continue;
    const indent = noComment.length - noComment.trimStart().length;
    const line = noComment.trim();
    if (indent === 0) {
      const m = line.match(KEY_RE);
      if (!m) { current = null; continue; }
      const key = m[2] ?? m[3] ?? m[4];
      const rest = m[6];
      if (rest === undefined || rest === '') {
        out[key] = null;
        current = key;
      } else {
        out[key] = parseScalar(rest);
        current = null;
      }
      continue;
    }
    if (current === null) continue;
    if (line.startsWith('- ')) {
      if (!Array.isArray(out[current])) out[current] = [];
      out[current].push(parseScalar(line.slice(2)));
      continue;
    }
    const m = line.match(KEY_RE);
    if (!m) continue;
    if (out[current] === null || Array.isArray(out[current])) out[current] = {};
    if (typeof out[current] !== 'object') continue;
    const sub = m[2] ?? m[3] ?? m[4];
    out[current][sub] = m[6] === undefined || m[6] === '' ? { __unparsed: true } : parseScalar(m[6]);
  }
  return out;
}

// Walks the repository without following symbolic links. Skips node_modules and .git.
export function walk(root, { maxDepth = 6, onFile }) {
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) visit(full, depth + 1);
      else if (e.isFile()) onFile(full, toPosix(path.relative(root, full)));
    }
  };
  visit(root, 0);
}

export function lockfilesAtRoot(root) {
  return ['pnpm-lock.yaml', ...FOREIGN_LOCKFILES].filter((f) => exists(path.join(root, f)));
}

// Reads the origin remote URL from .git/config without running git.
export function readGitRemote(root) {
  let gitDir = path.join(root, '.git');
  const pointer = readTextSafe(gitDir);
  if (pointer && pointer.startsWith('gitdir:')) {
    gitDir = path.resolve(root, pointer.slice('gitdir:'.length).trim());
  }
  const config = readTextSafe(path.join(gitDir, 'config'));
  if (!config) return { isGitRepo: exists(gitDir), url: null, owner: null };
  let inOrigin = false;
  let url = null;
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inOrigin = /^\[remote\s+"origin"\]$/.test(line);
      continue;
    }
    if (inOrigin) {
      const m = line.match(/^url\s*=\s*(.+)$/);
      if (m) { url = m[1].trim(); break; }
    }
  }
  return { isGitRepo: true, url, owner: ownerFromUrl(url) };
}

export function ownerFromUrl(url) {
  if (!url) return null;
  const m = url.match(/^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|[^@/]+@)[^/:]+[/:]([^/]+)\/[^/]+?(?:\.git)?\/?$/);
  return m ? m[1] : null;
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
      else args[k] = true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

export function semverMajor(version) {
  const m = String(version ?? '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? Number(m[1]) : null;
}

export function isExactSemver(version) {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(String(version ?? ''));
}

// Text output only. JSON output keeps full values.
const MAX_CELL = 110;
const cell = (v) => {
  const s = String(v ?? '');
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 3)}...` : s;
};

export function printTable(rawRows, columns) {
  const rows = rawRows.map((r) => Object.fromEntries(columns.map((c) => [c, cell(r[c])])));
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  console.log(line(columns));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(columns.map((c) => r[c])));
}
