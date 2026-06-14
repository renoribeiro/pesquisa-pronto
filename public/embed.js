/**
 * Pronto Satisfação — loader de embed do formulário de pesquisa.
 *
 * Uso (popup flutuante):
 *   <script src="https://APP/embed.js" data-survey="SLUG" data-mode="popup"
 *           data-label="Avalie-nos" data-color="#901A1E" defer></script>
 *
 * Uso (inline): data-mode="inline" data-height="600px"
 *
 * O script deriva a origem do app do próprio src (cross-origin seguro) e injeta
 * um <iframe> apontando para /embed/SLUG. Sem dependências.
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var all = document.querySelectorAll("script[data-survey]");
      return all.length ? all[all.length - 1] : null;
    })();
  if (!script) return;

  var slug = script.getAttribute("data-survey");
  if (!slug) return;

  var mode = script.getAttribute("data-mode") || "popup";
  var label = script.getAttribute("data-label") || "Avalie-nos";
  var color = script.getAttribute("data-color") || "#901A1E";
  var position = script.getAttribute("data-position") || "right";

  var origin = "";
  try {
    origin = new URL(script.src).origin;
  } catch {
    return;
  }
  var embedUrl = origin + "/embed/" + encodeURIComponent(slug);

  function buildIframe(height) {
    var f = document.createElement("iframe");
    f.src = embedUrl;
    f.title = "Pesquisa de satisfação";
    f.setAttribute("loading", "lazy");
    f.style.border = "0";
    f.style.width = "100%";
    f.style.height = height;
    return f;
  }

  // ── Modo inline ──────────────────────────────────────────────
  if (mode === "inline") {
    var inline = buildIframe(script.getAttribute("data-height") || "600px");
    inline.style.maxWidth = "640px";
    if (script.parentNode) script.parentNode.insertBefore(inline, script.nextSibling);
    return;
  }

  // ── Modo popup ───────────────────────────────────────────────
  var side = position === "left" ? "left:24px;" : "right:24px;";

  var btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.setAttribute("aria-label", label);
  btn.style.cssText =
    "position:fixed;bottom:24px;" +
    side +
    "z-index:2147483000;background:" +
    color +
    ";color:#fff;border:0;border-radius:9999px;padding:14px 22px;" +
    "font:600 15px/1 system-ui,-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer;";

  var overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);" +
    "display:none;align-items:center;justify-content:center;padding:16px;";

  var modal = document.createElement("div");
  modal.style.cssText =
    "position:relative;width:100%;max-width:640px;height:min(86vh,760px);" +
    "background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);";

  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Fechar");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.cssText =
    "position:absolute;top:8px;right:10px;z-index:2;background:rgba(0,0,0,.06);border:0;" +
    "border-radius:9999px;width:32px;height:32px;font-size:22px;line-height:1;cursor:pointer;color:#333;";

  modal.appendChild(closeBtn);
  modal.appendChild(buildIframe("100%"));
  overlay.appendChild(modal);

  function open() {
    overlay.style.display = "flex";
  }
  function close() {
    overlay.style.display = "none";
  }

  btn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  function mount() {
    document.body.appendChild(btn);
    document.body.appendChild(overlay);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
