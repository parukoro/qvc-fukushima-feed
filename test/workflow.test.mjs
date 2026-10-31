import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Pages workflow uses scheduled/manual public standard runner and scoped publication', async () => {
  const yaml = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(yaml, /cron: '7,37 \* \* \* \*'/);
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /node-version: '22'/);
  assert.match(yaml, /runs-on: ubuntu-24\.04/g);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /package-manager-cache: false/);
  assert.match(yaml, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(yaml,/playwright install --with-deps chromium --no-shell/);
  assert.doesNotMatch(yaml,/--only-shell/);
  assert.match(yaml,/QVC_FEED_BROWSER_MODE: headed/);
  assert.match(yaml,/xvfb-run -a npm run export/);
  assert.match(yaml, /path: public/);
  assert.match(yaml, /retention-days: 1/);
  assert.match(yaml, /cancel-in-progress: false/);
  const actions = [...yaml.matchAll(/uses: ([\w/-]+)@([a-f0-9]+)/g)];
  assert.equal(actions.length, 6);
  assert.ok(actions.every(match => match[1].startsWith('actions/') && match[2].length === 40));
  assert.doesNotMatch(yaml, /secrets\.|git push|self-hosted|pull_request_target/);
  const recordJob = yaml.slice(yaml.indexOf('\n  record-facts:'));
  assert.match(recordJob,/contents: write/);
  assert.doesNotMatch(yaml.slice(0,yaml.indexOf('\n  record-facts:')),/contents: write/);
  assert.match(recordJob,/needs: \[build, deploy\]/);
  assert.match(recordJob,/QVC_FACTS_JSON: \$\{\{ needs.build.outputs.programme_facts \}\}/);
  assert.match(recordJob,/node record-facts.mjs --commit-changed-facts/);
});

test('lock file pins published exact Playwright pair with integrity', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url)));
  assert.deepEqual(lock.packages[''].dependencies, packageJson.dependencies);
  for (const name of ['playwright', 'playwright-core']) {
    const item = lock.packages['node_modules/' + name];
    assert.equal(item.version, '1.64.1');
    assert.ok(item.resolved.startsWith('https://registry.npmjs.org/'));
    assert.ok(item.integrity.startsWith('sha512-'));
  }
});
