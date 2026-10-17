import { TimerEngine } from './timer-engine.mjs';
import { TimerAudio } from './audio.mjs';
import { tools, validateTools } from './tools.mjs';
import { renderHub } from './hub-view.mjs';
import { renderTimer } from './timer-view.mjs';
import { renderPdfInspector } from './pdf-view.mjs';
import { renderPolynomialGame } from './polynomial-view.mjs';
import { renderDiary } from './diary-view.mjs';

const main = document.querySelector('#main');
const engine = new TimerEngine(), audio = new TimerAudio();
const preferences = { soundEnabled: true };
let cleanup = null, previous = null;
const routes = new Map([
  ['#/', () => renderHub(main, validateTools(tools, new Set(routes.keys())))],
  ['#/timer', () => renderTimer(main, engine, audio, preferences)],
  ['#/pdf', () => renderPdfInspector(main)],
  ['#/polynomial', () => renderPolynomialGame(main)],
  ['#/diary', () => renderDiary(main)]
]);

function navigate() {
  const path = location.hash || '#/';
  if (previous === path) return;
  if (cleanup?.canLeave && !cleanup.canLeave()) { location.hash = previous; return; }
  if (previous === '#/timer') engine.pause();
  cleanup?.(); cleanup = null;
  const render = routes.get(path);
  if (render) cleanup = render() || null;
  else {
    main.innerHTML = '<section class="not-found"><p class="eyebrow">도구를 찾을 수 없어요</p><h1 tabindex="-1">등록되지 않은 도구입니다.</h1><p>도구함에서 사용할 도구를 골라주세요.</p><a class="button-link" href="#/">도구함으로 돌아가기 →</a></section>';
  }
  document.title = path === '#/polynomial' ? '다항식 숲 탐험 · 교실 도구 허브' : path === '#/timer' ? '교실 타이머 · 교실 도구 허브' : path === '#/pdf' ? 'PDF 검사 · 교실 도구 허브' : '교실 도구 허브';
  if (path === '#/diary') document.title = '오늘의 일기 · 교실 도구 허브';
  if (previous !== null) main.querySelector('h1')?.focus();
  previous = path;
}
window.addEventListener('hashchange', navigate);
window.addEventListener('pagehide', () => { engine.pause(); cleanup?.(); cleanup = null; });
window.addEventListener('pageshow', event => { if (event.persisted) { previous = null; navigate(); } });
navigate();
