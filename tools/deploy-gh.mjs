#!/usr/bin/env node
/*
 * deploy-gh.mjs —— 一键把 jjchess 推上 GitHub 并跑云编译
 *
 * 用法：
 *   1. 把 GitHub Personal Access Token 写进
 *      C:\Users\Administrator\Desktop\富江富江\token.txt
 *      （或设环境变量 GH_TOKEN）
 *   2. node tools/deploy-gh.mjs [仓库名]
 *
 * 做的事：
 *   校验身份 → 建私有仓库 → 设置 remote → push
 *   → 触发 build-ios-app → 轮询 → 下载 artifact → 解出 ipa
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOKEN_FILE = path.resolve(ROOT, '..', 'token.txt');
const REPO_NAME = process.argv[2] || 'jjcheat';
const API = 'https://api.github.com';

// ---------- 取 token ----------
function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t) return t;
  }
  return null;
}

const TOKEN = getToken();
if (!TOKEN) {
  console.error('找不到 token。请把 Personal Access Token 写进：');
  console.error('  ' + TOKEN_FILE);
  process.exit(2);
}

async function api(p, opts = {}) {
  const res = await fetch(API + p, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jjcheat-deploy',
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: false });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 主流程 ----------
(async () => {
  console.log('==========================================');
  console.log('  JJCheat 自动上云编译');
  console.log('==========================================\n');

  // 1) 身份
  const me = await api('/user');
  if (me.status !== 200) {
    console.error('token 校验失败：HTTP ' + me.status);
    console.error(me.text.slice(0, 300));
    if (me.status === 401) console.error('\n→ token 无效或已过期，重新生成一个');
    process.exit(3);
  }
  const user = me.json.login;
  console.log('[1/7] 身份校验通过：' + user);

  // 2) 权限
  const scopes = me.headers.get('x-oauth-scopes');
  if (scopes !== null) {
    console.log('      权限范围：' + (scopes || '(none)'));
    const need = ['repo', 'workflow'];
    const missing = need.filter(s => !scopes.includes(s));
    if (missing.length) {
      console.error('\n→ token 缺少权限：' + missing.join(', '));
      console.error('  重新生成时请勾选 repo（全选）和 workflow');
      process.exit(4);
    }
  }

  // 3) 建仓库
  const exists = await api(`/repos/${user}/${REPO_NAME}`);
  let repoUrl;
  if (exists.status === 200) {
    repoUrl = exists.json.html_url;
    console.log('[2/7] 仓库已存在，复用：' + repoUrl);
  } else {
    const created = await api('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: REPO_NAME,
        private: true,
        description: 'JJ象棋 实时辅助（录屏+画中画 / 越狱Tweak 双形态）',
        has_issues: false,
        has_wiki: false,
        has_projects: false
      })
    });
    if (created.status !== 201) {
      console.error('建仓库失败：HTTP ' + created.status);
      console.error(created.text.slice(0, 400));
      process.exit(5);
    }
    repoUrl = created.json.html_url;
    console.log('[2/7] 仓库已创建（私有）：' + repoUrl);
  }

  // 4) 设置 remote
  const gitDir = path.join(ROOT, '.git');
  if (!fs.existsSync(gitDir)) {
    console.error('本地没有 git 仓库，先跑 git init');
    process.exit(6);
  }
  const remoteUrl = `https://github.com/${user}/${REPO_NAME}.git`;
  const existingRemote = sh('git', ['remote', 'get-url', 'origin'], ROOT);
  if (existingRemote.code === 0) {
    sh('git', ['remote', 'set-url', 'origin', remoteUrl], ROOT);
  } else {
    sh('git', ['remote', 'add', 'origin', remoteUrl], ROOT);
  }
  console.log('[3/7] remote 已设置：' + remoteUrl);

  // 5) push（token 走 extraheader，不落地到 .git/config）
  const basic = Buffer.from(`x-access-token:${TOKEN}`).toString('base64');
  console.log('[4/7] 推送中…');
  const push = spawnSync('git', [
    '-c', `http.extraHeader=AUTHORIZATION: basic ${basic}`,
    'push', '-u', 'origin', 'HEAD:main', '--force'
  ], { cwd: ROOT, encoding: 'utf8' });
  if (push.status !== 0) {
    console.error('推送失败：');
    console.error(((push.stdout || '') + (push.stderr || '')).slice(0, 1200));
    process.exit(7);
  }
  console.log('      推送成功');

  // 6) 触发 workflow
  await sleep(2500);
  const wfFile = 'build-ios-app.yml';
  const disp = await api(`/repos/${user}/${REPO_NAME}/actions/workflows/${wfFile}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main' })
  });
  console.log('[5/7] 触发云编译：HTTP ' + disp.status + (disp.status === 204 ? '（已排队）' : ''));

  // 7) 轮询
  console.log('[6/7] 等待编译（macOS 机器，通常 6~12 分钟）…\n');
  let runId = null;
  const deadline = Date.now() + 45 * 60 * 1000;
  let lastStatus = '';

  while (Date.now() < deadline) {
    const runs = await api(`/repos/${user}/${REPO_NAME}/actions/runs?per_page=5`);
    if (runs.status === 200 && runs.json.workflow_runs?.length) {
      const run = runs.json.workflow_runs.find(r => r.path.endsWith(wfFile));
      if (run) {
        runId = run.id;
        const line = `      ${run.status} / ${run.conclusion || '-'}  (${new Date(run.created_at).toLocaleTimeString()})`;
        if (line !== lastStatus) {
          console.log(line);
          lastStatus = line;
        }
        if (run.status === 'completed') break;
      }
    }
    await sleep(12000);
  }

  if (!runId) {
    console.error('\n没找到 workflow run。去仓库 Actions 页看看：');
    console.error(`  ${repoUrl}/actions`);
    process.exit(8);
  }

  const finalRun = await api(`/repos/${user}/${REPO_NAME}/actions/runs/${runId}`);
  const conclusion = finalRun.json?.conclusion;
  console.log('\n      结论：' + conclusion);
  console.log('      日志：' + repoUrl + '/actions/runs/' + runId);

  if (conclusion !== 'success') {
    console.error('\n编译失败了。把上面那个日志链接打开，把红色的报错段落发我。');
    process.exit(9);
  }

  // 8) 下载 artifact
  const arts = await api(`/repos/${user}/${REPO_NAME}/actions/runs/${runId}/artifacts`);
  const list = arts.json?.artifacts || [];
  const target = list.find(a => a.name === 'JJCheat-ipa') || list[0];
  if (!target) {
    console.error('没有 artifact');
    process.exit(10);
  }

  const dl = await fetch(target.archive_download_url, {
    headers: { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'jjcheat-deploy' },
    redirect: 'follow'
  });
  if (!dl.ok) {
    console.error('下载 artifact 失败：HTTP ' + dl.status);
    process.exit(11);
  }
  const buf = Buffer.from(await dl.arrayBuffer());
  const outDir = path.join(ROOT, 'build');
  fs.mkdirSync(outDir, { recursive: true });
  const zipPath = path.join(outDir, 'JJCheat-ipa.zip');
  fs.writeFileSync(zipPath, buf);
  console.log('\n[7/7] 已下载：' + zipPath + '  (' + (buf.length / 1024 / 1024).toFixed(1) + ' MB)');

  // 解压（Windows 用 tar，macOS/Linux 用 unzip）
  let unz = sh('tar', ['-xf', zipPath, '-C', outDir], ROOT);
  if (unz.code !== 0) unz = sh('unzip', ['-o', zipPath, '-d', outDir], ROOT);

  const ipaPath = path.join(outDir, 'JJCheat-unsigned.ipa');
  if (fs.existsSync(ipaPath)) {
    const sz = fs.statSync(ipaPath).size;

    // 硬校验：ipa 里必须带 engine.js 和录屏扩展，否则装上也是废的
    const listing = sh('tar', ['-tf', ipaPath], ROOT).out;
    const hasEngine = listing.includes('engine.js');
    // 录屏扩展已移除（改成拍照/截图识别），不再校验 appex
const hasAppex = true;
    const hasApp = listing.includes('JJCheatApp.app/JJCheatApp');

    console.log('      ipa 已就绪：' + ipaPath + '  (' + (sz / 1024 / 1024).toFixed(2) + ' MB)');
    console.log('      内容校验：');
    console.log('        主程序          ' + (hasApp ? 'OK' : '缺失 <<<'));
    
    console.log('        engine.js       ' + (hasEngine ? 'OK' : '缺失 <<<'));

    if (!hasEngine || !hasApp) {
      console.error('\n包不完整，先别装。把这段报错发我。');
      process.exit(12);
    }

    console.log('\n==========================================');
    console.log('  下一步：用 Sideloadly 把它签进 iPhone');
    console.log('==========================================');
  } else {
    console.log('      解压完成，检查 ' + outDir + ' 目录');
  }

  console.log('\n仓库地址：' + repoUrl);
})().catch(e => {
  console.error('异常：', e);
  process.exit(1);
});
