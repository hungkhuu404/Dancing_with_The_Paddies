import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const web = fileURLToPath(new URL('../', import.meta.url));
function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'flood-sync-test-'));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  mkdirSync(join(root, 'web/scripts'), {recursive:true});
  for (const name of ['sync-data.mjs', 'public-data-files.json']) copyFileSync(join(web, 'scripts', name), join(root, 'web/scripts', name));
  return root;
}
const run = root => spawnSync(process.execPath, [join(root, 'web/scripts/sync-data.mjs')], {encoding:'utf8'});
test('missing input fails without generating fixture or deleting previous output', t => {
  const root = workspace(t);
  mkdirSync(join(root, 'web/public/data'), {recursive:true});
  writeFileSync(join(root, 'web/public/data/sentinel.txt'), 'existing output');
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required public data/);
  assert.equal(readFileSync(join(root, 'web/public/data/sentinel.txt'), 'utf8'), 'existing output');
  assert.equal(existsSync(join(root, 'data/sites.json')), false);
});
test('only allowlisted public files are copied, never unrelated input', t => {
  const root = workspace(t);
  const list = JSON.parse(readFileSync(join(web, 'scripts/public-data-files.json'), 'utf8'));
  for (const name of list) {
    const target = join(root, 'data', name);
    mkdirSync(dirname(target), {recursive:true});
    copyFileSync(join(web, '../data', name), target);
  }
  writeFileSync(join(root, 'data/unlisted.txt'), 'test-only sentinel');
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, 'web/public/data/unlisted.txt')), false);
  assert.deepEqual(readFileSync(join(root, 'web/public/data/tan_hoi/meta.json')), readFileSync(join(root, 'data/tan_hoi/meta.json')));
});
test('unsafe allowlist path fails before touching generated output', t => {
  const root = workspace(t);
  writeFileSync(join(root, 'web/scripts/public-data-files.json'), JSON.stringify(['../outside.json']));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid public-data path/);
  assert.equal(existsSync(join(root, 'web/public/data')), false);
});
