// Editor configuration in a repository: VS Code files that can run code when the folder opens,
// when a task or a debug session starts, or when an extension reads a setting. Read-only.

import fs from 'node:fs';
import path from 'node:path';
import { readTextSafe, parseJsonc, flattenObject } from './common.mjs';

// A key segment that names an executable, a command or its environment.
const EXEC_SEGMENT = /^(path|executable|executablepath|command|commands|executormap|interpreter|interpreterpath|defaultinterpreterpath|nodepath|serverpath|runtime|runtimeexecutable|runtimeargs|shell|shellargs|args|env|profiles|automationprofile|binary|binarypath|cli|clipath)$/i;
// A value that runs more than one command, downloads, or points outside the repository.
// Path settings that VS Code does not use without an explicit user choice (workspace TypeScript version).
const SAFE_PATH_KEYS = /^(typescript\.tsdk|js\/ts\.tsdk(\.path)?)$/i;
const RISKY_VALUE = /(&&|\|\||[;|`]|\$\(|>\s*\S|https?:\/\/|"(?:[a-zA-Z]:\\|\\\\|\/|~))/;

const short = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 140 ? `${s.slice(0, 140)}...` : s;
};

function checkSettings(settings, file, add) {
  for (const [key, value] of flattenObject(settings)) {
    const k = key.toLowerCase();
    if (k === 'task.allowautomatictasks') {
      add('high', 'EDITOR_AUTOTASKS_SETTING', file, `${key}: ${short(value)}. VS Code ignores this key in a workspace (verified), but a repository has no legitimate reason to set it.`);
    } else if (k.startsWith('security.workspace.trust') || k.startsWith('extensions.supportuntrustedworkspaces')) {
      add('high', 'EDITOR_TRUST_SETTING', file, `${key}: ${short(value)}`);
    } else if (/autoapprove|yolo|dangerously/.test(k)) {
      add('high', 'EDITOR_AGENT_AUTOAPPROVE', file, `${key}: ${short(value)}. Lets an AI agent run tools without approval.`);
    } else if (key.split('.').some((seg) => EXEC_SEGMENT.test(seg))) {
      const risky = RISKY_VALUE.test(JSON.stringify(value));
      if (SAFE_PATH_KEYS.test(key) && !risky) continue;
      add(risky ? 'high' : 'medium', 'EDITOR_EXEC_SETTING', file,
        `${key}: ${short(value)}${risky ? '  [command chain, URL or path outside the repository]' : ''}`);
    }
  }
}

function checkTasks(tasksDoc, file, add) {
  for (const task of Array.isArray(tasksDoc?.tasks) ? tasksDoc.tasks : []) {
    const command = short([task.command, ...(Array.isArray(task.args) ? task.args : [])].filter(Boolean).join(' '));
    const label = task.label ?? task.taskName ?? '(no label)';
    if (task.runOptions?.runOn === 'folderOpen') {
      add('high', 'EDITOR_AUTORUN', file, `Task "${label}" runs when the folder opens: ${command}`);
    }
    const p = task.presentation ?? {};
    if (task.hide === true || (p.reveal === 'never' && p.echo === false)) {
      add('high', 'EDITOR_HIDDEN_TASK', file, `Task "${label}" is hidden from the user: ${command}`);
    }
  }
}

function checkLaunch(launchDoc, file, add) {
  for (const cfg of Array.isArray(launchDoc?.configurations) ? launchDoc.configurations : []) {
    const name = cfg.name ?? '(no name)';
    if (cfg.preLaunchTask) add('medium', 'EDITOR_LAUNCH', file, `Debug configuration "${name}" runs task "${cfg.preLaunchTask}" first`);
    if (cfg.runtimeExecutable) add('medium', 'EDITOR_LAUNCH', file, `Debug configuration "${name}" runs ${short(cfg.runtimeExecutable)}`);
  }
}

function checkMcp(mcpDoc, file, add) {
  const servers = mcpDoc?.servers ?? mcpDoc?.mcpServers ?? {};
  for (const [name, s] of Object.entries(servers)) {
    if (s && typeof s === 'object' && s.command) {
      add('high', 'MCP_SERVER', file, `Server "${name}" starts: ${short([s.command, ...(s.args ?? [])].join(' '))}`);
    } else if (s && typeof s === 'object' && s.url) {
      add('medium', 'MCP_SERVER', file, `Server "${name}" connects to ${short(s.url)}`);
    }
  }
}

// Inspects .vscode/*.json and *.code-workspace files at the root of the repository.
export function inspectEditor(root, add) {
  const files = [];
  for (const name of ['settings.json', 'tasks.json', 'launch.json', 'extensions.json', 'mcp.json']) {
    const rel = `.vscode/${name}`;
    if (fs.existsSync(path.join(root, rel))) files.push(rel);
  }
  let rootEntries = [];
  try { rootEntries = fs.readdirSync(root); } catch { /* not readable */ }
  for (const name of rootEntries) if (name.endsWith('.code-workspace')) files.push(name);

  for (const rel of files) {
    const doc = parseJsonc(readTextSafe(path.join(root, rel)));
    if (doc.error) {
      add('medium', 'EDITOR_UNPARSED', rel, `Not valid JSON with comments (${doc.error.slice(0, 80)}). Review it by hand.`);
      continue;
    }
    const v = doc.value ?? {};
    if (rel.endsWith('.code-workspace')) {
      checkSettings(v.settings, rel, add);
      checkTasks(v.tasks, rel, add);
      checkLaunch(v.launch, rel, add);
      if (Array.isArray(v.extensions?.recommendations) && v.extensions.recommendations.length) {
        add('low', 'EDITOR_EXTENSIONS', rel, `Recommended extensions: ${v.extensions.recommendations.join(', ')}. Check each publisher.`);
      }
    } else if (rel.endsWith('settings.json')) checkSettings(v, rel, add);
    else if (rel.endsWith('tasks.json')) checkTasks(v, rel, add);
    else if (rel.endsWith('launch.json')) checkLaunch(v, rel, add);
    else if (rel.endsWith('mcp.json')) checkMcp(v, rel, add);
    else if (rel.endsWith('extensions.json') && Array.isArray(v.recommendations) && v.recommendations.length) {
      add('low', 'EDITOR_EXTENSIONS', rel, `Recommended extensions: ${v.recommendations.join(', ')}. Check each publisher.`);
    }
  }
}

// Executables at the root with the name of a common tool. On Windows, a tool can resolve
// to such a file before the real one (binary planting, for example CVE-2026-63093 in Cursor).
const TOOL_NAMES = new Set(['git', 'node', 'npm', 'npx', 'pnpm', 'pnpx', 'yarn', 'corepack', 'bun', 'deno', 'python', 'python3', 'py', 'pip',
  'code', 'cursor', 'bash', 'sh', 'powershell', 'pwsh', 'cmd', 'curl', 'wget', 'tar', 'ssh', 'gh', 'docker', 'java', 'dotnet']);
const EXECUTABLE_EXT = new Set(['.exe', '.cmd', '.bat', '.com', '.ps1', '.scr', '.dll']);

export function inspectRootExecutables(root, add) {
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!EXECUTABLE_EXT.has(ext)) continue;
    const base = path.basename(e.name, path.extname(e.name)).toLowerCase();
    if (TOOL_NAMES.has(base)) {
      add('high', 'ROOT_TOOL_BINARY', e.name, `Executable with the name of a common tool at the repository root. Windows can run it instead of the real ${base}.`);
    } else if (ext === '.exe' || ext === '.dll' || ext === '.scr' || ext === '.com') {
      add('medium', 'ROOT_EXECUTABLE', e.name, 'Binary executable at the repository root');
    }
  }
}
