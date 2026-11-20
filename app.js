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

  function faceContent(c, which, small) {
    const path = (small && c.thumb && c.thumb[which]) || c[which];
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
      b.setAttribute("aria-pressed", String(idx === activeSet));
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
        thumb.append(faceContent(c, side, true));
        const psa = c.centering && c.centering.grades && c.centering.grades.psa;
        if (psa && psa.grade) {
          const badge = el("span", "badge", `PSA ${psa.grade} `);
          badge.append(el("span", "x", "예상"));
          badge.title = "센터링만 보고 예상한 PSA 등급 (실제 감정 결과 아님)";
          thumb.append(badge);
        }
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

  const SIDE_KO = { front: "앞면", back: "뒷면" };
  const pair = (t) => (t || "").replace(/\s*\(.*\)\s*$/, "").replace("/", " : ");
  const CONF_KO = { high: "", medium: "신뢰도 보통", low: "신뢰도 낮음" };
  const AXIS_KO = { lr: "좌우", tb: "상하" };
  // "front tb 51.0 — ..." → "앞면 상하 51.0 — ..."
  const facet = (t) => (t || "").replace(/^(front|back) (lr|tb)/, (_, s, a) => `${SIDE_KO[s]} ${AXIS_KO[a]}`);

  function renderCentering(c) {
    const box = document.getElementById("centering");
    box.replaceChildren();
    const ct = c.centering;
    box.classList.toggle("none", !ct);
    if (!ct) { box.append(el("p", null, "센터링을 아직 재지 않았어요.")); return; }
    box.append(el("h3", null, "센터링 (사진으로 잰 값)"));

    const table = el("table", "ctable");
    table.innerHTML = "<thead><tr><th></th><th>좌 : 우</th><th>상 : 하</th></tr></thead>";
    const tbody = el("tbody");
    ["front", "back"].forEach((s) => {
      const f = ct[s];
      const tr = el("tr");
      tr.dataset.side = s;
      tr.append(el("th", null, SIDE_KO[s]));
      if (!f) {
        const td = el("td", null, "안 잼"); td.colSpan = 2; tr.append(td);
      } else if (f.ratio_lr == null) {
        const td = el("td", null, "안쪽 테두리를 못 찾음"); td.colSpan = 2; tr.append(td);
      } else {
        const lr = el("td", null, pair(f.lr_text));
        const tb = el("td", null, pair(f.tb_text));
        if (CONF_KO[f.confidence]) tb.append(el("span", "low", CONF_KO[f.confidence]));
        tr.append(lr, tb);
      }
      tbody.append(tr);
    });
    table.append(tbody);
    box.append(table);

    if (ct.grades) {
      box.append(el("h3", "grades-title", "예상 등급 (센터링 기준)"));
      const g = el("div", "grades");
      const edges = [];
      ["psa", "cgc", "tag", "bgs"].forEach((k) => {
        const r = ct.grades[k];
        if (!r) return;
        const item = el("div", "grade");
        item.append(el("span", "co", k.toUpperCase() + (r.verified ? "" : " · 기준 미확인")));
        const v = el("span", "g", r.grade || "기준 밖");
        item.append(v);
        if (r.near_boundary && r.near_boundary.length) {
          item.append(el("span", "edge", "경계"));
          r.near_boundary.forEach((t) => edges.push([k.toUpperCase(), facet(t)]));
        }
        if (r.limited_by) item.append(el("span", "by", `${facet(r.limited_by)}가 결정`));
        g.append(item);
      });
      box.append(g);
      if (edges.length) {
        const ul = el("ul", "edges");
        edges.forEach(([co, t]) => {
          const li = el("li");
          li.append(el("b", null, co), ` ${t}`);
          ul.append(li);
        });
        box.append(ul);
      }
    }

    const links = el("div", "overlays");
    ["front", "back"].forEach((s) => {
      if (!ct[s] || !ct[s].overlay) return;
      const a = el("a", null, `${SIDE_KO[s]} 확인 이미지`);
      a.href = src(ct[s].overlay);
      a.target = "_blank";
      a.rel = "noopener";
      links.append(a);
    });
    if (links.childElementCount) box.append(links);

    const dates = ["front", "back"].map((s) => ct[s] && ct[s].measured).filter(Boolean);
    box.append(el("p", "cnote",
      "예상 등급은 센터링만 보고 낸 값이라 실제 감정 결과와 다를 수 있어요. 모서리, 옆면, 표면은 따로 봐야 해요. '경계'는 측정 오차(약 1%p) 안이라 한 등급 위아래로 갈 수 있다는 뜻이고, '기준 미확인'은 회사 공식 페이지 원문으로 기준을 확인하지 못했다는 뜻이에요." +
      (dates.length ? ` 측정일 ${dates[0]}.` : "")));
    markSide();
  }

  function markSide() {
    const showing = flip.classList.contains("flipped") ? "back" : "front";
    document.querySelectorAll("#centering tr[data-side]").forEach((tr) => tr.classList.toggle("now", tr.dataset.side === showing));
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

  // 이전/다음은 지금 보이는 세트 안에서만
  const visible = () => flat.map((f, i) => i).filter((i) => activeSet === -1 || flat[i].si === activeSet);
  function step(d) {
    const v = visible();
    const at = v.indexOf(cur);
    if (at !== -1 && v[at + d] != null) showCard(v[at + d]);
  }

  function showCard(i) {
    cur = i;
    const c = flat[i];
    frontFace.replaceChildren(faceContent(c, "front"));
    backFace.replaceChildren(faceContent(c, "back"));
    flip.classList.toggle("flipped", side === "back");
    document.getElementById("viewer-set").textContent = `${c.set} · ${String(c.no).padStart(3, "0")}`;
    document.getElementById("viewer-name").textContent = label(c);
    renderCentering(c);
    const v = visible();
    prevBtn.disabled = v.indexOf(i) <= 0;
    nextBtn.disabled = v.indexOf(i) >= v.length - 1;
  }

  // 크게 보기가 열려 있는 동안 뒤쪽 화면은 포커스·화면낭독기에서 뺀다
  const background = [document.querySelector(".top"), tabsEl, deckEl];
  const setInert = (on) => background.forEach((n) => {
    n.inert = on;
    if (on) n.setAttribute("aria-hidden", "true"); else n.removeAttribute("aria-hidden");
  });

  function openViewer(i) {
    lastFocus = document.activeElement;
    viewer.hidden = false;
    setInert(true);
    document.body.style.overflow = "hidden";
    showCard(i);
    viewer.querySelector(".close").focus();
  }

  function closeViewer() {
    viewer.hidden = true;
    setInert(false);
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  const toggleFlip = () => { flip.classList.toggle("flipped"); markSide(); };
  flip.addEventListener("click", toggleFlip);
  document.getElementById("flip-btn").addEventListener("click", toggleFlip);
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));
  viewer.querySelectorAll("[data-close]").forEach((e) => e.addEventListener("click", closeViewer));

  document.addEventListener("keydown", (e) => {
    if (viewer.hidden) return;
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowLeft") prevBtn.click();
    else if (e.key === "ArrowRight") nextBtn.click();
    else if ((e.key === "f" && !e.ctrlKey && !e.metaKey) || ((e.key === " " || e.key === "Enter") && e.target === flip)) { e.preventDefault(); toggleFlip(); }
    // 버튼·링크 위의 Space는 그 버튼을 누르게 둔다
    else if (e.key === " " && !e.target.closest("button, a")) { e.preventDefault(); toggleFlip(); }
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
