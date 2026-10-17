import { RULES_VERSION } from './pdf-analysis.mjs';
const encoder = new TextEncoder();
const xml = value => String(value).toWellFormed().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) { let result = 0xffffffff; for (const byte of bytes) result = crcTable[(result ^ byte) & 255] ^ (result >>> 8); return (result ^ 0xffffffff) >>> 0; }
function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out;
}
function zip(files) {
  const locals = [], central = []; let offset = 0;
  for (const [name, content] of files) {
    const bytes = encoder.encode(content), filename = encoder.encode(name), checksum = crc32(bytes);
    const local = new Uint8Array(30), view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true); view.setUint32(14, checksum, true); view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true); view.setUint16(26, filename.length, true);
    const entry = new Uint8Array(46), entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true); entryView.setUint16(4, 20, true); entryView.setUint16(6, 20, true);
    entryView.setUint16(8, 0x800, true); entryView.setUint16(14, 33, true); entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, bytes.length, true); entryView.setUint32(24, bytes.length, true);
    entryView.setUint16(28, filename.length, true); entryView.setUint32(42, offset, true);
    locals.push(local, filename, bytes); central.push(entry, filename); offset += 30 + filename.length + bytes.length;
  }
  const directory = concat(central), end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true);
  endView.setUint32(12, directory.length, true); endView.setUint32(16, offset, true);
  return concat([...locals, directory, end]);
}
const column = number => { let label = ''; for (let n = number + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label; return label; };
function sheet(rows, widths, headerRows = new Set([0]), filterRow = null) {
  const height = (row, r) => Math.max(headerRows.has(r) ? 26 : 24, ...row.map((value, column) => {
    let units = 0; for (const character of String(value ?? '')) units += character.codePointAt(0) > 127 ? 2 : 1;
    return Math.ceil(units / Math.max(1, (widths[column] || 20) - 2)) * 20 + 8;
  }));
  const body = rows.map((row, r) => `<row r="${r + 1}" ht="${height(row, r)}" customHeight="1">${row.map((value, c) => {
    const ref = `${column(c)}${r + 1}`, style = headerRows.has(r) ? 1 : 0;
    return typeof value === 'number' && Number.isFinite(value)
      ? `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`
      : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value ?? '').slice(0, 32767))}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData>${filterRow === null ? '' : `<autoFilter ref="A${filterRow + 1}:${column(widths.length - 1)}${rows.length}"/>`}</worksheet>`;
}
export function buildReportSheets(result, includeContext = false) {
  const { summary, pages } = result;
  const summaryRows = [
    ['PDF 검사 요약', '값', '기준'],
    ['전체 쪽 수', summary.pageCount, '빈 쪽 포함'],
    ['글자 수 공백 포함', summary.withSpaces, '줄바꿈 제외, 문장부호 포함, 보이는 문자 단위'],
    ['글자 수 공백 제외', summary.withoutSpaces, '공백·탭·줄바꿈 제외'],
    ['교정 후보 수', summary.issues.length, '규칙 기반 후보, 문맥 검토 필요'],
    ['OCR 처리 쪽 수', summary.ocrPages, '인식 결과에 따라 글자 수가 달라질 수 있음'],
    ['텍스트 미인식 쪽', summary.emptyPages.length ? summary.emptyPages.join(', ') : '없음', '빈 쪽인지 인식 실패인지 원문 확인'],
    ['검사 규칙 버전', RULES_VERSION, '정밀 문법·문맥 검사는 포함하지 않음'],
    ['처리 위치', '현재 브라우저', '파일과 결과의 업로드·자동 저장 없음'],
    ['쪽', '공백 포함', '공백 제외', '읽기 방식', 'OCR 신뢰도', '교정 후보'],
    ...pages.map(page => [page.page, page.withSpaces, page.withoutSpaces, page.method, page.confidence === null ? '' : Math.round(page.confidence), page.issues.length])
  ];
  const candidates = [['쪽', '추출 줄', '추출 위치', '원문 표현', '교정 후보', '분류', '확인 이유', ...(includeContext ? ['주변 문맥'] : [])],
    ...summary.issues.map(issue => [issue.page, issue.line, issue.column, issue.original, issue.suggestion, issue.type, issue.reason, ...(includeContext ? [issue.context] : [])])];
  if (!summary.issues.length) candidates.push(['', '', '', '등록된 규칙에 해당하는 후보 없음', '', '', '오류가 없다는 뜻은 아닙니다.', ...(includeContext ? [''] : [])]);
  return [
    { name: '검사 요약', rows: summaryRows, widths: [30, 24, 66, 18, 18, 16], headerRows: new Set([0, 9]), filterRow: null },
    { name: '교정 후보', rows: candidates, widths: [8, 12, 12, 24, 24, 20, 64, ...(includeContext ? [80] : [])], headerRows: new Set([0]), filterRow: 0 }
  ];
}
export function createReportXlsx(result, includeContext = false) {
  const sheets = buildReportSheets(result, includeContext);
  const types = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((item, i) => `<sheet name="${xml(item.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7EFE9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip([
    ['[Content_Types].xml', types], ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', rels], ['xl/styles.xml', styles],
    ...sheets.map((item, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheet(item.rows, item.widths, item.headerRows, item.filterRow)])
  ]);
}
