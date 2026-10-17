export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 100;
export const MAX_TEXT_LENGTH = 2000000;
export const RULES_VERSION = '2026-10-11';
export const SPELLING_RULES = Object.freeze([
  ['안되요', '안 돼요', '띄어쓰기·표기', '부정 표현의 띄어쓰기와 ‘되어요’의 준말을 확인하세요.'],
  ['어의없', '어이없', '표기', '어이가 없다는 뜻의 표기를 확인하세요.'],
  ['어의 없', '어이없', '표기', '어이가 없다는 뜻의 표기를 확인하세요.'],
  ['왠만', '웬만', '표기', '정도를 나타내는 ‘웬만’을 확인하세요.'],
  ['왠지 모르게', '왠지 모르게', '제외', ''],
  ['웬지', '왠지', '표기', '‘왜인지’의 준말인지 확인하세요.'],
  ['몇일', '며칠', '표기', '날짜나 기간을 나타내는 ‘며칠’을 확인하세요.'],
  ['되요', '돼요', '표기', '‘되어요’로 풀어 쓸 수 있는지 확인하세요.'],
  ['됬', '됐', '표기', '‘되었’의 준말인지 확인하세요.'],
  ['뵈요', '봬요', '표기', '‘뵈어요’의 준말인지 확인하세요.'],
  ['설겆이', '설거지', '표기', '명사 ‘설거지’의 표기를 확인하세요.'],
  ['역활', '역할', '표기', '맡은 임무를 뜻하는 ‘역할’을 확인하세요.'],
  ['희안', '희한', '표기', '낯설거나 신기하다는 뜻인지 확인하세요.'],
  ['오랫만', '오랜만', '표기', '시간이 지난 뒤라는 뜻의 ‘오랜만’을 확인하세요.'],
  ['금새', '금세', '표기', '‘금시에’의 준말인 경우 ‘금세’입니다. 다른 의미라면 유지하세요.'],
  ['할께', '할게', '표기', '의지를 나타내는 종결 어미 ‘-ㄹ게’를 확인하세요.'],
  ['갈께', '갈게', '표기', '의지를 나타내는 종결 어미 ‘-ㄹ게’를 확인하세요.'],
  ['할수 있다', '할 수 있다', '띄어쓰기', '의존 명사 ‘수’를 띄어 쓰는지 확인하세요.'],
  ['할수 있는', '할 수 있는', '띄어쓰기', '의존 명사 ‘수’를 띄어 쓰는지 확인하세요.'],
  ['할수 없다', '할 수 없다', '띄어쓰기', '의존 명사 ‘수’를 띄어 쓰는지 확인하세요.'],
  ['할것', '할 것', '띄어쓰기', '의존 명사 ‘것’을 띄어 쓰는지 확인하세요.'],
  ['할때', '할 때', '띄어쓰기', '때를 나타내는 명사를 띄어 쓰는지 확인하세요.'],
  ['할지 모르', '할지 모르', '제외', ''],
  ['뿐만아니라', '뿐만 아니라', '띄어쓰기', '‘아니라’ 앞의 띄어쓰기를 확인하세요.'],
].filter(rule => rule[0] !== rule[1]).map(([from, to, type, reason]) => Object.freeze({ from, to, type, reason })));
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
export function normalizeText(text) { return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\u00ad/g, ''); }
export function countVisible(text) { let total = 0; for (const _ of segmenter.segment(text)) total++; return total; }
export function countCharacters(text) {
  const normalized = normalizeText(text);
  return { withSpaces: countVisible(normalized.replace(/\n/g, '')), withoutSpaces: countVisible(normalized.replace(/\s/g, '')) };
}
export function textFromItems(items) {
  let text = '', previous = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    if (item.str && previous && !/\s$/.test(text) && !/^\s/.test(item.str)) {
      const gap = item.transform?.[4] - (previous.transform?.[4] + previous.width);
      const threshold = Math.max(1, Math.abs(previous.height || 10) * .2);
      if (Number.isFinite(gap) && gap > threshold) text += ' ';
    }
    text += item.str;
    if (item.hasEOL) { text += '\n'; previous = null; } else if (item.str) previous = item;
  }
  return normalizeText(text).replace(/\n+$/, '');
}
export function checkSpelling(text, pageNumber) {
  const normalized = normalizeText(text), matches = [];
  for (const rule of SPELLING_RULES) {
    let from = 0, index;
    while ((index = normalized.indexOf(rule.from, from)) >= 0) {
      matches.push({ index, end: index + rule.from.length, ...rule });
      if (matches.length > 10000) throw new Error('TOO_MANY_CANDIDATES');
      from = index + rule.from.length;
    }
  }
  matches.sort((a, b) => a.index - b.index || b.end - a.end);
  let end = -1, scanned = 0, line = 1, column = 1, lineStart = 0;
  const result = [];
  for (const match of matches) {
    if (match.index < end) continue;
    end = match.end;
    const between = normalized.slice(scanned, match.index), lastBreak = between.lastIndexOf('\n');
    if (lastBreak >= 0) {
      for (const character of between) if (character === '\n') line++;
      lineStart = scanned + lastBreak + 1;
      column = countVisible(between.slice(lastBreak + 1)) + 1;
    } else column += countVisible(between);
    scanned = match.index;
    result.push({ page: pageNumber, line, column,
      original: match.from, suggestion: match.to, type: match.type, reason: match.reason,
      context: normalized.slice(Math.max(lineStart, match.index - 24), Math.min(normalized.length, match.end + 24)).replace(/\n/g, ' ') });
  }
  return result;
}
export function analyzePage(text, page, method, confidence = null) {
  const normalized = normalizeText(text);
  if (normalized.length > MAX_TEXT_LENGTH) throw new Error('TEXT_LIMIT');
  return { page, method, confidence, text: normalized, ...countCharacters(normalized), issues: checkSpelling(normalized, page) };
}
export function summarizePages(pages) {
  return { pageCount: pages.length, withSpaces: pages.reduce((sum, page) => sum + page.withSpaces, 0),
    withoutSpaces: pages.reduce((sum, page) => sum + page.withoutSpaces, 0),
    issues: pages.flatMap(page => page.issues), ocrPages: pages.filter(page => page.method === 'OCR').length,
    emptyPages: pages.filter(page => page.withoutSpaces === 0).map(page => page.page) };
}
