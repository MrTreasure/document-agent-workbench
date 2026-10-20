import { processDocument } from './pipeline.js';
const filename = process.argv[2];
if (!filename) throw new Error('Usage: pnpm process <file.txt|md|epub|docx|pdf> [--live]');
const job = await processDocument(filename, process.argv.includes('--live') ? 'live' : 'demo');
console.log(JSON.stringify({ id: job.id, state: job.state, sentences: job.sentences.length, cacheHits: job.cacheHits, requests: job.requests, error: job.error }, null, 2));
if (job.state !== 'completed') process.exitCode = 1;
