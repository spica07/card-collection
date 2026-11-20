(function () {
  "use strict";

  const data = window.CARD_DATA || { sets: [] };
  const sets = data.sets || [];
  const deckEl = document.getElementById("deck");
  const tabsEl = document.getElementById("tabs");
  const summaryEl = document.getElementById("summary");

  // 화면에 보이는 순서대로 펼친 카드 목록 (크게 보기에서 이전/다음용)
  const flat = [];
  sets.forEach((s, si) => s.cards.forEach((c) => flat.push({ ...c, set: s.name, si })));

  let side = "front";
  let activeSet = -1; // -1 = 전체

  // 한글·공백 파일 이름을 file://에서도 열리게
  const src = (p) => p.split("/").map(encodeURIComponent).join("/");
  const label = (c) => c.name || `${c.no}번 카드`;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function faceContent(c, which) {
    const path = c[which];
    if (path) {
      const img = el("img");
      img.src = src(path);
      img.alt = `${label(c)} ${which === "front" ? "앞면" : "뒷면"}`;
      img.loading = "lazy";
      img.decoding = "async";
      return img;
    }
    return el("div", "missing", which === "front" ? "앞면 사진 없음" : "뒷면 사진 없음");
  }

  function renderSummary() {
    const total = flat.length;
    summaryEl.textContent = total
      ? `${sets.length}개 세트 · ${total}장 · ${data.generated} 기준`
      : "아직 덱이 비어 있어요";
  }

  function renderTabs() {
    tabsEl.replaceChildren();
    if (!sets.length) { tabsEl.hidden = true; return; }
    const make = (name, count, idx) => {
      const b = el("button", "tab", name);
      b.type = "button";
      b.append(el("span", "count", String(count)));
      b.setAttribute("aria-current", String(idx === activeSet));
      b.addEventListener("click", () => { activeSet = idx; render(); window.scrollTo({ top: 0 }); });
      tabsEl.append(b);
    };
    make("전체", flat.length, -1);
    sets.forEach((s, i) => make(s.name, s.cards.length, i));
  }

  function renderDeck() {
    deckEl.replaceChildren();
    if (!sets.length) { deckEl.append(emptyState()); return; }
    sets.forEach((s, si) => {
      if (activeSet !== -1 && activeSet !== si) return;
      const sec = el("section", "set");
      const head = el("div", "set-head");
      head.append(el("h2", null, s.name), el("span", null, `${s.cards.length}장`));
      const grid = el("div", "grid");
      s.cards.forEach((c) => {
        const idx = flat.findIndex((f) => f.si === si && f.no === c.no);
        const btn = el("button", "card");
        btn.type = "button";
        btn.setAttribute("aria-label", `${label(c)} 크게 보기`);
        const thumb = el("div", "thumb");
        thumb.append(faceContent(c, side));
        const meta = el("div", "card-meta");
        meta.append(el("span", "no", String(c.no).padStart(3, "0")), el("span", "name", label(c)));
        btn.append(thumb, meta);
        btn.addEventListener("click", () => openViewer(idx));
        grid.append(btn);
      });
      sec.append(head, grid);
      deckEl.append(sec);
    });
  }

  function emptyState() {
    const box = el("div", "empty");
    box.innerHTML =
      "<h2>덱이 비어 있어요</h2>" +
      "<p>세트 폴더를 만들고 앞면·뒷면 사진을 넣은 다음 덱을 다시 만들어 주세요.</p>" +
      "<pre>cards/01-30주년 확장팩/001-뮤츠ex SAR-front.jpg\ncards/01-30주년 확장팩/001-뮤츠ex SAR-back.jpg\ncards/02-블랙볼트/001-몰드류ex SR-front.jpg</pre>" +
      "<p>그다음 폴더에서 <code>py tools/build.py</code> 를 실행하고 이 페이지를 새로 고치면 돼요.</p>";
    return box;
  }

  function render() { renderSummary(); renderTabs(); renderDeck(); }

  // 앞면/뒷면 전환
  document.querySelectorAll(".side-toggle button").forEach((b) => {
    b.addEventListener("click", () => {
      side = b.dataset.side;
      document.querySelectorAll(".side-toggle button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderDeck();
    });
  });

  // 크게 보기
  const viewer = document.getElementById("viewer");
  const flip = document.getElementById("flip");
  const frontFace = viewer.querySelector(".face-front");
  const backFace = viewer.querySelector(".face-back");
  const prevBtn = viewer.querySelector(".prev");
  const nextBtn = viewer.querySelector(".next");
  let cur = -1;
  let lastFocus = null;

  function showCard(i) {
    cur = i;
    const c = flat[i];
    frontFace.replaceChildren(faceContent(c, "front"));
    backFace.replaceChildren(faceContent(c, "back"));
    flip.classList.toggle("flipped", side === "back");
    document.getElementById("viewer-set").textContent = `${c.set} · ${String(c.no).padStart(3, "0")}`;
    document.getElementById("viewer-name").textContent = label(c);
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= flat.length - 1;
  }

  function openViewer(i) {
    lastFocus = document.activeElement;
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    showCard(i);
    viewer.querySelector(".close").focus();
  }

  function closeViewer() {
    viewer.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  const toggleFlip = () => flip.classList.toggle("flipped");
  flip.addEventListener("click", toggleFlip);
  document.getElementById("flip-btn").addEventListener("click", toggleFlip);
  prevBtn.addEventListener("click", () => cur > 0 && showCard(cur - 1));
  nextBtn.addEventListener("click", () => cur < flat.length - 1 && showCard(cur + 1));
  viewer.querySelectorAll("[data-close]").forEach((e) => e.addEventListener("click", closeViewer));

  document.addEventListener("keydown", (e) => {
    if (viewer.hidden) return;
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowLeft") prevBtn.click();
    else if (e.key === "ArrowRight") nextBtn.click();
    else if (e.key === " " || e.key === "f") { e.preventDefault(); toggleFlip(); }
  });

  // 휴대폰: 좌우로 밀어 이전/다음
  let sx = null;
  flip.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  flip.addEventListener("touchend", (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) > 50) { (dx < 0 ? nextBtn : prevBtn).click(); e.preventDefault(); }
  });

  render();
})();
