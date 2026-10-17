import test from 'node:test';
import assert from 'node:assert/strict';
import { countCharacters, checkSpelling, textFromItems, analyzePage, summarizePages } from '../dist/pdf-analysis.mjs';
import { buildReportSheets, createReportXlsx } from '../dist/excel-export.mjs';

test('character counts include punctuation but exclude newlines and distinguish spaces', () => {
  assert.deepEqual(countCharacters('가 나.\r\n다\t!'), { withSpaces: 7, withoutSpaces: 5 });
});
test('visible counts normalize Hangul and count emoji as one grapheme', () => {
  assert.deepEqual(countCharacters('\u1100\u1161 👩‍🏫'), { withSpaces: 3, withoutSpaces: 2 });
});
test('spelling reports page, extracted line and column without duplicate overlapping candidates', () => {
  const issues = checkSpelling('가\n안되요 몇일', 2);
  assert.equal(issues.length, 2);
  assert.deepEqual([issues[0].original, issues[0].suggestion, issues[0].page, issues[0].line, issues[0].column], ['안되요', '안 돼요', 2, 2, 1]);
  assert.equal(issues[1].suggestion, '며칠');
});
test('valid expressions are not flagged and zero candidates does not claim correctness', () => {
  assert.equal(checkSpelling('며칠 뒤에 봬요. 웬만하면 돼요. 할 수 있어요.', 1).length, 0);
});
test('candidate positions track Unicode and several lines with one forward scan', () => {
  const issues = checkSpelling('가 몇일\n\n👩‍🏫 되요 몇일', 1);
  assert.deepEqual(issues.map(issue => [issue.line, issue.column]), [[1, 3], [3, 3], [3, 6]]);
});
test('text and candidate limits reject oversized work before export', () => {
  assert.throws(() => analyzePage('가'.repeat(2000001), 1, 'PDF 텍스트'), /TEXT_LIMIT/);
  assert.throws(() => checkSpelling('몇일 '.repeat(10001), 1), /TOO_MANY_CANDIDATES/);
});
test('PDF item positions insert actual gaps but do not split adjacent Korean fragments', () => {
  const item = (str, x, width, hasEOL = false) => ({ str, transform: [1, 0, 0, 1, x, 100], width, height: 10, hasEOL });
  assert.equal(textFromItems([item('가', 0, 10), item('나', 10, 10), item('다', 30, 10, true), item('라', 0, 10)]), '가나 다\n라');
});
test('summary preserves empty page and OCR method instead of silently losing pages', () => {
  const pages = [analyzePage('몇일', 1, 'PDF 텍스트'), analyzePage('', 2, 'OCR', 0)];
  const summary = summarizePages(pages);
  assert.equal(summary.withSpaces, 2); assert.equal(summary.issues.length, 1);
  assert.equal(summary.ocrPages, 1); assert.deepEqual(summary.emptyPages, [2]);
});
test('report does not include whole document, filename or contexts unless requested', () => {
  const pages = [analyzePage('합성 문맥 몇일', 1, 'PDF 텍스트')], result = { pages, summary: summarizePages(pages) };
  const sheets = buildReportSheets(result);
  assert.equal(sheets.length, 2); assert.equal(sheets[1].rows[0].length, 7);
  assert.equal(JSON.stringify(sheets).includes('합성 문맥'), false);
  assert.equal(buildReportSheets(result, true)[1].rows[0].length, 8);
});
test('xlsx is a ZIP with inline text, typed counts and no executable formulas', () => {
  const pages = [analyzePage('몇일', 1, 'PDF 텍스트')];
  pages[0].issues[0].context = '=HYPERLINK("https://example.invalid","synthetic")<&';
  const bytes = createReportXlsx({ pages, summary: summarizePages(pages) }, true);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const content = new TextDecoder().decode(bytes);
  assert.ok(content.includes('t="inlineStr"')); assert.ok(content.includes('t="n"'));
  assert.ok(!content.includes('<f>')); assert.ok(content.includes('&lt;&amp;'));
});
