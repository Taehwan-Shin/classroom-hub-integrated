const artwork = Object.freeze({
  'classroom-timer': { image: 'timer', label: '우리의 집중 시간', number: '01' },
  'pdf-inspector': { image: 'pdf', label: '문서를 차분히 살펴보세요', number: '02' },
  'polynomial-forest': { image: 'forest', label: '작은 친구들의 수학 모험', number: '03' },
  'personal-diary': { image: 'journal', label: '하루를 담는 나만의 페이지', number: '04' }
});

export function renderHub(main, tools) {
  // Fixed markup only. Tool text never becomes HTML or an asset path.
  main.innerHTML = `
    <section class="hub-intro" aria-labelledby="hub-title">
      <p class="eyebrow"><span class="intro-dot" aria-hidden="true"></span>선생님을 위한 작은 도구들</p>
      <h1 id="hub-title" tabindex="-1">수업에 필요한 도구, <br><span class="marker-line">한곳에</span> 모아두세요.</h1>
      <p class="intro-copy">준비는 가볍게, 수업은 여유롭게. <br>오늘 필요한 도구를 꺼내 쓰세요.</p>
      <span class="star-sticker" aria-hidden="true">✳</span>
      <div class="hub-note" aria-hidden="true"><span>오늘도, 좋은 수업</span><svg viewBox="0 0 80 40" fill="none"><path d="M4 10c20 20 40 18 64 4m-11-3 13 2-5 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    </section>
    <section class="tools-section" aria-labelledby="tools-title">
      <div class="section-heading"><h2 id="tools-title">나의 수업 도구</h2><span class="tool-count"></span></div>
      <div class="tool-grid"></div>
      <p class="collection-note"><span aria-hidden="true">✦</span> 도구함은 앞으로도 하나씩 채워집니다.</p>
    </section>`;
  main.querySelector('.tool-count').textContent = `${tools.length}개의 도구`;
  const grid = main.querySelector('.tool-grid');
  for (const tool of tools) {
    const art = Object.hasOwn(artwork, tool.id) ? artwork[tool.id] : null;
    const card = document.createElement('a'); card.className = 'tool-card'; card.href = tool.route;
    if (art) card.dataset.art = art.image;
    card.innerHTML = `<div class="card-art" aria-hidden="true"><span class="art-index"></span><span class="art-caption"></span></div>
      <div class="card-copy"><span class="tag"></span><h3></h3><p></p><span class="card-action">도구 열기 <svg class="ui-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>`;
    card.querySelector('.tag').textContent = tool.category || '수업 도구';
    card.querySelector('h3').textContent = tool.title;
    card.querySelector('.card-copy p').textContent = tool.description;
    card.querySelector('.art-index').textContent = art?.number || '✦';
    card.querySelector('.art-caption').textContent = art?.label || '나의 수업 도구';
    if (art) {
      const image = document.createElement('img');
      image.src = `./assets/illustrations/${art.image}-v1.webp`;
      image.alt = ''; image.width = 960; image.height = 640; image.decoding = 'async';
      image.loading = grid.children.length < 2 ? 'eager' : 'lazy';
      image.addEventListener('error', () => { image.remove(); card.classList.add('art-unavailable'); }, { once: true });
      card.querySelector('.card-art').prepend(image);
    }
    grid.append(card);
  }
  if (!tools.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = '아직 등록된 도구가 없습니다. 개발 담당자가 도구 목록에 추가할 수 있습니다.'; grid.append(empty);
  }
}
