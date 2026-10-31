import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { canonicalFacts, updateFactsFile, recordFacts, FACTS_PATH } from '../record-facts.mjs';

const rows = [{ start:'2026-11-01T19:00:00+09:00', title:'ハキマックス 実演' }];
async function temporary(action) {
  const dir = await mkdtemp(join(tmpdir(),'qvc-facts-'));
  try { await action(dir); } finally { assert.equal(resolve(dirname(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('qvc-facts-'));await rm(dir,{recursive:true,force:true}); }
}

test('facts omit refresh time, normalize order/whitespace, and reject empty/fake guest data', () => {
  const second={start:'2026-11-02T07:00:00+09:00',title:'便利な商品'};
  assert.equal(canonicalFacts([second,...rows]),canonicalFacts([...rows,second]));
  assert.equal(canonicalFacts([{...rows[0],title:'ハキマックス　実演'}]),canonicalFacts(rows));
  assert.throws(()=>canonicalFacts([]));
  assert.throws(()=>canonicalFacts([{...rows[0],start:'2026-02-30T19:00:00+09:00'}]));
  assert.doesNotMatch(canonicalFacts(rows),/retrieved|expires|timestamp|status/);
});

test('unchanged programmes never rewrite factual file even when metadata changes', async () => {
  await temporary(async dir=>{
    const raw=JSON.stringify({guestId:'1320',programmes:rows,retrievedUtc:'first fetch'});
    assert.equal(await updateFactsFile(dir,raw),true);
    const file=join(dir,FACTS_PATH);const before=await stat(file);
    assert.equal(await updateFactsFile(dir,JSON.stringify({guestId:'1320',programmes:rows,retrievedUtc:'later fetch'})),false);
    assert.equal((await stat(file)).mtimeMs,before.mtimeMs);
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{guestId:'1320',programmes:rows});
    await assert.rejects(()=>updateFactsFile(dir,JSON.stringify({guestId:'other',programmes:rows})));
  });
});

test('only genuine changes reach the restricted commit/push sequence; no heartbeat', async () => {
  await temporary(async dir=>{
    const raw=canonicalFacts(rows);const commands=[];
    const runGit=args=>{commands.push(args);return args[0]==='diff'?FACTS_PATH+'\n':'';};
    assert.equal(await recordFacts({repoDir:dir,raw,branch:'main',runGit}),true);
    assert.deepEqual(commands.find(args=>args[0]==='add'),['add','--',FACTS_PATH]);
    assert.deepEqual(commands.find(args=>args[0]==='push'),['push','origin','HEAD:refs/heads/main']);
    assert.ok(commands.some(args=>args.includes('commit')));
    assert.ok(commands.every(args=>!args.includes('--force')&&!args.includes('--allow-empty')));
    commands.length=0;
    assert.equal(await recordFacts({repoDir:dir,raw,branch:'main',runGit}),false);
    assert.deepEqual(commands,[['status','--porcelain']]);
    await assert.rejects(()=>recordFacts({repoDir:dir,raw,branch:'main',runGit:()=>'? unrelated.txt'}));
  });
});
