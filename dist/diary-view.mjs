import { deriveKey, newSalt, seal, unseal, validateEntries } from './diary-crypto.mjs';

export function renderDiary(main, backend = null) {
  main.innerHTML = `<section class="diary-page"><a class="back-link" href="#/">← 도구함으로</a>
    <div class="diary-heading"><div><p class="eyebrow">나를 위한 작은 기록</p><h1 tabindex="-1">오늘의 일기</h1><p>지나가는 하루를, 한 페이지에 담아두세요.</p></div><span aria-hidden="true" class="diary-flower">✳</span></div>
    <p id="diary-status" role="status" aria-live="polite">로컬 기록을 확인하고 있습니다.</p>
    <section id="diary-gate" class="diary-paper" hidden><h2 id="gate-title">일기장 열기</h2><p id="gate-copy"></p>
      <form id="unlock-form"><label for="diary-password">일기장 비밀번호</label><input id="diary-password" type="password" maxlength="256" autocomplete="off" required>
      <div id="confirm-wrap" hidden><label for="diary-confirm">비밀번호 확인</label><input id="diary-confirm" type="password" maxlength="256" autocomplete="off"></div>
      <button id="unlock-button" type="submit">일기장 열기</button></form>
      <p class="diary-help">기록은 이 PC의 data/diary/vault.json에 암호화되어 저장됩니다. 비밀번호를 잊으면 복구할 수 없습니다. 브라우저 저장소에는 기록이나 비밀번호를 남기지 않습니다.</p></section>
    <div id="diary-workspace" class="diary-layout" hidden><aside class="diary-paper diary-sidebar"><div class="diary-sidebar-head"><h2>나의 기록</h2><button id="new-entry" type="button">새 일기 +</button></div>
      <label for="diary-search">기록 검색</label><input id="diary-search" type="search" placeholder="제목이나 내용 검색" maxlength="120" spellcheck="false" autocomplete="off"><p id="entry-count"></p><div id="entry-list"></div>
      <button id="lock-diary" type="button" class="diary-secondary">일기장 잠그기</button></aside>
      <section class="diary-paper diary-editor"><form id="entry-form"><div class="diary-fields"><div><label for="entry-date">날짜</label><input id="entry-date" type="date" required min="0001-01-01" max="9999-12-31"></div><div><label for="entry-mood">오늘의 기분</label><select id="entry-mood"><option>평온</option><option>기쁨</option><option>보통</option><option>피곤</option><option>속상</option></select></div></div>
      <label for="entry-title">제목</label><input id="entry-title" maxlength="120" placeholder="오늘을 기억할 한마디" spellcheck="false" autocomplete="off">
      <label for="entry-body">오늘의 이야기</label><textarea id="entry-body" maxlength="20000" required placeholder="어떤 하루를 보냈나요?" spellcheck="false" autocomplete="off"></textarea><p id="body-count" class="diary-help">0 / 20,000자</p>
      <div class="diary-actions"><button id="save-entry" type="submit">일기 저장</button><button id="delete-entry" type="button" class="diary-secondary" hidden>이 일기 삭제</button></div>
      <p class="diary-help">날짜마다 한 편을 저장합니다. 저장 버튼을 누른 기록만 파일에 남습니다.</p></form></section></div></section>`;
  const $ = selector => main.querySelector(selector);
  const cloud = !!backend;
  if (cloud) {
    $('#diary-gate .diary-help').textContent = '기록은 비밀번호로 암호화하여 내 Google 계정의 Firebase 저장소에 보관합니다. 비밀번호를 잊으면 내용을 복구할 수 없습니다.';
  }
  let alive = true, busy = false, key = null, salt = null, entries = [], revision = null, vault = null, dirty = false, selected = null;
  const controller = new AbortController();
  const on = (element, event, fn) => element.addEventListener(event, fn, { signal: controller.signal });
  const status = message => { if (alive) $('#diary-status').textContent = message; };
  function setBusy(value) { busy = value; main.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = value; }); }
  async function api(method = 'GET', payload) {
    if (backend) return method === 'GET' ? backend.read() : backend.write(payload);
    const response = await fetch('/api/diary', { method, headers: { 'X-Diary-Request': '1', ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload ? JSON.stringify(payload) : undefined, cache: 'no-store', signal: controller.signal });
    let result; try { result = await response.json(); } catch { throw new Error('기록 저장을 지원하는 로컬 서버에서 실행해주세요.'); }
    if (!response.ok) throw new Error(result.error || '로컬 저장 서버에 연결할 수 없습니다.');
    return result;
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const discard = () => !dirty || confirm('저장하지 않은 변경 사항을 버릴까요?');
  function editor(entry = null) {
    selected = entry?.date || null;
    $('#entry-date').value = entry?.date || today(); $('#entry-date').readOnly = !!entry;
    $('#entry-title').value = entry?.title || ''; $('#entry-body').value = entry?.body || ''; $('#entry-mood').value = entry?.mood || '평온';
    $('#delete-entry').hidden = !entry; dirty = false;
    $('#body-count').textContent = `${$('#entry-body').value.length.toLocaleString('ko-KR')} / 20,000자`;
  }
  function list() {
    const query = $('#diary-search').value.trim().toLocaleLowerCase();
    const filtered = entries.filter(e => `${e.title} ${e.body} ${e.date}`.toLocaleLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date));
    $('#entry-count').textContent = `${entries.length}편의 일기 · 검색 결과 ${filtered.length}편`;
    $('#entry-list').replaceChildren();
    for (const entry of filtered) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'diary-list-item';
      button.setAttribute('aria-pressed', String(selected === entry.date));
      const date = document.createElement('span'), title = document.createElement('strong'), mood = document.createElement('small');
      date.textContent = entry.date; title.textContent = entry.title || '제목 없는 하루'; mood.textContent = entry.mood;
      button.append(date, title, mood); button.addEventListener('click', () => { if (!busy && discard()) { editor(entry); list(); status('저장된 일기를 열었습니다.'); } }); $('#entry-list').append(button);
    }
    if (!filtered.length) { const p = document.createElement('p'); p.textContent = entries.length ? '검색 결과가 없습니다.' : '첫 번째 하루를 기록해보세요.'; $('#entry-list').append(p); }
  }
  async function loadGate() {
    setBusy(true);
    try {
      const result = await api(); if (!alive) return;
      vault = result.vault; revision = result.revision;
      $('#diary-gate').hidden = false; $('#confirm-wrap').hidden = !!vault; $('#diary-confirm').required = !vault;
      $('#gate-title').textContent = vault ? '일기장 열기' : '나만의 일기장 시작하기';
      $('#gate-copy').textContent = vault ? '비밀번호로 저장된 기록을 열어주세요.' : '12자 이상의 비밀번호를 정하세요. 제목·날짜·내용 모두 암호화합니다.';
      $('#diary-password').minLength = vault ? 1 : 12;
      $('#unlock-button').textContent = vault ? '일기장 열기' : '일기장 만들기'; status(cloud ? 'Google 계정의 개인 일기장입니다. 비밀번호로 기록을 열어주세요.' : '이 PC에서만 사용하는 개인 일기장입니다.');
    } catch { status(cloud ? '저장소에 연결할 수 없습니다. 네트워크를 확인한 뒤 일기장을 다시 열어주세요.' : '로컬 일기장을 읽을 수 없습니다. start.cmd로 서버를 실행했는지 확인해주세요.'); }
    finally { if (alive) setBusy(false); }
  }
  on($('#unlock-form'), 'submit', async event => {
    event.preventDefault(); if (busy) return;
    const password = $('#diary-password').value;
    if (!vault && (password.length < 12 || password !== $('#diary-confirm').value)) { status('12자 이상 비밀번호와 동일한 확인 값을 입력해주세요.'); return; }
    setBusy(true); status('암호화된 일기장을 여는 중입니다.');
    try {
      const nextSalt = vault?.salt || newSalt(), nextKey = await deriveKey(password, nextSalt);
      const nextEntries = vault ? await unseal(vault, nextKey) : [];
      if (!alive) return;
      if (!vault) { const result = await api('PUT', { revision, vault: await seal(nextEntries, nextKey, nextSalt) }); if (!alive) return; revision = result.revision; }
      key = nextKey; salt = nextSalt; entries = nextEntries;
      $('#diary-password').value = ''; $('#diary-confirm').value = ''; $('#diary-gate').hidden = true; $('#diary-workspace').hidden = false;
      editor(entries.find(e => e.date === today())); list(); status('일기장이 열렸습니다. 기록 후 저장 버튼을 눌러주세요.');
    } catch (error) { status(error.name === 'OperationError' ? '비밀번호가 다르거나 기록 파일이 손상되었습니다.' : error.message); }
    finally { if (alive) setBusy(false); }
  });
  async function persist(nextEntries) {
    setBusy(true); status(cloud ? '암호화하여 내 계정에 저장하고 있습니다.' : '암호화하여 로컬 파일에 저장하고 있습니다.');
    try {
      const encrypted = await seal(nextEntries, key, salt);
      const result = await api('PUT', { revision, vault: encrypted }); if (!alive) return false;
      revision = result.revision; entries = nextEntries; dirty = false; return true;
    } catch (error) { status(error.message); return false; }
    finally { if (alive) setBusy(false); }
  }
  on($('#entry-form'), 'input', () => { dirty = true; $('#body-count').textContent = `${$('#entry-body').value.length.toLocaleString('ko-KR')} / 20,000자`; });
  on($('#entry-form'), 'submit', async event => {
    event.preventDefault(); if (busy || !key) return;
    const entry = { date: $('#entry-date').value, title: $('#entry-title').value.trim(), body: $('#entry-body').value, mood: $('#entry-mood').value };
    try { validateEntries([entry]); } catch (error) { status(error.message); return; }
    if (!selected && entries.some(e => e.date === entry.date)) { status('해당 날짜의 일기가 있습니다. 기록 목록에서 열어 수정해주세요.'); return; }
    const next = [...entries.filter(e => e.date !== entry.date), entry];
    if (await persist(next)) { editor(entry); list(); status(cloud ? '내 Google 계정에 암호화하여 저장했습니다.' : '로컬 폴더에 암호화하여 저장했습니다.'); }
  });
  on($('#delete-entry'), 'click', async () => {
    if (busy || !selected || !confirm('이 날짜의 일기를 삭제할까요? 삭제 후에는 복구할 수 없습니다.')) return;
    if (await persist(entries.filter(e => e.date !== selected))) { editor(); list(); status('선택한 일기를 삭제했습니다.'); }
  });
  on($('#diary-search'), 'input', list);
  on($('#new-entry'), 'click', () => { if (!busy && discard()) { editor(); list(); $('#entry-body').focus(); } });
  on($('#lock-diary'), 'click', () => {
    if (busy || !discard()) return;
    key = null; salt = null; entries = []; selected = null; dirty = false; editor(); $('#diary-search').value = ''; $('#entry-list').replaceChildren(); $('#entry-count').textContent = ''; $('#diary-workspace').hidden = true; loadGate();
  });
  on(window, 'beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  loadGate();
  const cleanup = () => { alive = false; controller.abort(); key = null; salt = null; entries = []; main.replaceChildren(); };
  cleanup.canLeave = () => { if (busy) { status('처리가 끝난 뒤 이동해주세요.'); return false; } return discard(); };
  return cleanup;
}
