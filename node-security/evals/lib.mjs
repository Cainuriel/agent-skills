// Shared helpers for node-security evaluations.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const evalsDir = path.dirname(fileURLToPath(import.meta.url));
export const skillDir = path.resolve(evalsDir, '..', 'node-security');

export function loadCases() {
  return JSON.parse(fs.readFileSync(path.join(evalsDir, 'cases.json'), 'utf8'));
}

export function baselineFile(dir) {
  return `${path.resolve(dir)}.baseline.json`;
}

// File hashes outside .git and node_modules, plus the presence of node_modules.
export function snapshot(dir) {
  const files = {};
  const visit = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) visit(full);
      else if (e.isFile()) {
        const rel = path.relative(dir, full).split(path.sep).join('/');
        files[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      }
    }
  };
  visit(dir);
  return { files, nodeModules: fs.existsSync(path.join(dir, 'node_modules')) };
}
