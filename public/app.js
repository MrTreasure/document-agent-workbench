const $ = selector => document.querySelector(selector);
let mode = 'demo'; let latest; let pending = false; let actionError = '';
const labels = { completed: '已完成', failed: '失败', running: '运行中', skipped: '缓存复用', waiting: '已处理', resource_wait: '等待资源' };
function el(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function render(state) {
  latest = state;
  const job = state.current; const running = pending || state.busy;
  $('#run').disabled = running; $('#run').textContent = running ? '处理中…' : mode === 'demo' ? '运行演示' : '处理文档';
  $('#run-state').textContent = labels[job?.state] || '等待运行'; $('#run-state').className = `state ${job?.state || ''}`;
  $('#sentence-count').textContent = job?.sentences.length ?? '—'; $('#cache-count').textContent = job?.cacheHits ?? '—'; $('#request-count').textContent = job?.requests ?? '—';
  $('#valid-state').textContent = job?.exportReady ? '通过' : job?.state === 'failed' ? '未通过' : '—';
  $('#run-id').textContent = job?.id.slice(0, 18) ?? '尚未开始';
  $('#token-count').textContent = job?.inputTokens == null ? job?.mode === 'demo' ? '离线演示 · 无模型消耗' : '未采集' : `${job.inputTokens} 输入 / ${job.outputTokens ?? '未知'} 输出`;
  $('#error').textContent = actionError || job?.error || '';
  $('#nodes').replaceChildren(...state.nodes.map((node, index) => {
    const event = job?.events.filter(e => e.nodeId === node.id).at(-1); const item = el('div', null, `node ${event?.state || ''}`);
    const top = el('div', null, 'node-top'); top.append(el('span', String(index + 1).padStart(2, '0')), el('small', node.engine === 'ai' ? 'AI' : node.step === 'text.analyze' ? 'Intl' : 'LOCAL'));
    item.append(top, el('b', node.label), el('span', event ? labels[event.state] || event.state : '等待', 'node-state')); return item;
  }));
  $('#records').replaceChildren(...(job?.sentences.length ? job.sentences.map((sentence, index) => {
    const item = el('article', null, 'record'); const head = el('div', null, 'record-head'); head.append(el('span', `SENTENCE ${String(index + 1).padStart(2, '0')}`), el('code', sentence.id));
    item.append(head, el('h3', sentence.text), el('p', sentence.translationZh || '等待翻译', 'translation'));
    const tokens = el('div', null, 'tokens'); for (const token of sentence.tokens.filter(t => t.glossZh)) { const chip = el('span'); chip.append(el('b', token.text), el('small', token.glossZh)); tokens.append(chip); }
    item.append(tokens); return item;
  }) : [el('div', '运行文档后，在这里检查结构化结果。', 'empty')]));
  $('#export').hidden = !job?.exportReady; if (job?.exportReady) $('#export').href = `/api/export/${job.id}`;
  $('#history').replaceChildren(...state.runs.slice(0, 5).map(run => { const row = el('div', null, 'history-row'); row.append(el('code', run.id.slice(0, 12)), el('span', run.mode === 'demo' ? '演示' : '真实模型'), el('span', `${run.sentences.length} 句`), el('span', `${run.cacheHits} 缓存`), el('b', labels[run.state] || run.state)); return row; }));
}
async function refresh() { try { const response = await fetch('/api/state'); if (response.ok) render(await response.json()); } catch { $('#error').textContent = '服务连接中断，请刷新重试'; } }
function selectMode(value) { if (pending) return; mode = value; $('#demo-mode').classList.toggle('selected', mode === 'demo'); $('#live-mode').classList.toggle('selected', mode === 'live'); $('#source-text').readOnly = mode === 'demo'; $('#mode-badge').textContent = mode === 'demo' ? '离线演示' : '真实模型'; $('#mode-note').textContent = mode === 'demo' ? '预置英文与标注样例 · 不调用模型' : latest?.liveConfigured ? '已配置模型 · 正文将发送至供应商' : '请先设置服务端 DOCUMENT_AGENT_API_KEY 等环境变量'; if (latest) render(latest); }
$('#demo-mode').onclick = () => selectMode('demo'); $('#live-mode').onclick = () => selectMode('live');
$('#run').onclick = async () => { actionError = ''; pending = true; if (latest) render(latest); try { const response = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, text: $('#source-text').value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); } catch (error) { actionError = error.message; $('#error').textContent = actionError; } finally { pending = false; await refresh(); } };
$('#source-text').readOnly = true;
void refresh(); setInterval(() => { if (!document.hidden) void refresh(); }, 1000);
