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
  mkdirSync(join(root, 'web/src/science'), {recursive:true});
  copyFileSync(join(web, 'src/science/pixelMethod.js'), join(root, 'web/src/science/pixelMethod.js'));
  writeFileSync(join(root, 'web/package.json'), '{"type":"module"}');
  for (const name of ['sync-data.mjs', 'public-data-files.json']) copyFileSync(join(web, 'scripts', name), join(root, 'web/scripts', name));
  for(const file of ['src/data/siteRules.js','src/data/site-profiles.json','src/data/projection.js','src/map/contract.js','scripts/make-site-fixture.mjs','scripts/fixtureRules.mjs']){mkdirSync(dirname(join(root,'web',file)),{recursive:true});copyFileSync(join(web,file),join(root,'web',file));}
  const profilesPath=join(root,'web/src/data/site-profiles.json'),profiles=JSON.parse(readFileSync(profilesPath,'utf8'));profiles.sites.bang_rakam.scene.fixture_preview=false;writeFileSync(profilesPath,JSON.stringify(profiles));
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
test('only the real pixel v2 dataset is accepted and rejection preserves previous output', t => {
  const root = workspace(t);
  for (const name of JSON.parse(readFileSync(join(web, 'scripts/public-data-files.json'), 'utf8'))) {
    const target = join(root, 'data', name);
    mkdirSync(dirname(target), {recursive:true});
    copyFileSync(join(web, '../data', name), target);
  }
  const metaPath=join(root,'data/tan_hoi/meta.json');
  const meta=JSON.parse(readFileSync(metaPath, 'utf8'));
  meta.contract_version='2.0.0';
  meta.method={...meta.method,classification:'pixel_fraction_75_dual_50',water_fraction:.75,fill_min_fraction:.5,joint_valid_fraction:.7,selection_status:'post_hoc',single_flip_filter:true};
  writeFileSync(metaPath,JSON.stringify(meta));
  assert.equal(run(root).status,0);
  for(const change of [{contract_version:'1.0.0'},{fixture:true},{method:{...meta.method,water_fraction:.5}}]){
    writeFileSync(metaPath,JSON.stringify({...meta,...change}));
    const result=run(root);
    assert.notEqual(result.status,0);
    assert.equal(JSON.parse(readFileSync(join(root,'web/public/data/tan_hoi/meta.json'),'utf8')).contract_version,'2.0.0');
  }
});
