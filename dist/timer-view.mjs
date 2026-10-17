import { parseDuration, formatDuration } from './timer-engine.mjs';

export function renderTimer(main, engine, audio, preferences) {
  main.innerHTML = `
    <section class="timer-page" aria-labelledby="timer-title">
      <div class="timer-heading"><div><a class="back-link" href="#/">← 도구함으로</a><p class="eyebrow">집중하는 시간을 함께</p><h1 id="timer-title" tabindex="-1">교실 타이머</h1></div><span class="timer-doodle" aria-hidden="true">tick, tock!</span></div>
      <div class="timer-stage" id="timer-stage" aria-label="교실 타이머 조작 영역">
        <div class="stage-top"><span class="status-label" role="status" aria-live="polite"></span><div class="stage-options"><button type="button" id="sound" aria-pressed="true">소리 켜짐</button><button type="button" id="fullscreen">전체화면 ↗</button></div></div>
        <div class="countdown" role="timer" aria-live="off" aria-label="남은 시간">05:00</div>
        <p class="timer-message">시간을 정하고 시작해보세요.</p>
        <progress class="time-progress" max="300000" value="300000" aria-hidden="true"></progress>
        <form id="timer-form" novalidate>
          <div class="settings"><fieldset class="presets"><legend>빠른 시간 선택</legend><div class="preset-buttons"><button type="button" data-minutes="1">1분</button><button type="button" data-minutes="3">3분</button><button type="button" data-minutes="5">5분</button><button type="button" data-minutes="10">10분</button></div></fieldset>
            <fieldset class="custom-time"><legend>직접 설정</legend><div class="time-inputs"><label for="minutes" class="sr-only">분 (0~99)</label><input id="minutes" name="minutes" type="text" inputmode="numeric" pattern="[0-9]*" value="5" autocomplete="off" aria-describedby="time-error time-range"><span>분</span><label for="seconds" class="sr-only">초 (0~59)</label><input id="seconds" name="seconds" type="text" inputmode="numeric" pattern="[0-9]*" value="0" autocomplete="off" aria-describedby="time-error time-range"><span>초</span></div></fieldset></div>
          <p id="time-range" class="range-note">최대 99분 59초 · 1초 이상 설정해주세요.</p>
          <p id="time-error" class="input-error" role="alert"></p>
          <div class="timer-controls"><button class="primary-button" type="submit" id="start">시작하기</button><button type="button" id="pause" hidden>일시정지</button><button type="button" id="resume" hidden>계속하기</button><button type="button" id="reset">초기화</button></div>
        </form>
        <p class="feature-notice" role="status" aria-live="polite"></p>
      </div>
      <details class="timer-help"><summary>사용할 때 알아두세요</summary><ul><li>도구함으로 이동하면 타이머가 일시정지됩니다. 다시 열어 계속할 수 있어요.</li><li>새로고침하거나 탭을 닫으면 설정이 초기화됩니다.</li><li>수업 중에는 화면과 탭을 열어두세요. 잠금·절전 중에는 알림이 늦어질 수 있습니다.</li><li>소리는 기기 음량과 브라우저 설정에 따라 들리지 않을 수 있습니다. 다른 기기와 시간은 공유되지 않습니다.</li></ul></details>
    </section>`;
  const get = selector => main.querySelector(selector);
  const stage = get('.timer-stage'), display = get('.countdown'), status = get('.status-label');
  const message = get('.timer-message'), progress = get('progress'), error = get('#time-error');
  const minutes = get('#minutes'), seconds = get('#seconds'), notice = get('.feature-notice');
  const start = get('#start'), pause = get('#pause'), resume = get('#resume');
  const sound = get('#sound'), fullscreen = get('#fullscreen');
  const presets = [...main.querySelectorAll('[data-minutes]')];
  let active = true, expanded = false, interval = null;
  const abort = new AbortController(), options = { signal: abort.signal };
  const write = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const notify = text => { if (active) write(notice, text); };
  const setInputs = () => {
    minutes.value = String(Math.floor(engine.configuredMs / 60000));
    seconds.value = String(engine.configuredMs / 1000 % 60);
  };
  const validate = () => {
    const result = parseDuration(minutes.value, seconds.value);
    write(error, result.ok ? '' : result.message);
    for (const input of [minutes, seconds]) input.setAttribute('aria-invalid', String(!result.ok));
    return result;
  };
  const stopLoop = () => { if (interval !== null) clearInterval(interval); interval = null; };
  function paint() {
    const state = engine.tick();
    const labels = { idle: '준비', running: '진행 중', paused: '일시정지', finished: '종료' };
    const messages = { idle: '시간을 정하고 시작해보세요.', running: '지금은 우리의 집중 시간.', paused: '잠깐 쉬어가도 괜찮아요.', finished: '시간이 끝났어요' };
    write(display, formatDuration(state.remainingMs));
    write(status, labels[state.status]); write(message, messages[state.status]);
    stage.dataset.state = state.status;
    progress.max = state.configuredMs; progress.value = state.remainingMs;
    const locked = ['running', 'paused'].includes(state.status);
    for (const input of [minutes, seconds]) input.disabled = locked;
    for (const button of presets) {
      button.disabled = locked;
      button.setAttribute('aria-pressed', String(state.configuredMs === Number(button.dataset.minutes) * 60000));
    }
    start.hidden = locked; start.disabled = !locked && !parseDuration(minutes.value, seconds.value).ok;
    pause.hidden = state.status !== 'running'; resume.hidden = state.status !== 'paused';
    sound.setAttribute('aria-pressed', String(preferences.soundEnabled));
    write(sound, preferences.soundEnabled ? '♪ 소리 켜짐' : '소리 꺼짐');
    if (state.status !== 'running') stopLoop();
    if (engine.consumeFinish() && preferences.soundEnabled) {
      const generation = audio.generation;
      void audio.play().then(ok => {
        if (!ok && active && preferences.soundEnabled && generation === audio.generation && engine.status === 'finished') notify('알림음을 재생할 수 없습니다. 화면의 종료 안내를 확인해주세요.');
      });
    }
  }
  function beginLoop() { stopLoop(); paint(); if (engine.status === 'running') interval = setInterval(paint, 100); }
  get('#timer-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!['idle', 'finished'].includes(engine.status)) return;
    const result = validate();
    if (!result.ok) { minutes.focus(); paint(); return; }
    audio.stop(); notify('');
    if (preferences.soundEnabled) {
      const generation = audio.generation;
      void audio.prepare().then(ok => { if (!ok && preferences.soundEnabled && generation === audio.generation && engine.status === 'running') notify('소리를 사용할 수 없습니다. 종료 시 화면으로 알려드릴게요.'); });
    }
    engine.configure(result.durationMs); engine.start(); beginLoop();
    pause.focus();
  }, options);
  for (const input of [minutes, seconds]) input.addEventListener('input', () => {
    if (!['idle', 'finished'].includes(engine.status)) return;
    const result = validate();
    if (result.ok) { audio.stop(); engine.configure(result.durationMs); }
    paint();
  }, options);
  for (const button of presets) button.addEventListener('click', () => {
    if (engine.configure(Number(button.dataset.minutes) * 60000)) {
      audio.stop(); setInputs(); validate(); notify(''); paint();
    }
  }, options);
  pause.addEventListener('click', () => { engine.pause(); paint(); (engine.status === 'paused' ? resume : start).focus(); }, options);
  resume.addEventListener('click', () => {
    if (preferences.soundEnabled) void audio.prepare();
    engine.resume(); beginLoop(); pause.focus();
  }, options);
  get('#reset').addEventListener('click', () => {
    stopLoop(); audio.stop(); engine.reset(); setInputs(); validate(); notify(''); paint();
  }, options);
  sound.addEventListener('click', () => {
    preferences.soundEnabled = !preferences.soundEnabled;
    if (!preferences.soundEnabled) { audio.stop(); notify(''); }
    else {
      const generation = audio.generation;
      void audio.prepare().then(ok => { if (!ok && preferences.soundEnabled && generation === audio.generation) notify('소리를 사용할 수 없습니다. 종료 시 화면으로 알려드릴게요.'); });
    }
    paint();
  }, options);
  function updateFullscreen() {
    if (!active) return;
    write(fullscreen, document.fullscreenElement === stage ? '전체화면 해제 ↙' : expanded ? '확대 해제 ↙' : '전체화면 ↗');
    fullscreen.setAttribute('aria-pressed', String(document.fullscreenElement === stage || expanded));
  }
  fullscreen.addEventListener('click', async () => {
    fullscreen.disabled = true;
    try {
      if (document.fullscreenElement === stage) await document.exitFullscreen();
      else if (expanded) { expanded = false; stage.classList.remove('expanded'); notify(''); }
      else if (stage.requestFullscreen) await stage.requestFullscreen();
      else throw new Error('unsupported');
    } catch {
      if (active) {
        expanded = true; stage.classList.add('expanded');
        notify('전체화면을 사용할 수 없어 화면 안에서 확대했습니다. 타이머는 계속 작동합니다.');
      }
    }
    if (active) fullscreen.disabled = false;
    updateFullscreen();
  }, options);
  document.addEventListener('fullscreenchange', updateFullscreen, options);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); }, options);
  setInputs(); paint(); updateFullscreen();
  return () => {
    active = false; abort.abort(); stopLoop(); audio.stop();
    if (document.fullscreenElement === stage && document.exitFullscreen) void document.exitFullscreen().catch(() => {});
  };
}
