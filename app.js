(function () {
  "use strict";

  const data = window.CARD_DATA || { decks: [] };
  // 예전 형식(sets만 있음)도 '내 덱' 하나로 읽는다
  const decks = data.decks || [{ name: "내 덱", sets: data.sets || [] }];
  const DECK_KEY = "card-collection.deck";
  // 잠긴 덱(친구 덱)은 카드마다 번호가 따로 있다. 번호를 넣은 카드만 보인다.
  // locks.js(tools/pin.py가 만듦)에는 sha256("card-collection:" + 번호) → "덱/세트/번호"만 있다.
  // 정적 사이트라 화면만 가리는 잠금이고, 사진 주소를 알면 열 수 있다.
  const locks = window.CARD_LOCKS || { decks: [], cards: {} };
  const LOCKED_DECKS = new Set(locks.decks || []);
  const UNLOCK_KEY = "card-collection.unlocked"; // 이 탭을 닫으면 다시 잠긴다
  const opened = new Set();
  const lockedKeys = new Set(Object.values(locks.cards || {}));
  // 지워졌거나 번호가 바뀐 카드 키는 버린다(남아 있으면 친구 화면이 빈 채로 굳는다)
  try { JSON.parse(sessionStorage.getItem(UNLOCK_KEY) || "[]").forEach((k) => { if (lockedKeys.has(k)) opened.add(k); }); } catch (e) { /* 저장소를 못 쓰면 이번 화면에서만 */ }
  // 친구 덱 번호를 한 번이라도 넣으면 이 탭에서는 친구 화면이다: 잠긴 덱만 보이고 '내 덱'은 숨긴다
  const friendMode = () => opened.size > 0;
  const isShownDeck = (i) => !friendMode() || LOCKED_DECKS.has(decks[i].name);
  const cardKey = (deck, set, c) => `${deck}/${set}/${c.no}`;
  const isLockedDeck = (i) => !!decks[i] && LOCKED_DECKS.has(decks[i].name);
  // 덱에서 지금 보여 줄 세트(잠긴 덱은 번호를 넣은 카드만, 빈 세트는 뺀다)
  function visibleSets(i) {
    const d = decks[i];
    if (!d) return [];
    if (!isLockedDeck(i)) return d.sets;
    return d.sets
      .map((s) => ({ ...s, cards: s.cards.filter((c) => opened.has(cardKey(d.name, s.name, c))) }))
      .filter((s) => s.cards.length);
  }
  const visibleCount = (i) => visibleSets(i).reduce((n, st) => n + st.cards.length, 0);
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // 맞는 번호면 그 카드 키, 아니면 null (다른 덱 카드 번호는 받지 않는다)
  async function checkPin(deckName, pin) {
    if (!(window.crypto && crypto.subtle)) return null;
    const key = (locks.cards || {})[await sha256("card-collection:" + pin)];
    return key && key.startsWith(deckName + "/") ? key : null;
  }
  let deckIdx = 0;
  try { deckIdx = Math.min(decks.length - 1, Math.max(0, parseInt(localStorage.getItem(DECK_KEY) || "0", 10) || 0)); } catch (e) { /* 저장소를 못 쓰면 첫 덱 */ }
  if (friendMode()) {
    if (!isLockedDeck(deckIdx) || !visibleCount(deckIdx)) deckIdx = Math.max(0, decks.findIndex((d, i) => isLockedDeck(i) && visibleCount(i)));
  } else if (isLockedDeck(deckIdx) && !visibleCount(deckIdx)) deckIdx = Math.max(0, decks.findIndex((d, i) => !isLockedDeck(i)));
  let pinFor = -1; // 번호 입력창을 띄운 덱
  let pendingKey = null; // 공유 링크로 받은 잠긴 카드: 번호를 넣으면 바로 크게 연다
  let sets = [];
  const deckEl = document.getElementById("deck");
  const tabsEl = document.getElementById("tabs");
  const summaryEl = document.getElementById("summary");

  // 화면에 보이는 순서대로 펼친 카드 목록 (크게 보기에서 이전/다음용) — 덱을 바꾸면 다시 만든다
  let flat = [];
  function loadDeck() {
    sets = visibleSets(deckIdx);
    flat = [];
    sets.forEach((s, si) => s.cards.forEach((c) => flat.push({ ...c, set: s.name, si })));
  }
  loadDeck();

  let side = "front";
  let activeSet = -1; // -1 = 전체
  // ---------- 필터 ----------
  // 각 필터는 카드 → 값(key) 함수와 보여 줄 값 목록을 가진다. null = 전체.
  const RARITY_ORDER = ["MUR", "BWR", "SAR", "CSR", "CHR", "UR", "SSR", "HR", "SR", "AR", "ACE", "RRR", "RR", "PR", "TR", "R", "U", "C"];
  const FAMILY = {
    illust: ["AR", "SAR", "CHR", "CSR"],             // 일러스트 계열
    full: ["SR", "UR", "MUR", "HR", "SSR", "BWR"],   // 풀아트·골드 계열
    normal: ["ACE", "RRR", "RR", "PR", "TR", "R", "U", "C"],
  };
  const familyOf = (r) => Object.keys(FAMILY).find((k) => FAMILY[k].includes(r)) || "none";
  const psaKey = (c) => {
    const g = c.centering && c.centering.grades && c.centering.grades.psa;
    return g && g.grade ? String(g.grade) : "none";
  };
  // 앞면에서 가장 치우친 축(큰 쪽 %)으로 센터링을 나눈다. 앞면을 안 쟀으면 뒷면.
  const CENTER_STEPS = [[51, "51 이하"], [53, "51~53"], [55, "53~55"], [60, "55~60"], [Infinity, "60 넘음"]];
  const centerKey = (c) => {
    const ct = c.centering;
    const ok = (x) => x && x.ratio_lr != null && !x.design_frame;
    const f = ct && ((ok(ct.front) && ct.front) || (ok(ct.back) && ct.back));
    if (!f) return "none";
    const worst = Math.max(f.ratio_lr, f.ratio_tb);
    return CENTER_STEPS.find(([lim]) => worst <= lim)[1];
  };
  const FILTERS = [
    { id: "center", label: "센터링", keyOf: centerKey,
      values: () => CENTER_STEPS.map(([, t]) => t).concat("none"),
      text: (k) => (k === "none" ? "측정 안 함" : `앞면 ${k}`),
      hint: "앞면에서 가장 치우친 축의 큰 쪽 비율이에요. PSA 10은 55 이하, 9는 60 이하예요." },
    { id: "grade", label: "예상 등급", keyOf: psaKey, basic: true,
      values: () => [...new Set(flat.map(psaKey))].sort((a, b) => (a === "none") - (b === "none") || parseFloat(b) - parseFloat(a)),
      text: (k) => (k === "none" ? "측정 안 함" : `PSA ${k}`) },
    { id: "family", label: "레어도 계열", keyOf: (c) => familyOf(c.rarity),
      values: () => ["illust", "full", "normal", "none"],
      text: (k) => ({ illust: "일러스트 (AR, SAR, CHR, CSR)", full: "풀아트·골드 (SR, UR, MUR…)", normal: "일반 (RR 이하)", none: "표기 없음" })[k] },
    { id: "rarity", label: "레어도", keyOf: (c) => c.rarity || "none", basic: true,
      values: () => RARITY_ORDER.concat("none"),
      text: (k) => (k === "none" ? "표기 없음" : k) },
    { id: "kind", label: "카드 종류", keyOf: (c) => c.kind || "pokemon",
      values: () => ["ex", "pokemon", "trainer", "energy"],
      text: (k) => ({ ex: "포켓몬 ex", pokemon: "포켓몬", trainer: "트레이너스", energy: "에너지" })[k] },
    { id: "reprint", label: "복각", keyOf: (c) => (c.reprint ? "yes" : "no"),
      values: () => ["yes", "no"],
      text: (k) => (k === "yes" ? "복각만" : "복각 아님") },
  ];
  const filters = {};
  const resetFilters = () => FILTERS.forEach((f) => { filters[f.id] = null; });
  resetFilters();

  const inSet = (f) => activeSet === -1 || f.si === activeSet;
  const matches = (c) => inSet(c) && FILTERS.every((f) => filters[f.id] === null || f.keyOf(c) === filters[f.id]);

  // 한글·공백 파일 이름을 file://에서도 열리게
  const src = (p) => p.split("/").map(encodeURIComponent).join("/");
  const label = (c) => c.name || `${c.no}번 카드`;
  const keyOf = (c) => cardKey(decks[deckIdx].name, c.set, c);
  const cardUrl = (c) => location.href.split("#")[0] + "#card=" + encodeURIComponent(keyOf(c));

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
      : `${decks[deckIdx] ? decks[deckIdx].name : "덱"}이 아직 비어 있어요`;
  }

  function renderDecks() {
    const box = document.getElementById("decks");
    box.replaceChildren();
    if (decks.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const btns = el("div", "deck-btns");
    decks.forEach((d, i) => {
      if (!isShownDeck(i)) return;
      const locked = isLockedDeck(i);
      const n = visibleCount(i);
      const b = el("button", "deck-btn", d.name);
      b.type = "button";
      if (locked) {
        b.insertAdjacentHTML("beforeend",
          '<svg class="ico lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>');
        b.setAttribute("aria-label", d.name + (n ? ` (번호로 연 카드 ${n}장)` : " (카드 번호 입력 필요)"));
        b.setAttribute("aria-expanded", String(pinFor === i));
      }
      if (!locked || n) b.append(el("span", "count", String(n)));
      b.setAttribute("aria-pressed", String(i === deckIdx));
      b.addEventListener("click", () => {
        // 잠긴 덱은 누를 때마다 번호 입력창을 열고 닫는다(이미 연 카드가 있으면 덱도 바꾼다)
        if (locked) {
          pinFor = pinFor === i ? -1 : i;
          if (i !== deckIdx && n) { switchDeck(i, true); return; }
          renderDecks(); return;
        }
        if (i === deckIdx) return;
        switchDeck(i);
      });
      btns.append(b);
    });
    box.append(btns);
    if (pinFor >= 0 && isLockedDeck(pinFor)) box.append(pinForm(pinFor));
  }

  function switchDeck(i, keepPin) {
    deckIdx = i;
    if (!keepPin) pinFor = -1;
    try { localStorage.setItem(DECK_KEY, String(i)); } catch (e) { /* 기억 못 해도 화면은 바뀐다 */ }
    activeSet = -1; resetFilters();
    loadDeck(); render(); window.scrollTo({ top: 0 });
  }

  function pinForm(i) {
    const name = decks[i].name;
    const form = el("form", "pin-form");
    form.noValidate = true;
    const waiting = pendingKey && pendingKey.startsWith(name + "/") && !opened.has(pendingKey);
    const label = el("label", "pin-label", waiting ? "공유받은 카드를 보려면 그 카드 번호를 넣어 주세요"
      : visibleCount(i) ? "다른 카드 번호도 넣을 수 있어요" : "카드 번호를 넣으면 그 카드가 보여요");
    const input = el("input", "pin-input");
    input.type = "password"; input.inputMode = "numeric"; input.autocomplete = "off";
    input.maxLength = 12; input.placeholder = "번호"; input.id = "pin-input";
    label.htmlFor = input.id;
    const ok = el("button", "pin-ok", "열기"); ok.type = "submit";
    const msg = el("p", "pin-msg"); msg.setAttribute("role", "status");
    form.append(label, el("div", "pin-row"), msg);
    form.querySelector(".pin-row").append(input, ok);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pin = input.value.trim();
      if (!pin) { msg.textContent = "번호를 넣어 주세요."; input.focus(); return; }
      ok.disabled = true;
      let key = null;
      try { key = await checkPin(name, pin); } catch (err) { key = null; }
      ok.disabled = false;
      if (!key) {
        msg.textContent = window.crypto && crypto.subtle ? "번호가 맞지 않아요." : "이 브라우저에서는 번호를 확인할 수 없어요.";
        input.select(); return;
      }
      if (opened.has(key)) { msg.textContent = "이미 연 카드예요."; input.select(); return; }
      opened.add(key);
      try { sessionStorage.setItem(UNLOCK_KEY, JSON.stringify([...opened])); } catch (err) { /* 저장 못 하면 이번 화면에서만 열림 */ }
      switchDeck(i);
      if (pendingKey && opened.has(pendingKey)) openByKey(pendingKey);
    });
    setTimeout(() => input.focus(), 0);
    return form;
  }

  function renderTabs() {
    tabsEl.replaceChildren();
    tabsEl.hidden = !sets.length;
    if (!sets.length) return;
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

  let filtersOpen = false; // 상세 필터는 처음엔 접어 둔다

  // 필터 한 줄(라벨 + 칩). 0장인 칩은 숨긴다(골라 둔 칩만 예외) — 화면에 칩이 너무 많지 않게.
  function filterGroup(def) {
    const g = el("div", "fgroup");
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", def.label);
    const lbl = el("span", "lbl", def.label);
    if (def.hint) lbl.title = def.hint;
    g.append(lbl);
    [null, ...def.values()].forEach((key) => {
      const saved = filters[def.id];
      filters[def.id] = key; // 다른 필터는 그대로 두고 이 칩만 골랐을 때 보일 장수
      const n = flat.filter(matches).length;
      filters[def.id] = saved;
      if (!n && key !== null && saved !== key) return;
      const b = el("button", "gchip", key === null ? "전체" : def.text(key));
      b.type = "button";
      b.append(el("span", "count", String(n)));
      b.setAttribute("aria-pressed", String(saved === key));
      b.addEventListener("click", () => { filters[def.id] = key; render(); });
      g.append(b);
    });
    return g;
  }

  function renderGrades() {
    const box = document.getElementById("grades");
    box.replaceChildren();
    if (!flat.length) { box.hidden = true; return; }
    box.hidden = false;
    const basic = FILTERS.filter((f) => f.basic);
    const detail = FILTERS.filter((f) => !f.basic);
    const activeAll = FILTERS.filter((f) => filters[f.id] !== null).length;
    const activeDetail = detail.filter((f) => filters[f.id] !== null).length;
    const shown = flat.filter(matches).length;

    // 기본 필터: 늘 보인다
    const top = el("div", "fbasic");
    basic.forEach((def) => top.append(filterGroup(def)));
    box.append(top);

    // 상세 필터 버튼 + 보이는 장수 + 지우기
    const bar = el("div", "fbar");
    const tog = el("button", "ftoggle");
    tog.type = "button";
    tog.setAttribute("aria-expanded", String(filtersOpen));
    tog.setAttribute("aria-controls", "fpanel");
    tog.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';
    tog.append(el("span", null, "상세 필터"));
    if (activeDetail) tog.append(el("span", "fbadge", String(activeDetail)));
    const chev = el("span", "chev");
    chev.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
    tog.append(chev);
    tog.addEventListener("click", () => { filtersOpen = !filtersOpen; renderGrades(); });
    bar.append(tog, el("span", "fcount", activeAll ? `${shown}장 보는 중` : `${shown}장`));
    if (activeAll) {
      const clr = el("button", "fclear", "필터 지우기");
      clr.type = "button";
      clr.addEventListener("click", () => { resetFilters(); render(); });
      bar.append(clr);
    }
    box.append(bar);

    const panel = el("div", "fpanel");
    panel.id = "fpanel";
    panel.hidden = !filtersOpen;
    detail.forEach((def) => panel.append(filterGroup(def)));
    box.append(panel);
  }

  function renderDeck() {
    deckEl.replaceChildren();
    if (!sets.length) { deckEl.append(emptyState()); return; }
    let shown = 0;
    sets.forEach((s, si) => {
      if (activeSet !== -1 && activeSet !== si) return;
      const cards = s.cards.filter((c) => matches({ ...c, si }));
      if (!cards.length) return;
      shown += cards.length;
      const sec = el("section", "set");
      const head = el("div", "set-head");
      head.append(el("h2", null, s.name), el("span", null, `${cards.length}장`));
      const grid = el("div", "grid");
      cards.forEach((c) => {
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
    if (!shown) deckEl.append(el("p", "filter-empty", "고른 조건에 맞는 카드가 없어요."));
  }

  function emptyState() {
    const box = el("div", "empty");
    box.innerHTML =
      "<h2></h2>" +
      "<p>카드 앞뒷면 사진으로 이렇게 넣어요. 덱 이름은 <code>--deck</code>으로 골라요.</p>" +
      "<pre></pre>" +
      "<p>넣고 나면 이 페이지를 새로 고치면 돼요.</p>";
    const name = decks[deckIdx] ? decks[deckIdx].name : "내 덱";
    box.querySelector("h2").textContent = `${name}이 비어 있어요`;
    box.querySelector("pre").textContent = `py tools/add.py "세트 이름" "카드 이름 SAR 123" --front 앞.jpg --back 뒤.jpg --deck "${name}"`;
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
      } else if (f.design_frame) {
        const td = el("td", null, "틀 모양이 원래 비대칭이라 재지 않음"); td.colSpan = 2; tr.append(td);
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
    renderPoints(box, ct);

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

  // 세 군데 측정: 좌우는 위·가운데·아래, 상하는 왼쪽·가운데·오른쪽에서 따로 잰 비율.
  // 세 값이 POINT_SPREAD %p 넘게 벌어지면 그림이 비스듬하게 인쇄됐거나 잘렸을 수 있다.
  const POINT_AT_KO = { top: "위", middle: "가운데", bottom: "아래", left: "왼쪽", right: "오른쪽" };
  const POINT_SPREAD = 3;
  function renderPoints(box, ct) {
    const faces = ["front", "back"].filter((s) => ct[s] && ct[s].points && !ct[s].design_frame);
    if (!faces.length) return;
    box.append(el("h3", "grades-title", "세 군데 측정 (비스듬한지 확인)"));
    const table = el("table", "ctable ptable");
    const tbody = el("tbody");
    const tilted = [];
    faces.forEach((s) => {
      ["lr", "tb"].forEach((axis) => {
        const rows = ct[s].points[axis] || [];
        const tr = el("tr");
        tr.dataset.side = s;
        tr.append(el("th", null, `${SIDE_KO[s]} ${AXIS_KO[axis]}`));
        const vals = rows.map((r) => r.pct).filter((v) => v != null);
        const spread = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
        const worst = vals.length ? vals.reduce((a, b) => (Math.abs(b - 50) > Math.abs(a - 50) ? b : a)) : null;
        rows.forEach((r) => {
          const td = el("td");
          td.append(el("span", "at", POINT_AT_KO[r.at] || r.at));
          if (r.pct == null) {
            td.append(el("span", "na", "판정 불가"));
          } else {
            const v = el("span", "v", `${r.pct.toFixed(1)} : ${(100 - r.pct).toFixed(1)}`);
            if (spread >= POINT_SPREAD && r.pct === worst) td.classList.add("worst");
            td.append(v);
          }
          tr.append(td);
        });
        if (spread >= POINT_SPREAD) tilted.push(`${SIDE_KO[s]} ${AXIS_KO[axis]} ${spread.toFixed(1)}%p`);
        tbody.append(tr);
      });
    });
    table.append(tbody);
    box.append(table);
    box.append(el("p", "cnote", tilted.length
      ? `세 값이 ${tilted.join(", ")} 벌어졌어요. 그림이 카드에 비스듬하게 놓였을 수 있어요. 진하게 표시한 자리가 가장 치우친 곳이에요.`
      : "세 군데 값이 고르게 나왔어요. 그림이 반듯하게 놓여 있어요."));
  }

  function markSide() {
    const showing = flip.classList.contains("flipped") ? "back" : "front";
    document.querySelectorAll("#centering tr[data-side]").forEach((tr) => tr.classList.toggle("now", tr.dataset.side === showing));
  }

  function render() { renderSummary(); renderDecks(); renderTabs(); renderGrades(); renderDeck(); }

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
  const visible = () => flat.map((f, i) => i).filter((i) => matches(flat[i]));
  function step(d) {
    const v = visible();
    const at = v.indexOf(cur);
    if (at !== -1 && v[at + d] != null) showCard(v[at + d]);
  }

  function showCard(i) {
    cur = i;
    const c = flat[i];
    // 주소창도 지금 카드 링크로 바꿔 둔다(주소를 그대로 복사해도 이 카드로 열린다)
    try { history.replaceState(null, "", "#card=" + encodeURIComponent(keyOf(c))); } catch (e) { /* 주소를 못 바꿔도 화면은 그대로 */ }
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
  const background = [document.querySelector(".top"), tabsEl, document.getElementById("grades"), deckEl];
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
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* 그대로 둬도 된다 */ }
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
  document.getElementById("share-btn").addEventListener("click", () => { if (cur >= 0) window.copyLink(cardUrl(flat[cur])); });
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

  // ---------- 공유 링크 ----------
  // 카드 링크는 index.html#card=<덱>/<세트>/<번호>. 잠긴 덱 카드는 받은 사람도 그 카드 번호를 넣어야 열린다.
  function parseHash() {
    const m = location.hash.match(/^#card=(.+)$/);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }
  function openByKey(key) {
    const a = key.indexOf("/"), b = key.lastIndexOf("/");
    if (a < 0 || b <= a) return false;
    const deckName = key.slice(0, a), setName = key.slice(a + 1, b), no = key.slice(b + 1);
    const i = decks.findIndex((d) => d.name === deckName);
    if (i < 0 || !isShownDeck(i)) return false; // 친구 화면에서는 '내 덱' 링크를 열지 않는다
    if (isLockedDeck(i) && !opened.has(key)) {
      pendingKey = key; pinFor = i; renderDecks();
      return true;
    }
    if (i !== deckIdx) switchDeck(i);
    const idx = flat.findIndex((f) => f.set === setName && String(f.no) === no);
    if (idx < 0) return false;
    pendingKey = null;
    if (viewer.hidden) openViewer(idx); else showCard(idx);
    return true;
  }

  render();
  // 열 수 없는 링크(없는 카드, 친구 화면에서 받은 '내 덱' 링크)는 주소에서 지운다
  function openFromHash() {
    const k = parseHash();
    if (k && !openByKey(k)) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* 그대로 둬도 된다 */ }
    }
  }
  openFromHash();
  // 같은 탭에 다른 카드 링크를 붙여 넣었을 때
  window.addEventListener("hashchange", openFromHash);
})();
