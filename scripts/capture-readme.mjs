import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = resolve(import.meta.dirname, '..'); const origin = 'http://127.0.0.1:3119';
const output = resolve(root, 'docs/screenshots'); await mkdir(output, { recursive: true });
const child = spawn('pnpm', ['exec', 'tsx', 'src/server.ts', '--demo'], { cwd: root, detached: true,
  env: { ...process.env, PORT: '3119', DOCUMENT_AGENT_DATA_DIR: resolve(root, 'data', 'screenshots', randomUUID()), DOCUMENT_AGENT_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; child.stdout.on('data', chunk => { log = (log + chunk).slice(-2000); }); child.stderr.on('data', chunk => { log = (log + chunk).slice(-2000); });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 40; i++) { try { const response = await fetch(origin + '/api/state'); const state = await response.json(); if (state.current?.state === 'completed') { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  if (!ready) throw new Error('Demo not ready: ' + log);
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1150 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByText('一个小团队在海边建造了一座研究站。', { exact: true }).waitFor(); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(output, 'workbench.webp'), type: 'webp', quality: 86 });
  await page.getByRole('button', { name: '运行演示', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#cache-count')?.textContent === '4' && document.querySelector('#run-state')?.textContent === '已完成');
  await page.screenshot({ path: resolve(output, 'cache-reuse.webp'), type: 'webp', quality: 86 });
  await page.locator('.history').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'records.webp'), type: 'webp', quality: 86 });
  console.log('Captured actual offline processing and a second run with four cache hits.');
} finally { await browser?.close(); try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
