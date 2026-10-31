import { readFile, mkdir, writeFile, rename, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanTitle, programmeStart, validateSavedFeed, responseFor, GUEST } from './feed.mjs';

export const FACTS_PATH = 'data/last-programmes.json';

export function canonicalFacts(programmes) {
  if (!Array.isArray(programmes) || programmes.length === 0 || programmes.length > 200) throw new Error('Invalid programme facts');
  const unique = new Map();
  for (const row of programmes) {
    if (!row || typeof row.start !== 'string') throw new Error('Invalid programme time');
    const dateKey = row.start.slice(0,16).replace(/[-T:]/g,'');
    if (programmeStart(`https://qvc.jp/content/programguide.qvc.${dateKey}.html`) !== row.start) throw new Error('Invalid programme date');
    const title = cleanTitle(row.title);
    if (title.length < 2 || title.length > 300) throw new Error('Invalid programme title');
    if (unique.has(row.start) && unique.get(row.start) !== title) throw new Error('Conflicting programme titles');
    unique.set(row.start, title);
  }
  const facts = { guestId: GUEST.id, programmes: [...unique].map(([start,title]) => ({start,title})).sort((a,b) => a.start.localeCompare(b.start)) };
  const json = JSON.stringify(facts);
  // Keep the job output/environment comfortably below platform size limits.
  if (Buffer.byteLength(json) > 60_000) throw new Error('Programme facts exceed reviewed transfer limit');
  return json;
}

export async function factsOutput(feedPath, outputPath, clock = Date.now) {
  const feed = JSON.parse(await readFile(feedPath, 'utf8'));
  if (!validateSavedFeed(feed) || responseFor(feed, clock()).body.status !== 'fresh') throw new Error('Cannot record unverified/expired source');
  const facts = canonicalFacts(feed.programmes);
  // JSON.stringify escapes every physical newline from titles. No shell parsing.
  await appendFile(outputPath, `facts=${facts}\n`, 'utf8');
  return facts;
}

export async function updateFactsFile(repoDir, raw) {
  const parsed = JSON.parse(raw);
  if (parsed.guestId !== GUEST.id) throw new Error('Wrong guest identity');
  const canonical = canonicalFacts(parsed.programmes);
  const pretty = JSON.stringify(JSON.parse(canonical), null, 2) + '\n';
  const target = join(repoDir, FACTS_PATH);
  let previous = null;
  try { previous = JSON.parse(await readFile(target, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && previous.guestId === GUEST.id && canonicalFacts(previous.programmes) === canonical) return false;
  await mkdir(join(repoDir,'data'), {recursive:true});
  await writeFile(target + '.tmp', pretty, 'utf8');
  await rename(target + '.tmp', target);
  return true;
}

export async function recordFacts({ repoDir = process.cwd(), raw, branch, runGit } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch ?? '') || branch.includes('..')) throw new Error('Invalid default branch');
  const git = runGit ?? (args => execFileSync('git', args, { cwd:repoDir, encoding:'utf8', stdio:['ignore','pipe','pipe'] }));
  const initial = git(['status','--porcelain']).trim();
  if (initial) throw new Error('Record job requires a clean checkout');
  if (!await updateFactsFile(repoDir,raw)) return false;
  git(['add','--',FACTS_PATH]);
  const staged = git(['diff','--cached','--name-only']).trim();
  if (staged !== FACTS_PATH) throw new Error('Refusing to commit anything beyond programme facts');
  git(['-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m','Update official Fukushima programme facts','--',FACTS_PATH]);
  // No force, rebase, timestamp-only commit, or empty commit. A concurrent source
  // change rejects this push safely; the next scheduled run can retry.
  git(['push','origin',`HEAD:refs/heads/${branch}`]);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const task = process.argv[2];
  const action = task === '--output-for-actions'
    ? factsOutput('public/qvc-fukushima.json',process.env.GITHUB_OUTPUT)
    : task === '--commit-changed-facts'
      ? recordFacts({ raw:process.env.QVC_FACTS_JSON, branch:process.env.QVC_DEFAULT_BRANCH })
      : Promise.reject(new Error('Unknown record-facts operation'));
  action.then(changed => { if (task !== '--output-for-actions') console.log(changed?'Recorded genuine programme changes':'Programme facts unchanged; no commit'); }).catch(error => { console.error(error.message); process.exitCode=1; });
}
