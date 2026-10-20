import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { processDocument, nodeLabels, listJobs, loadJob, type Job } from './pipeline.js';

const port = Number(process.env.PORT ?? 3118);
const origin = `http://127.0.0.1:${port}`;
const data = resolve(process.env.DOCUMENT_AGENT_DATA_DIR ?? 'data');
let current: Job | null = null; let busy = false;
const server = createServer(async (request, response) => {
  const send = (status: number, value: unknown) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
  try {
    const path = new URL(request.url ?? '/', origin).pathname;
    if (request.method === 'GET' && path === '/api/state') { send(200, { current, busy, nodes: nodeLabels, liveConfigured: Boolean(process.env.DOCUMENT_AGENT_API_KEY), runs: (await listJobs()).slice(0, 20) }); return; }
    if (request.method === 'GET' && path.startsWith('/api/export/')) {
      const id = path.slice('/api/export/'.length); const job = await loadJob(id);
      if (!job.exportReady) { send(404, { error: 'No validated export' }); return; }
      response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'content-disposition': `attachment; filename="${id}.jsonl"` });
      response.end(await readFile(resolve(data, 'runs', id, 'results.jsonl'))); return;
    }
    if (request.method === 'POST' && path === '/api/runs') {
      if (request.headers.origin && request.headers.origin !== origin) { send(403, { error: 'Invalid origin' }); return; }
      if (!request.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'Expected JSON' }); return; }
      if (busy) { send(409, { error: '已有任务运行中' }); return; }
      busy = true;
      try {
        let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 300_000) throw new Error('Document exceeds request budget'); }
        const input = JSON.parse(raw); const mode = input.mode === 'live' ? 'live' : 'demo';
        let filename = resolve('examples/reading.txt');
        if (mode === 'live') {
          if (!process.env.DOCUMENT_AGENT_API_KEY) throw new Error('请在服务端环境变量中配置模型');
          if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 100_000) throw new Error('正文需为 1–100000 字符');
          await mkdir(resolve(data, 'inputs'), { recursive: true }); filename = resolve(data, 'inputs', `${randomUUID()}.txt`); await writeFile(filename, input.text);
        }
        current = await processDocument(filename, mode, job => { current = job; }); send(200, current);
      } finally { busy = false; }
      return;
    }
    const assets: Record<string, [string, string]> = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
    if (request.method === 'GET' && assets[path]) {
      const [file, mime] = assets[path]; response.writeHead(200, { 'content-type': mime + '; charset=utf-8', 'cache-control': 'no-store' }); response.end(await readFile(resolve('public', file))); return;
    }
    send(404, { error: 'Not found' });
  } catch (error) { send(400, { error: error instanceof Error ? error.message : 'Request failed' }); }
});
server.listen(port, '127.0.0.1', async () => {
  console.log(`Document Agent Workbench: ${origin}`);
  if (process.argv.includes('--demo')) { busy = true; try { current = await processDocument(resolve('examples/reading.txt'), 'demo', job => { current = job; }); } finally { busy = false; } }
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(); server.closeAllConnections(); });
