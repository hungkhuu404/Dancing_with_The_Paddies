// Only reviewed public files; never copy the whole data directory or generate fixtures.
import { readFileSync, existsSync, lstatSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
const OUT = join(WEB, 'public', 'data');
const allowlist = JSON.parse(readFileSync(new URL('./public-data-files.json', import.meta.url), 'utf8'));
const within = (base, file) => { const rel = relative(base, file); return rel && !rel.startsWith('..') && !isAbsolute(rel); };
function rejectLinks(file) {
  for (let current = file; within(ROOT, current); current = dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Refusing linked path: ${relative(ROOT, current)}`);
  }
}
if (!Array.isArray(allowlist) || !allowlist.length) throw new Error('Public data allowlist is empty');
const files = allowlist.map(name => {
  if (typeof name !== 'string' || !/^(sites\.json|tan_hoi\/(?:[a-z_]+\.(?:json|geojson)|backdrop\/[0-9a-z_]+\.webp))$/.test(name)) throw new Error('Invalid public-data path');
  const source = resolve(ROOT, 'data', name);
  if (!within(join(ROOT, 'data'), source)) throw new Error('Data path outside root');
  rejectLinks(source);
  if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error(`Missing required public data: data/${name}. No fixture will be generated.`);
  return {name, source};
});
const meta = JSON.parse(readFileSync(join(ROOT, 'data/tan_hoi/meta.json'), 'utf8'));
if (meta.fixture || meta.contract_version !== '1.0.0') throw new Error('Expected real CONTRACT-001 1.0.0 data');
rejectLinks(OUT);
if (!within(join(WEB, 'public'), OUT)) throw new Error('Invalid generated output');
rmSync(OUT, { recursive: true, force: true });
for (const {name, source} of files) {
  const target = join(OUT, name);
  mkdirSync(dirname(target), {recursive: true});
  cpSync(source, target);
}
console.log(`data: synced ${files.length} allowlisted public files; no synthetic fallback`);
if (!allowlist.includes('tan_hoi/validation.json')) console.warn('data: validation.json absent from snapshot; validation results unavailable.');
