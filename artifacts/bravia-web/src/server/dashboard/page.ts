/**
 * Self-contained monitoring/control dashboard page. Served on its own port.
 * "/" is the master view (all buildings, master PIN); "/b/CODE" is one building
 * (that building's PIN). Plain HTML/CSS/JS, mobile- and desktop-friendly.
 */
export const dashboardPage = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BSU Display Dashboard</title>
<style>
  :root { --red:#c41230; --bg:#141414; --panel:#1f1f1f; --line:rgba(255,255,255,.14); --text:#f5f5f5; --muted:#9a9a9a; --green:#1e9d54; --amber:#c9a227; --off:#6a6a6a; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  header { padding:1rem 1.25rem; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:1rem; position:sticky; top:0; background:var(--bg); z-index:5; }
  header h1 { font-size:1.2rem; margin:0; }
  header .sub { color:var(--muted); font-size:.8rem; margin-top:.15rem; }
  main { max-width:1200px; margin:0 auto; padding:1.25rem; }
  button { font-family:inherit; font-weight:600; border:none; border-radius:9px; padding:.55rem .9rem; cursor:pointer; font-size:.92rem; }
  .primary { background:var(--red); color:#fff; }
  .ghost { background:rgba(255,255,255,.08); color:var(--text); }
  .ghost.small { padding:.4rem .7rem; font-size:.82rem; }
  input[type=password] { width:100%; padding:.7rem .8rem; font-size:1rem; color:var(--text); background:#141414; border:1px solid var(--line); border-radius:10px; outline:none; }
  input:focus { border-color:var(--red); }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:1rem 1.1rem; }
  .login { max-width:26rem; margin:2rem auto; }
  .msg { padding:.7rem .9rem; border-radius:10px; font-size:.9rem; margin-bottom:.9rem; }
  .msg.err { background:rgba(196,18,48,.16); border:1px solid rgba(196,18,48,.5); color:#ff9aa8; }
  .msg.ok { background:rgba(30,125,60,.18); border:1px solid rgba(30,125,60,.5); color:#8ff0ad; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); gap:1rem; }
  .bldg { margin:1.4rem 0 .6rem; font-size:1.05rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
  .tv { display:flex; flex-direction:column; gap:.7rem; }
  .tv .top { display:flex; align-items:flex-start; justify-content:space-between; gap:.6rem; }
  .tv .name { font-weight:600; font-size:1.05rem; }
  .tv .host { color:var(--muted); font-size:.78rem; margin-top:.1rem; }
  .badge { font-size:.72rem; font-weight:700; padding:.2rem .55rem; border-radius:999px; white-space:nowrap; }
  .badge.on { background:rgba(30,157,84,.2); color:#78e0a6; }
  .badge.off { background:rgba(120,120,120,.2); color:#c9c9c9; }
  .badge.offline { background:rgba(196,18,48,.2); color:#ff9aa8; }
  .badge.unknown { background:rgba(201,162,39,.2); color:#e6cf6f; }
  .row { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
  .kv { font-size:.9rem; color:var(--muted); }
  .kv b { color:var(--text); font-weight:600; }
  .ctrls { display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; }
  select { padding:.5rem .6rem; font-size:.9rem; color:var(--text); background:#141414; border:1px solid var(--line); border-radius:9px; max-width:11rem; }
  .hidden { display:none !important; }
  .muted { color:var(--muted); font-size:.85rem; }
  .updated { color:var(--muted); font-size:.72rem; }
</style>
</head>
<body>
<header>
  <div><h1 id="title">Display Dashboard</h1><div class="sub">Bridgewater State University &middot; AV</div></div>
  <div class="row">
    <span id="tick" class="updated"></span>
    <button id="refreshBtn" class="ghost small hidden">Refresh</button>
    <button id="logout" class="ghost small hidden">Sign out</button>
  </div>
</header>
<main>
  <div id="msg"></div>

  <section id="login" class="card login">
    <h2 id="loginTitle" style="margin:.2rem 0 .3rem;">Sign in</h2>
    <p class="muted" id="loginSub" style="margin:0 0 .8rem;"></p>
    <input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="PIN" />
    <div style="margin-top:1rem;"><button id="loginBtn" class="primary">Unlock</button></div>
  </section>

  <section id="dash" class="hidden"><div id="content"></div></section>
</main>
<script>
(function () {
  var path = location.pathname;
  var mBuilding = /^\\/b\\/([^/]+)/.exec(path);
  var building = mBuilding ? decodeURIComponent(mBuilding[1]).toUpperCase() : null; // null = master view
  var PIN_KEY = "bsu_dash_pin_" + (building || "master");
  var options = { inputs: [], apps: [] };
  var timer = null;

  var $ = function (id) { return document.getElementById(id); };
  function pin() { try { return sessionStorage.getItem(PIN_KEY) || ""; } catch (e) { return ""; } }
  function setPin(v) { try { v ? sessionStorage.setItem(PIN_KEY, v) : sessionStorage.removeItem(PIN_KEY); } catch (e) {} }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":"&quot;";}); }
  function msg(t,k){ var m=$("msg"); if(!t){m.innerHTML="";return;} m.innerHTML='<div class="msg '+(k||"ok")+'">'+t+'</div>'; if(k==="ok") setTimeout(function(){m.innerHTML="";},2500); }

  $("title").textContent = building ? ("Dashboard \\u2014 " + building) : "All Displays";
  $("loginSub").textContent = building ? ("Enter the PIN for " + building + ".") : "Enter the master PIN (all buildings).";

  async function api(method, path, body, headers) {
    var h = { "Content-Type": "application/json" };
    if (headers) for (var k in headers) h[k] = headers[k];
    var res = await fetch("/api" + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    var text = await res.text(); var data = {};
    try { data = JSON.parse(text); } catch (e) {}
    if (!res.ok) throw new Error(data.message || ("HTTP " + res.status));
    return data;
  }

  function showDash(on) {
    $("login").classList.toggle("hidden", on);
    $("dash").classList.toggle("hidden", !on);
    $("refreshBtn").classList.toggle("hidden", !on);
    $("logout").classList.toggle("hidden", !on);
  }

  async function login() {
    var val = $("pin").value; if (!val) return;
    setPin(val);
    try {
      await api("POST", "/login", building ? { pin: val, building: building } : { pin: val });
      $("pin").value = ""; msg(""); showDash(true);
      await load(true);
      startTimer();
    } catch (e) { setPin(""); msg(e.message === "Incorrect PIN." ? "Incorrect PIN." : e.message, "err"); }
  }
  function logout() { setPin(""); showDash(false); if (timer) clearInterval(timer); }

  function startTimer() {
    if (timer) clearInterval(timer);
    // Read the server's cache periodically (cheap); the server polls displays on
    // its own long interval, and we do a live poll only on load / Refresh.
    timer = setInterval(function () { load(false); }, 30000);
  }

  function q(refresh) {
    var p = "/state?" + (building ? "building=" + encodeURIComponent(building) + "&" : "") + (refresh ? "refresh=1" : "");
    return api("GET", p, undefined, { "X-Dash-Pin": pin() });
  }

  async function load(refresh) {
    try {
      if (refresh) $("tick").textContent = "polling\\u2026";
      var data = await q(refresh);
      options = data.options || options;
      render(data.displays || []);
      $("tick").textContent = "updated " + new Date().toLocaleTimeString();
    } catch (e) {
      if (e.message === "Incorrect PIN.") { logout(); msg("Session expired \\u2014 sign in again.", "err"); }
      else msg(e.message, "err");
    }
  }

  function sourceSelect(d) {
    var opts = '<option value="">Change source\\u2026</option>';
    opts += '<optgroup label="Inputs">' + options.inputs.map(function (i) { return '<option value="input:' + esc(i.id) + '">' + esc(i.label) + '</option>'; }).join("") + '</optgroup>';
    opts += '<optgroup label="Apps">' + options.apps.map(function (a) { return '<option value="app:' + esc(a.id) + '">' + esc(a.label) + '</option>'; }).join("") + '</optgroup>';
    return '<select data-src="' + esc(d.hostname) + '">' + opts + '</select>';
  }

  function card(d) {
    var badge = d.power === "on" ? '<span class="badge on">ON</span>'
      : d.power === "off" ? '<span class="badge off">OFF</span>'
      : d.power === "offline" ? '<span class="badge offline">OFFLINE</span>'
      : '<span class="badge unknown">?</span>';
    var vol = (d.volume == null) ? "\\u2014" : (d.volume + (d.mute ? " (muted)" : ""));
    var src = d.source || "\\u2014";
    var powerBtn = (d.power === "on")
      ? '<button class="ghost small" data-act="power" data-val="off" data-h="' + esc(d.hostname) + '">Turn off</button>'
      : '<button class="ghost small" data-act="power" data-val="on" data-h="' + esc(d.hostname) + '">Turn on</button>';
    var volSel = '<select data-vol="' + esc(d.hostname) + '"><option value="">Set\\u2026</option>';
    for (var v = 0; v <= 100; v++) volSel += '<option value="' + v + '"' + (d.volume === v ? " selected" : "") + '>' + v + '</option>';
    volSel += '</select>';
    return '<div class="card tv" data-card="' + esc(d.hostname) + '">' +
      '<div class="top"><div><div class="name">' + esc(d.label) + '</div><div class="host">' + esc(d.hostname) + (d.dryRun ? " &middot; dry-run" : "") + '</div></div>' + badge + '</div>' +
      '<div class="kv">Source: <b class="f-src">' + esc(src) + '</b></div>' +
      '<div class="row"><span class="kv">Volume: <b class="f-vol">' + esc(vol) + '</b></span></div>' +
      '<div class="ctrls">' +
        powerBtn +
        '<button class="ghost small" data-act="voldown" data-h="' + esc(d.hostname) + '">Vol \\u2212</button>' +
        '<button class="ghost small" data-act="volup" data-h="' + esc(d.hostname) + '">Vol +</button>' +
        volSel +
        '<button class="ghost small" data-act="mute" data-val="' + (d.mute ? "off" : "on") + '" data-h="' + esc(d.hostname) + '">' + (d.mute ? "Unmute" : "Mute") + '</button>' +
        '<button class="ghost small" data-act="screenoff" data-h="' + esc(d.hostname) + '">Screen off</button>' +
      '</div>' +
      '<div class="ctrls">' + sourceSelect(d) + '</div>' +
      '</div>';
  }

  function render(displays) {
    var content = $("content");
    if (!displays.length) { content.innerHTML = '<p class="muted">No displays in this view.</p>'; return; }
    if (building) {
      content.innerHTML = '<div class="grid">' + displays.map(card).join("") + '</div>';
    } else {
      // Master: group by building.
      var groups = {};
      displays.forEach(function (d) { (groups[d.building] = groups[d.building] || []).push(d); });
      content.innerHTML = Object.keys(groups).sort().map(function (b) {
        return '<div class="bldg">' + esc(b) + ' (' + groups[b].length + ')</div><div class="grid">' + groups[b].map(card).join("") + '</div>';
      }).join("");
    }
    wire();
  }

  function updateCard(state) {
    var el = document.querySelector('[data-card="' + state.hostname + '"]');
    if (!el) { load(false); return; }
    el.querySelector(".f-src").textContent = state.source || "\\u2014";
    el.querySelector(".f-vol").textContent = (state.volume == null) ? "\\u2014" : (state.volume + (state.mute ? " (muted)" : ""));
  }

  async function control(hostname, action, value) {
    try {
      var r = await api("POST", "/control", { hostname: hostname, action: action, value: value }, { "X-Dash-Pin": pin() });
      if (r.state) { updateCard(r.state); load(false); }
      msg("Done.", "ok");
    } catch (e) { msg(e.message, "err"); }
  }

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-act]"), function (b) {
      b.onclick = function () { control(b.getAttribute("data-h"), b.getAttribute("data-act"), b.getAttribute("data-val") || undefined); };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-src]"), function (s) {
      s.onchange = function () {
        var v = s.value; if (!v) return;
        var parts = v.split(":");
        control(s.getAttribute("data-src"), parts[0], parts[1]);
        s.value = "";
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-vol]"), function (s) {
      s.onchange = function () {
        if (s.value === "") return;
        control(s.getAttribute("data-vol"), "volume", s.value);
      };
    });
  }

  $("loginBtn").onclick = login;
  $("pin").addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
  $("logout").onclick = logout;
  $("refreshBtn").onclick = function () { load(true); };

  if (pin()) { showDash(true); load(true).then(startTimer); }
  else { showDash(false); }
})();
</script>
</body>
</html>`;
