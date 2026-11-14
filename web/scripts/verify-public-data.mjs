// Read-only check: all allowlisted inputs must match HEAD, and outputs must match inputs.
import {execFileSync} from 'node:child_process';
import {readFileSync, lstatSync, readdirSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, resolve, relative, isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
const git = (...args) => execFileSync('git', args, {cwd: ROOT, encoding: 'utf8'}).trim();
if (realpathSync(git('rev-parse', '--show-toplevel')) !== realpathSync(ROOT)) throw new Error('Unexpected Git checkout root');
const within = (root, file) => { const r = relative(root, file); return r && !r.startsWith('..') && !isAbsolute(r); };
function noLinks(file, root) {
  for (let current = file; within(root, current); current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error('Linked data path is not allowed');
  }
}
const names = JSON.parse(readFileSync(join(WEB, 'scripts/public-data-files.json'), 'utf8'));
if (!Array.isArray(names) || names.length === 0 || new Set(names).size !== names.length) throw new Error('Invalid public data allowlist');
const digests = new Map();
for (const name of names) {
  if (typeof name !== 'string' || !/^(sites\.json|tan_hoi\/(?:[a-z_]+\.(?:json|geojson)|backdrop\/[0-9a-z_]+\.webp))$/.test(name)) throw new Error('Unsafe public data name');
  const file = resolve(ROOT, 'data', name), repoPath = `data/${name}`;
  noLinks(file, ROOT);
  const entry = git('ls-tree', 'HEAD', '--', repoPath);
  if (!entry.startsWith('100644 blob ')) throw new Error(`Public input is not a committed regular file: ${repoPath}`);
  const committed = entry.split(/\s+/)[2];
  // Apply Git's text rules so a normal CRLF Windows checkout is also supported.
  if (git('hash-object', `--path=${repoPath}`, file) !== committed) throw new Error(`Public input differs from HEAD: ${repoPath}`);
  digests.set(name, createHash('sha256').update(readFileSync(file)).digest('hex'));
}
const meta = JSON.parse(readFileSync(join(ROOT, 'data/tan_hoi/meta.json'), 'utf8'));
if (meta.fixture || meta.contract_version !== '1.0.0') throw new Error('Expected real CONTRACT-001 1.0.0 input');
console.log(`Verified ${names.length} committed public inputs at ${git('rev-parse', 'HEAD')}; no synthetic data.`);

function filesIn(dir, prefix = '') {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Linked build output is not allowed');
    const name = prefix + entry.name;
    if (entry.isDirectory()) return filesIn(join(dir, entry.name), name + '/');
    if (!entry.isFile()) throw new Error('Unexpected output file type');
    return [name];
  });
}
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (args[i] !== '--output' || !args[i + 1]) throw new Error('Usage: verify-public-data.mjs [--output relative-web-directory]');
  const output = resolve(WEB, args[i + 1]);
  if (!within(WEB, output)) throw new Error('Output must be inside web');
  noLinks(output, WEB);
  const actual = filesIn(output).sort(), expected = [...names].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Output file list differs from the public allowlist');
  for (const name of names) {
    const digest = createHash('sha256').update(readFileSync(join(output, name))).digest('hex');
    if (digest !== digests.get(name)) throw new Error(`Built public data differs from committed input: ${name}`);
  }
  console.log(`Verified ${relative(WEB, output)}: exactly ${names.length} public files, byte-for-byte equal to checked inputs.`);
}
console.warn('validation.json is absent: validation results remain unavailable; no substitute is generated.');
