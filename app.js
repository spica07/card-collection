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
      ? "등급은 센터링만 본 예상값이에요. 카드 상태는 보지 않았어요."
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
      // 덱에는 PSA와 BRG만 보여 준다. BRG는 10등급 기준 하나뿐이라 못 미치면 "10 미만"
      ["psa", "brg"].forEach((k) => {
        const r = ct.grades[k];
        if (!r) return;
        const item = el("div", "grade");
        item.append(el("span", "co", k.toUpperCase()));
        const v = el("span", "g", r.grade || (k === "brg" ? "10 미만" : "기준 밖"));
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
      "센터링만 본 예상값이에요. '경계'는 오차 안이라 한 등급 오르내릴 수 있어요." +
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
    renderInspect(c);
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

  // ---------- 상세 감정 ----------
  // condition.json의 x, y는 카드 폭과 높이의 %, r은 카드 폭의 %. SVG는 카드 실제 크기(63x88mm)로 그린다.
  const SVGNS = "http://www.w3.org/2000/svg";
  const CW = 63, CH = 88;
  const inspector = document.getElementById("inspector");
  const inspBody = document.getElementById("insp-body");
  const inspToggle = document.getElementById("insp-toggle");
  let inspFrom = null;

  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  }

  function markLayer(face) {
    const svg = svgEl("svg", { class: "marks", viewBox: `0 0 ${CW} ${CH}`, "aria-hidden": "true" });
    const add = (m, cls) => {
      const cx = (m.x / 100) * CW, cy = (m.y / 100) * CH, r = Math.max(1.2, (m.r / 100) * CW);
      const g = svgEl("g", { class: `mark ${cls}`, "data-id": m.id });
      g.append(svgEl("circle", { class: "ring", cx, cy, r }));
      // 번호는 카드 안쪽으로 비켜 단다(가장자리 흠은 밖에 달면 잘린다)
      const lx = cx + (cx < CW / 2 ? 1 : -1) * (r + 1.2);
      const ly = cy + (cy < CH / 2 ? 1 : -1) * (r + 1.2);
      const w = String(m.id).length > 1 ? 3.8 : 2.6;
      g.append(svgEl("rect", { class: "dot", x: lx - w / 2, y: ly - 1.3, width: w, height: 2.6, rx: 1.3 }));
      const t = svgEl("text", { x: lx, y: ly });
      t.textContent = m.id;
      g.append(t);
      svg.append(g);
    };
    face.suspects.forEach((m) => add(m, "sus"));
    face.findings.forEach((m) => add(m, "find"));
    return svg;
  }

  const countText = (f) => `흠 의심 ${f.findings.length}곳, 반사 의심 ${f.suspects.length}곳`;

  // 크게 보기 오른쪽에는 요약과 '상세 감정 보기' 버튼만
  function renderInspect(c) {
    const box = document.getElementById("inspect");
    box.replaceChildren();
    const head = el("div", "inspect-head");
    head.append(el("h3", null, "상세 감정 (모서리, 옆면)"));
    box.append(head);
    const cond = c.condition;
    if (!cond) {
      box.append(el("p", "none-line", "아직 상세 감정을 하지 않은 카드예요. 원본 사진으로 다시 넣으면 생겨요."));
      return;
    }
    const sum = el("p", "sum");
    ["front", "back"].forEach((which, i) => {
      const f = cond[which];
      if (!f) return;
      if (i && sum.childNodes.length) sum.append(" / ");
      sum.append(`${SIDE_KO[which]} 흠 의심 `);
      sum.append(f.findings.length ? el("b", null, `${f.findings.length}곳`) : "0곳");
      if (f.suspects.length) sum.append(`, 반사 의심 ${f.suspects.length}곳`);
    });
    box.append(sum);
    const btn = el("button", "open-insp");
    btn.type = "button";
    btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>';
    btn.append(el("span", null, "상세 감정 보기"));
    btn.addEventListener("click", () => openInspector(c, btn));
    box.append(btn);
  }

  function renderInspector(c) {
    document.getElementById("insp-set").textContent = `${c.set} · ${String(c.no).padStart(3, "0")}`;
    document.getElementById("insp-title").textContent = `${label(c)} 상세 감정`;
    inspBody.replaceChildren();
    ["front", "back"].forEach((which) => {
      const f = c.condition[which];
      if (!f) return;
      const col = el("section", "iface");
      col.dataset.side = which;
      const h = el("h3", null, SIDE_KO[which]);
      h.append(el("span", "cnt", countText(f)));
      const fig = el("figure", "ifig");
      fig.append(faceContent(c, which));
      if (f.findings.length + f.suspects.length) fig.append(markLayer(f));
      col.append(h, fig);
      if (!f.findings.length && !f.suspects.length) {
        col.append(el("p", "none-line", which === "front" ? "모서리에서 흠 의심 없음" : "모서리와 옆면에서 흠 의심 없음"));
      } else {
        const ul = el("ul", "mlist");
        [[f.findings, "find"], [f.suspects, "sus"]].forEach(([items, cls]) => items.forEach((m) => {
          const li = el("li", cls);
          const b = el("button");
          b.type = "button";
          b.append(el("span", "no", String(m.id)), el("span", null, m.text));
          b.addEventListener("click", () => pulseMark(fig, m.id));
          li.append(b);
          ul.append(li);
        }));
        col.append(ul);
      }
      (f.warnings || []).concat(f.notes || []).forEach((n) => col.append(el("p", "cnote", n)));
      inspBody.append(col);
    });
  }

  function pulseMark(fig, id) {
    if (inspToggle.getAttribute("aria-pressed") !== "true") inspToggle.click();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fig.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    fig.querySelectorAll(".mark").forEach((g) => {
      g.classList.remove("pulse");
      if (g.dataset.id === String(id)) { void g.getBBox(); g.classList.add("pulse"); }
    });
  }

  function openInspector(c, from) {
    inspFrom = from;
    renderInspector(c);
    inspector.hidden = false;
    inspector.scrollTop = 0;
    viewer.inert = true;
    document.getElementById("insp-back").focus();
  }

  function closeInspector() {
    inspector.hidden = true;
    viewer.inert = false;
    if (inspFrom && inspFrom.isConnected) inspFrom.focus();
  }

  document.getElementById("insp-back").addEventListener("click", closeInspector);
  inspToggle.addEventListener("click", () => {
    const on = inspToggle.getAttribute("aria-pressed") !== "true";
    inspToggle.setAttribute("aria-pressed", String(on));
    inspector.classList.toggle("hide-marks", !on);
  });

  flip.addEventListener("click", toggleFlip);
  document.getElementById("flip-btn").addEventListener("click", toggleFlip);
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));
  viewer.querySelectorAll("[data-close]").forEach((e) => e.addEventListener("click", closeViewer));

  document.addEventListener("keydown", (e) => {
    if (!inspector.hidden) { if (e.key === "Escape") closeInspector(); return; }
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
