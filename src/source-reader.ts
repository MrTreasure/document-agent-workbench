// Adapted from language-learning-platform/apps/worker/src/source-reader.ts.
import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname } from 'node:path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { load } from 'cheerio';

export async function readSource(filename: string) {
  const path = await realpath(filename);
  const buffer = await readFile(path);
  if (buffer.length > 16 * 1024 * 1024) throw new Error('Source exceeds 16 MiB limit');
  const extension = extname(path).toLowerCase();
  let text = '';
  if (['.txt', '.md', '.markdown'].includes(extension)) text = buffer.toString('utf8');
  else if (extension === '.docx') text = (await mammoth.extractRawText({ buffer })).value;
  else if (extension === '.pdf') {
    try { text = (await promisify(execFile)('pdftotext', ['-layout', path, '-'], { maxBuffer: 16 * 1024 * 1024, timeout: 60_000 })).stdout; }
    catch { throw new Error('PDF extraction requires the local pdftotext command and a readable, unencrypted PDF'); }
    if (text.replace(/\s/g, '').length < 40) throw new Error('Scanned or empty PDF requires OCR; this standalone edition does not bundle OCR');
  } else if (extension === '.epub') {
    const zip = await JSZip.loadAsync(buffer);
    const container = await zip.file('META-INF/container.xml')?.async('string');
    const opfPath = container ? load(container, { xml: true })('rootfile').attr('full-path') : null;
    const opf = opfPath ? await zip.file(opfPath)?.async('string') : null;
    if (!opf || !opfPath) throw new Error('EPUB package missing');
    const $ = load(opf, { xml: true }); const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    for (const item of $('spine itemref').toArray()) {
      const ref = $(item).attr('idref');
      const href = $('manifest item').toArray().map(e => $(e)).find(e => e.attr('id') === ref)?.attr('href');
      if (!href) continue;
      const html = await zip.file(base + decodeURIComponent(href.split('#')[0]))?.async('string');
      if (html) { const dom = load(html); dom('script,style').remove(); dom('p,div,h1,h2,h3,li').append('\n\n'); dom('br').replaceWith('\n'); text += dom('body').text() + '\n\n'; }
      if (text.length > 2_000_000) throw new Error('Extracted EPUB exceeds text budget');
    }
  } else throw new Error('Supported sources: TXT, Markdown, DOCX, EPUB, text-based PDF');
  text = text.replaceAll('\u0000', '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || text.length > 2_000_000) throw new Error('No readable text or text budget exceeded');
  return { text, sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length, filename: path };
}
