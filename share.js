// 링크 복사 공용 도우미 (index.html, prices.html)
// window.copyLink(url) → 클립보드에 복사하고 화면 아래에 잠깐 알림을 띄운다.
(function () {
  "use strict";
  let toast = null, timer = 0;
  function notify(text) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.append(toast);
    }
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }
  // clipboard API는 https나 localhost에서만 된다. 안 되면 옛 방식(execCommand)으로 한 번 더 해 본다.
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  window.copyLink = async function (url) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); ok = true; }
    } catch (e) { ok = false; }
    if (!ok) ok = fallbackCopy(url);
    notify(ok ? "링크를 복사했어요" : "복사하지 못했어요. 주소창의 주소를 복사해 주세요.");
    return ok;
  };
})();
