import { MAX_PDF_BYTES } from './pdf-analysis.mjs';
import { createReportXlsx } from './excel-export.mjs';

export function renderPdfInspector(main) {
  main.innerHTML = `
    <section class="pdf-page" aria-labelledby="pdf-title">
      <a class="back-link" href="#/">← 도구함으로</a>
      <p class="eyebrow">문서를 차분히 살펴보세요</p>
      <h1 id="pdf-title" tabindex="-1">PDF 글자 수 · 맞춤법</h1>
      <p class="pdf-intro">글자 수를 세고, 고칠 표현을 찾아보세요.<br>텍스트 PDF와 스캔·사진 PDF를 기기 안에서 읽습니다.</p>
      <p class="local-note">파일과 검사 결과는 현재 브라우저에서만 처리합니다. 업로드·자동 저장은 하지 않습니다.</p>
      <div class="pdf-picker-panel">
        <label for="pdf-file" class="picker-label">검사할 PDF 선택</label>
        <input id="pdf-file" type="file" accept=".pdf,application/pdf" aria-describedby="pdf-file-help pdf-error">
        <p id="pdf-file-help">파일을 이 영역으로 끌어 놓아도 됩니다. 최대 25MB · 100쪽</p>
        <label class="checkbox-row"><input id="force-ocr" type="checkbox">모든 쪽을 OCR로 읽기 <span>(사진과 텍스트가 섞인 PDF)</span></label>
        <div class="pdf-progress-row"><p id="pdf-status" role="status" aria-live="polite">PDF를 선택하면 검사를 시작합니다.</p><button id="pdf-cancel" type="button" hidden>검사 취소</button></div>
        <progress id="pdf-progress" aria-label="PDF 검사 진행" hidden></progress>
        <p id="pdf-error" class="input-error" role="alert"></p>
      </div>
      <section id="pdf-results" aria-labelledby="pdf-result-title" hidden>
        <div class="pdf-result-heading"><h2 id="pdf-result-title" tabindex="-1">검사 결과</h2><button id="pdf-clear" type="button">파일·결과 지우기</button></div>
        <div class="pdf-metrics">
          <div><span>전체 글자 수 · 공백 포함</span><strong id="count-with"></strong><small>줄바꿈 제외</small></div>
          <div><span>공백 제외</span><strong id="count-without"></strong><small>공백·탭·줄바꿈 제외</small></div>
          <div><span>교정 후보</span><strong id="count-issues"></strong><small>문맥 확인이 필요해요</small></div>
          <div><span>읽은 쪽</span><strong id="count-pages"></strong><small id="count-ocr"></small></div>
        </div>
        <p class="count-definition">문장부호·숫자를 포함해 보이는 문자 단위로 셉니다. 머리말·꼬리말도 포함하며, PDF 추출 순서와 OCR 결과에 따라 원문과 다를 수 있습니다.</p>
        <p id="pdf-warning" class="pdf-warning" role="status"></p>
        <div class="export-panel"><div><label class="checkbox-row"><input id="export-context" type="checkbox">엑셀에 주변 문맥 포함</label><p>기본 결과에는 요약·쪽별 글자 수·교정 후보만 담습니다. 문맥에는 개인정보가 포함될 수 있어요.</p></div><button id="pdf-export" class="primary-button" type="button">엑셀로 받기 ↓</button></div>
        <section class="candidate-section" aria-labelledby="candidate-title"><h3 id="candidate-title">맞춤법 교정 후보</h3><p class="candidate-explanation">흔한 오타·띄어쓰기 규칙을 확인합니다. 문맥을 이해하는 정밀 검사는 아니며, 후보가 없어도 맞춤법이 모두 맞다는 뜻은 아닙니다.</p><div id="candidate-list"></div><button id="candidate-more" type="button" hidden>후보 더 보기</button></section>
        <details class="page-detail"><summary>쪽별 글자 수와 추출 글자 확인</summary><div class="table-scroll" tabindex="0" aria-label="쪽별 글자 수 표"><table><caption class="sr-only">쪽별 글자 수와 읽기 방식</caption><thead><tr><th>쪽</th><th>공백 포함</th><th>공백 제외</th><th>읽기 방식</th><th>OCR 신뢰도</th></tr></thead><tbody id="page-counts"></tbody></table></div><label for="preview-page">확인할 쪽</label><select id="preview-page"></select><label class="sr-only" for="page-text">해당 쪽의 추출 텍스트</label><textarea id="page-text" readonly spellcheck="false" autocomplete="off" rows="9"></textarea><p>인식되지 않은 글자나 읽는 순서가 맞는지 원문 PDF와 비교해주세요. 줄·위치는 추출된 텍스트를 기준으로 합니다.</p></details>
      </section>
      <details class="timer-help"><summary>검사 방식과 개인정보 처리</summary><ul><li>글자가 없는 쪽은 한국어·영어 OCR로 읽습니다. 모든 쪽 OCR을 켜면 기존 텍스트 대신 이미지 인식 결과를 사용합니다.</li><li>흐릿한 사진, 손글씨, 표·다단 문서는 인식이 부정확할 수 있습니다. OCR 신뢰도는 인식 엔진의 지표이며 맞춤법 정확도가 아닙니다.</li><li>파일 이름·내용·결과를 서버나 외부 맞춤법 서비스에 보내지 않습니다. 브라우저 번역·확장 프로그램의 동작은 별도 설정을 확인하세요.</li><li>도구함으로 이동하거나 새로고침하면 검사 내용이 지워집니다. 다운로드한 엑셀 파일은 컴퓨터에 남습니다.</li><li>암호로 보호된 PDF는 검사하지 않습니다. 처리량이 큰 문서는 나누어 검사해주세요.</li></ul></details>
    </section>`;
  const find = selector => main.querySelector(selector);
  const input = find('#pdf-file'), panel = find('.pdf-picker-panel'), force = find('#force-ocr');
  const status = find('#pdf-status'), error = find('#pdf-error'), cancelButton = find('#pdf-cancel');
  const progress = find('#pdf-progress'), results = find('#pdf-results'), list = find('#candidate-list');
  const more = find('#candidate-more'), pageSelect = find('#preview-page'), preview = find('#page-text');
  const abort = new AbortController(), options = { signal: abort.signal };
  let active = true, generation = 0, inspector = null, result = null, displayed = 0, timeout = null;
  const write = (node, value) => { const text = String(value); if (node.textContent !== text) node.textContent = text; };
  const stopTimeout = () => { clearTimeout(timeout); timeout = null; };
  function busy(value) { input.disabled = value; force.disabled = value; cancelButton.hidden = !value; progress.hidden = !value; panel.setAttribute('aria-busy', String(value)); }
  function removeResult() {
    result = null; results.hidden = true; list.replaceChildren(); find('#page-counts').replaceChildren();
    pageSelect.replaceChildren(); preview.value = ''; find('#export-context').checked = false;
    for (const selector of ['#count-with', '#count-without', '#count-issues', '#count-pages', '#count-ocr', '#pdf-warning']) write(find(selector), '');
    more.hidden = true;
  }
  function clear() {
    generation++; stopTimeout(); void inspector?.cancel(); inspector = null;
    removeResult(); input.value = ''; write(error, ''); write(status, 'PDF를 선택하면 검사를 시작합니다.'); busy(false);
  }
  function addCandidates() {
    if (!result) return;
    const limit = Math.min(displayed + 50, result.summary.issues.length);
    for (const issue of result.summary.issues.slice(displayed, limit)) {
      const item = document.createElement('article'); item.className = 'candidate-card';
      const location = document.createElement('p'); location.className = 'candidate-location';
      location.textContent = `${issue.page}쪽 · 추출 ${issue.line}줄 ${issue.column}번째 · ${issue.type}`;
      const expression = document.createElement('p'); expression.className = 'candidate-expression';
      const before = document.createElement('span'), arrow = document.createElement('span'), after = document.createElement('strong');
      before.textContent = issue.original; arrow.textContent = ' → '; after.textContent = issue.suggestion;
      expression.append(before, arrow, after);
      const reason = document.createElement('p'); reason.className = 'candidate-reason'; reason.textContent = issue.reason;
      const details = document.createElement('details'), summary = document.createElement('summary'), context = document.createElement('p');
      summary.textContent = '주변 문맥 보기'; context.textContent = issue.context; details.append(summary, context);
      item.append(location, expression, reason, details); list.append(item);
    }
    displayed = limit; more.hidden = displayed >= result.summary.issues.length;
    if (!result.summary.issues.length) { const note = document.createElement('p'); note.className = 'empty-state'; note.textContent = '등록된 규칙에 해당하는 후보를 찾지 못했습니다. 원문을 함께 확인해주세요.'; list.append(note); }
  }
  function showResult(value) {
    result = value; results.hidden = false; displayed = 0;
    const { summary } = result;
    for (const [selector, count] of [['#count-with', summary.withSpaces], ['#count-without', summary.withoutSpaces], ['#count-issues', summary.issues.length], ['#count-pages', summary.pageCount]]) write(find(selector), count.toLocaleString('ko-KR'));
    write(find('#count-ocr'), `OCR ${summary.ocrPages}쪽`);
    const warnings = [];
    if (summary.ocrPages) warnings.push('OCR을 사용한 쪽은 글자 수와 교정 후보를 원문과 비교해주세요.');
    if (summary.emptyPages.length) warnings.push(`글자를 찾지 못한 쪽: ${summary.emptyPages.join(', ')}. 빈 쪽이거나 인식에 실패했을 수 있습니다.`);
    write(find('#pdf-warning'), warnings.join(' '));
    for (const page of result.pages) {
      const row = document.createElement('tr');
      for (const value of [page.page, page.withSpaces.toLocaleString('ko-KR'), page.withoutSpaces.toLocaleString('ko-KR'), page.method, page.confidence === null ? '—' : `${Math.round(page.confidence)} / 100`]) { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); }
      find('#page-counts').append(row);
      const option = document.createElement('option'); option.value = String(page.page); option.textContent = `${page.page}쪽`; pageSelect.append(option);
    }
    preview.value = result.pages[0]?.text || '';
    addCandidates(); write(status, '검사가 끝났습니다. 결과는 현재 브라우저에만 남아 있습니다.');
    find('#pdf-result-title').focus();
  }
  async function inspect(file) {
    if (!active || input.disabled || !file) return;
    clear(); const token = generation;
    if (!/\.pdf$/i.test(file.name)) { write(error, 'PDF 파일을 선택해주세요.'); return; }
    if (!file.size || file.size > MAX_PDF_BYTES) { write(error, '비어 있지 않은 25MB 이하 PDF를 선택해주세요.'); return; }
    busy(true); write(status, 'PDF 읽기 기능을 준비하고 있습니다.');
    let timedOut = false;
    timeout = setTimeout(() => { timedOut = true; void inspector?.cancel(); }, 10 * 60 * 1000);
    try {
      const { createPdfInspector } = await import('./pdf-reader.mjs');
      if (!active || token !== generation) return;
      const buffer = await file.arrayBuffer();
      if (!active || token !== generation) return;
      if (!new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024))).includes('%PDF-')) throw new Error('NOT_PDF');
      inspector = createPdfInspector();
      const value = await inspector.inspect(buffer, { forceOcr: force.checked, onProgress: (phase, percent) => {
        if (!active || token !== generation) return;
        write(status, phase); if (percent === null) progress.removeAttribute('value'); else { progress.max = 100; progress.value = percent; }
      } });
      if (!active || token !== generation) return;
      showResult(value);
    } catch (exception) {
      if (!active || token !== generation) return;
      const messages = { NOT_PDF: 'PDF 형식이 아닌 파일입니다.', PASSWORD: '암호로 보호된 PDF는 검사할 수 없습니다.',
        PAGE_LIMIT: '100쪽 이하 PDF로 나누어 검사해주세요.', TEXT_LIMIT: '문서의 글자가 너무 많습니다. 파일을 나누어 검사해주세요.',
        TOO_MANY_CANDIDATES: '교정 후보가 너무 많습니다. 문서를 나누어 검사해주세요.', OCR_UNAVAILABLE: 'OCR을 준비하지 못했습니다. 브라우저 지원과 로컬 프로그램 파일을 확인해주세요.',
        CANCELED: '검사가 취소되었습니다.' };
      write(error, timedOut ? '처리 시간이 길어 검사를 중단했습니다. 파일을 나누거나 화질을 조정해주세요.' : messages[exception.message] || 'PDF를 읽지 못했습니다. 파일 손상·브라우저 지원·OCR 처리량을 확인해주세요.');
      write(status, '검사를 완료하지 못했습니다. 다른 파일을 선택할 수 있습니다.');
    } finally { if (active && token === generation) { stopTimeout(); inspector = null; input.value = ''; busy(false); } }
  }
  input.addEventListener('change', () => { void inspect(input.files[0]); }, options);
  panel.addEventListener('dragover', event => { event.preventDefault(); }, options);
  panel.addEventListener('drop', event => { event.preventDefault(); if (input.disabled) return; if (event.dataTransfer.files.length !== 1) { write(error, 'PDF 한 개씩 선택해주세요.'); return; } void inspect(event.dataTransfer.files[0]); }, options);
  cancelButton.addEventListener('click', () => { clear(); write(status, '검사를 취소하고 파일·결과를 지웠습니다.'); }, options);
  find('#pdf-clear').addEventListener('click', () => { clear(); input.focus(); }, options);
  more.addEventListener('click', addCandidates, options);
  pageSelect.addEventListener('change', () => { preview.value = result?.pages.find(page => String(page.page) === pageSelect.value)?.text || ''; }, options);
  find('#pdf-export').addEventListener('click', () => {
    if (!result) return;
    try {
      const bytes = createReportXlsx(result, find('#export-context').checked);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = 'pdf-검사결과.xlsx';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      write(status, '엑셀 다운로드를 요청했습니다. 파일·결과는 업로드하지 않았습니다.');
    } catch { write(error, '엑셀 생성에 실패했습니다. 문서를 나누어 검사해주세요.'); }
  }, options);
  return () => { active = false; generation++; abort.abort(); stopTimeout(); void inspector?.cancel(); inspector = null; result = null; preview.value = ''; };
}
