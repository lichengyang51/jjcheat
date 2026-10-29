#!/usr/bin/env node
/* show-log.mjs —— 拉取最近一次 workflow run 的完整日志 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOKEN_FILE = path.resolve(ROOT, '..', 'token.txt');

const TOKEN = (process.env.GH_TOKEN || fs.readFileSync(TOKEN_FILE, 'utf8')).trim();
const OWNER = process.argv[2] || 'lichengyang51';
const REPO = process.argv[3] || 'jjcheat';
const RUN_ID = process.argv[4] || '';
const API = 'https://api.github.com';

const H = {
  Authorization: 'Bearer ' + TOKEN,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'jjcheat-log'
};

async function get(p) {
  const r = await fetch(API + p, { headers: H });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch {}
  return { status: r.status, json: j, text: t };
}

(async () => {
  let runId = RUN_ID;
  if (!runId) {
    const runs = await get(`/repos/${OWNER}/${REPO}/actions/runs?per_page=3`);
    runId = runs.json?.workflow_runs?.[0]?.id;
    if (!runId) { console.error('没有 run'); process.exit(1); }
  }
  console.log('run_id =', runId);

  const jobs = await get(`/repos/${OWNER}/${REPO}/actions/runs/${runId}/jobs`);
  const list = jobs.json?.jobs || [];
  if (!list.length) { console.error('没有 job'); process.exit(1); }

  for (const job of list) {
    console.log(`\n===== JOB: ${job.name}  [${job.status}/${job.conclusion}] =====`);
    const steps = job.steps || [];
    for (const s of steps) {
      const mark = s.conclusion === 'success' ? 'OK  ' : (s.conclusion === 'failure' ? 'FAIL' : '    ');
      console.log(`  ${mark}  ${s.number}. ${s.name}  (${s.conclusion || s.status})`);
    }

    const r = await fetch(`${API}/repos/${OWNER}/${REPO}/actions/jobs/${job.id}/logs`, {
      headers: { ...H, Accept: 'application/vnd.github+json' },
      redirect: 'follow'
    });
    if (!r.ok) {
      console.log('  拉日志失败 HTTP', r.status);
      continue;
    }
    const text = await r.text();
    const outFile = path.join(ROOT, 'build', `log-${job.id}.txt`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, text, 'utf8');
    console.log('  完整日志:', outFile, `(${text.length} 字节)`);

    // 只打印含 error 的行
    const lines = text.split('\n');
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (/\berror:|\berror\b|failed|FAIL|Error Domain|Undefined symbol|does not conform|ambiguous|cannot find|no such module|Value of type/i.test(L)) {
        hits.push(`${i + 1}: ${L}`);
      }
    }
    console.log('\n  ---- 命中行（最多 120 条） ----');
    console.log(hits.slice(0, 120).join('\n') || '  (没有匹配到关键字)');
  }
})();
