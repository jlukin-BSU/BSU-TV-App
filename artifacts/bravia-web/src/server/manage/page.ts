/**
 * Self-contained management page (device registration), served by the
 * management server on its own port. Plain HTML/CSS/JS -- no build step, and
 * intentionally separate from the display UI. Mobile-first for phone use.
 *
 * Auth: the PIN is held in sessionStorage for the tab and sent as the
 * X-Manage-Pin header on each API call.
 */
export const managePage = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>BSU Display Registry</title>
<style>
  :root { --red:#c41230; --bg:#141414; --panel:#1f1f1f; --line:rgba(255,255,255,.14); --text:#f5f5f5; --muted:#a0a0a0; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  header { padding:1.1rem 1.25rem; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; background:var(--bg); }
  header h1 { font-size:1.15rem; margin:0; font-weight:700; letter-spacing:.01em; }
  header .sub { color:var(--muted); font-size:.8rem; margin-top:.15rem; }
  main { max-width:720px; margin:0 auto; padding:1.25rem; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:1rem 1.1rem; margin-bottom:.9rem; }
  label { display:block; font-size:.82rem; color:var(--muted); margin:.7rem 0 .3rem; }
  input[type=text], input[type=password] { width:100%; padding:.7rem .8rem; font-size:1rem; color:var(--text); background:#141414; border:1px solid var(--line); border-radius:10px; outline:none; }
  input:focus { border-color:var(--red); }
  .row { display:flex; align-items:center; gap:.6rem; }
  .chk { display:flex; align-items:center; gap:.55rem; margin-top:.9rem; font-size:.95rem; }
  .chk input { width:1.2rem; height:1.2rem; accent-color:var(--red); }
  button { font-family:inherit; font-size:1rem; font-weight:600; border:none; border-radius:10px; padding:.7rem 1.1rem; cursor:pointer; }
  .primary { background:var(--red); color:#fff; }
  .ghost { background:rgba(255,255,255,.08); color:var(--text); }
  .danger { background:transparent; color:#f0788a; border:1px solid rgba(240,120,138,.4); padding:.45rem .8rem; font-size:.85rem; }
  .small { padding:.45rem .8rem; font-size:.85rem; }
  .device { display:flex; align-items:center; justify-content:space-between; gap:.8rem; }
  .device .meta { min-width:0; }
  .device .name { font-weight:600; font-size:1.02rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .device .addr { color:var(--muted); font-size:.85rem; margin-top:.15rem; }
  .tag { display:inline-block; font-size:.7rem; font-weight:700; letter-spacing:.05em; padding:.1rem .45rem; border-radius:999px; margin-left:.4rem; vertical-align:middle; }
  .tag.dry { background:#5a4b00; color:#ffd94a; }
  .actions { display:flex; gap:.5rem; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }
  .msg { padding:.7rem .9rem; border-radius:10px; font-size:.9rem; margin-bottom:.9rem; }
  .msg.err { background:rgba(196,18,48,.16); border:1px solid rgba(196,18,48,.5); color:#ff9aa8; }
  .msg.ok { background:rgba(30,125,60,.18); border:1px solid rgba(30,125,60,.5); color:#8ff0ad; }
  .muted { color:var(--muted); font-size:.85rem; }
  .hidden { display:none !important; }
  .toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:.9rem; }
  h2 { font-size:1.05rem; margin:.2rem 0 0; }
  .titem { display:flex; align-items:center; gap:.5rem; padding:.5rem .6rem; border-radius:10px; background:rgba(255,255,255,.05); margin-bottom:.4rem; }
  .titem.off { opacity:.5; }
  .titem .tname { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.98rem; }
  .titem .tkind { color:var(--muted); font-size:.68rem; text-transform:uppercase; letter-spacing:.05em; }
  .titem button { padding:.35rem .6rem; background:rgba(255,255,255,.09); color:var(--text); font-size:.9rem; border-radius:8px; }
  .titem button:disabled { opacity:.3; }
  .titem .eye { min-width:4.6rem; }
</style>
</head>
<body>
<header>
  <div>
    <h1>Display Registry</h1>
    <div class="sub">Bridgewater State University &middot; AV</div>
  </div>
  <button id="logout" class="ghost small hidden">Sign out</button>
</header>
<main>
  <div id="msg"></div>

  <!-- Login -->
  <section id="login" class="card">
    <h2>Sign in</h2>
    <p class="muted" style="margin:.5rem 0 0;">Enter the PIN to register displays.</p>
    <label for="pw">PIN</label>
    <input id="pw" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
    <div style="margin-top:1rem;"><button id="loginBtn" class="primary">Unlock</button></div>
  </section>

  <!-- List -->
  <section id="app" class="hidden">
    <div class="toolbar">
      <h2>Displays (<span id="count">0</span>)</h2>
      <button id="addBtn" class="primary small">+ Add display</button>
    </div>
    <div id="list"></div>
  </section>

  <!-- Editor -->
  <section id="editor" class="card hidden">
    <h2 id="editorTitle">Add display</h2>
    <label for="f_hostname">Hostname <span class="muted">(the display's DNS name &mdash; the IP is resolved from this)</span></label>
    <input id="f_hostname" type="text" autocapitalize="none" autocorrect="off" placeholder="bsu-av-tv-lib-101" />
    <label for="f_label">Label <span class="muted">(shown on the display)</span></label>
    <input id="f_label" type="text" placeholder="Library 101" />
    <label for="f_psk">Pre-Shared Key</label>
    <input id="f_psk" type="text" autocomplete="off" placeholder="from the display's IP control settings" />
    <label for="f_ip">IP override <span class="muted">(optional; leave blank to resolve from the hostname)</span></label>
    <input id="f_ip" type="text" inputmode="decimal" placeholder="usually blank" />
    <label for="f_controlip">Control IP <span class="muted">(optional; bench testing only)</span></label>
    <input id="f_controlip" type="text" inputmode="decimal" placeholder="leave blank in production" />
    <div class="chk"><input id="f_dryrun" type="checkbox" /><label for="f_dryrun" style="margin:0;color:var(--text);">Dry-run (log commands, don't send &mdash; PSK optional)</label></div>
    <div class="row" style="margin-top:1.1rem; gap:.6rem;">
      <button id="saveBtn" class="primary">Save</button>
      <button id="cancelBtn" class="ghost">Cancel</button>
    </div>
  </section>

  <!-- Per-display settings editor -->
  <section id="settings" class="card hidden">
    <h2 id="settingsTitle">Configure</h2>
    <div class="chk" style="margin-top:.8rem;">
      <input id="s_auto" type="checkbox" />
      <label for="s_auto" style="margin:0;color:var(--text);">Return to signage when idle</label>
    </div>
    <label for="s_idle">Idle timeout <span class="muted">(seconds)</span></label>
    <input id="s_idle" type="number" min="30" max="3600" step="30" />
    <label style="margin-top:1rem;">Tiles <span class="muted">(show/hide &amp; order)</span></label>
    <div id="s_tiles"></div>
    <div class="row" style="margin-top:1.1rem; gap:.6rem;">
      <button id="s_saveBtn" class="primary">Save</button>
      <button id="s_cancelBtn" class="ghost">Cancel</button>
    </div>
  </section>
</main>
<script>
(function () {
  var PW_KEY = "bsu_mgmt_pin";
  var editingHost = null;
  var settingsHost = null;
  var settingsTiles = [];
  var $ = function (id) { return document.getElementById(id); };
  function pw() { try { return sessionStorage.getItem(PW_KEY) || ""; } catch (e) { return ""; } }
  function setPw(v) { try { v ? sessionStorage.setItem(PW_KEY, v) : sessionStorage.removeItem(PW_KEY); } catch (e) {} }

  function msg(text, kind) {
    var m = $("msg");
    if (!text) { m.innerHTML = ""; return; }
    m.innerHTML = '<div class="msg ' + (kind || "ok") + '">' + text + "</div>";
    if (kind === "ok") setTimeout(function () { m.innerHTML = ""; }, 2500);
  }

  async function api(method, path, body) {
    var res = await fetch("/api" + path, {
      method: method,
      headers: { "Content-Type": "application/json", "X-Manage-Pin": pw() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    var text = await res.text();
    var data = {};
    try { data = JSON.parse(text); } catch (e) {}
    if (!res.ok) throw new Error(data.message || ("HTTP " + res.status));
    return data;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&amp;";
      if (c === "<") return "&lt;";
      if (c === ">") return "&gt;";
      return "&quot;";
    });
  }

  function showApp(on) {
    $("login").classList.toggle("hidden", on);
    $("app").classList.toggle("hidden", !on);
    $("logout").classList.toggle("hidden", !on);
    if (!on) { $("editor").classList.add("hidden"); $("settings").classList.add("hidden"); }
  }

  async function login() {
    var val = $("pw").value;
    if (!val) return;
    setPw(val);
    try {
      await api("POST", "/session");
      $("pw").value = "";
      msg("");
      showApp(true);
      await refresh();
    } catch (e) {
      setPw("");
      msg(e.message === "Incorrect PIN." ? "Incorrect PIN." : e.message, "err");
    }
  }

  function logout() { setPw(""); showApp(false); }

  async function refresh() {
    var data = await api("GET", "/devices");
    var list = $("list");
    var displays = data.displays || [];
    $("count").textContent = displays.length;
    if (!displays.length) { list.innerHTML = '<div class="card muted">No displays registered yet.</div>'; return; }
    list.innerHTML = displays.map(function (d) {
      var dry = (data.forcedDryRun || d.dryRun) ? '<span class="tag dry">DRY&nbsp;RUN</span>' : "";
      var label = d.label || d.hostname;
      var ip = d.ipOverride ? (esc(d.ipOverride) + " (fixed)") : (d.resolvedIps && d.resolvedIps.length ? esc(d.resolvedIps.join(", ")) : '<span style="color:#f0788a">not resolving</span>');
      return '<div class="card device">' +
        '<div class="meta"><div class="name">' + esc(label) + dry + '</div>' +
        '<div class="addr">' + esc(d.hostname) + ' &middot; ' + ip + '</div></div>' +
        '<div class="actions">' +
        '<button class="primary small" data-cfg="' + esc(d.hostname) + '">Configure</button>' +
        '<button class="ghost small" data-edit="' + esc(d.hostname) + '">Edit</button>' +
        '<button class="danger" data-del="' + esc(d.hostname) + '">Delete</button>' +
        '</div></div>';
    }).join("");
    Array.prototype.forEach.call(list.querySelectorAll("[data-cfg]"), function (b) {
      b.onclick = function () { openSettings(b.getAttribute("data-cfg")); };
    });
    Array.prototype.forEach.call(list.querySelectorAll("[data-edit]"), function (b) {
      b.onclick = function () { openEditor(displays.find(function (x) { return x.hostname === b.getAttribute("data-edit"); })); };
    });
    Array.prototype.forEach.call(list.querySelectorAll("[data-del]"), function (b) {
      b.onclick = function () { del(b.getAttribute("data-del")); };
    });
  }

  function openEditor(d) {
    editingHost = d ? d.hostname : null;
    $("editorTitle").textContent = d ? "Edit display" : "Add display";
    $("f_hostname").value = d ? d.hostname : "";
    $("f_label").value = d && d.label ? d.label : "";
    $("f_psk").value = d && d.psk ? d.psk : "";
    $("f_ip").value = d && d.ipOverride ? d.ipOverride : (d && d.ip ? d.ip : "");
    $("f_controlip").value = d && d.controlIp ? d.controlIp : "";
    $("f_dryrun").checked = !!(d && d.dryRun);
    $("editor").classList.remove("hidden");
    $("app").classList.add("hidden");
    window.scrollTo(0, 0);
  }

  function closeEditor() { $("editor").classList.add("hidden"); $("app").classList.remove("hidden"); }

  async function save() {
    var body = {
      hostname: $("f_hostname").value.trim(),
      psk: $("f_psk").value,
      dryRun: $("f_dryrun").checked,
    };
    var label = $("f_label").value.trim(); if (label) body.label = label;
    var ip = $("f_ip").value.trim(); if (ip) body.ip = ip;
    var cip = $("f_controlip").value.trim(); if (cip) body.controlIp = cip;
    try {
      if (editingHost) await api("PUT", "/devices/" + encodeURIComponent(editingHost), body);
      else await api("POST", "/devices", body);
      closeEditor();
      await refresh();
      msg("Saved.", "ok");
    } catch (e) { msg(e.message, "err"); }
  }

  async function del(host) {
    if (!window.confirm("Remove " + host + "?")) return;
    try { await api("DELETE", "/devices/" + encodeURIComponent(host)); await refresh(); msg("Removed.", "ok"); }
    catch (e) { msg(e.message, "err"); }
  }

  // ---- Per-display settings (tiles / order / idle / auto-signage) ----
  async function openSettings(host) {
    try {
      var s = await api("GET", "/devices/" + encodeURIComponent(host) + "/settings");
      settingsHost = host;
      settingsTiles = (s.tiles || []).map(function (t) { return { key: t.key, kind: t.kind, label: t.label, enabled: !!t.enabled }; });
      $("settingsTitle").textContent = "Configure — " + (s.device.label || host);
      $("s_auto").checked = !!s.autoSignage;
      $("s_idle").value = s.idleSeconds;
      renderSettingsTiles();
      $("settings").classList.remove("hidden");
      $("app").classList.add("hidden");
      window.scrollTo(0, 0);
    } catch (e) { msg(e.message, "err"); }
  }

  function renderSettingsTiles() {
    var box = $("s_tiles");
    box.innerHTML = settingsTiles.map(function (t, i) {
      return '<div class="titem' + (t.enabled ? "" : " off") + '">' +
        '<button data-up="' + i + '"' + (i === 0 ? " disabled" : "") + '>&uarr;</button>' +
        '<button data-down="' + i + '"' + (i === settingsTiles.length - 1 ? " disabled" : "") + '>&darr;</button>' +
        '<span class="tname">' + esc(t.label) + '</span>' +
        '<span class="tkind">' + esc(t.kind) + '</span>' +
        '<button class="eye" data-tog="' + i + '">' + (t.enabled ? "Shown" : "Hidden") + '</button>' +
        '</div>';
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll("[data-up]"), function (b) {
      b.onclick = function () { moveTile(Number(b.getAttribute("data-up")), -1); };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-down]"), function (b) {
      b.onclick = function () { moveTile(Number(b.getAttribute("data-down")), 1); };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-tog]"), function (b) {
      b.onclick = function () { var i = Number(b.getAttribute("data-tog")); settingsTiles[i].enabled = !settingsTiles[i].enabled; renderSettingsTiles(); };
    });
  }

  function moveTile(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= settingsTiles.length) return;
    var tmp = settingsTiles[i]; settingsTiles[i] = settingsTiles[j]; settingsTiles[j] = tmp;
    renderSettingsTiles();
  }

  function closeSettings() { $("settings").classList.add("hidden"); $("app").classList.remove("hidden"); settingsHost = null; }

  async function saveSettings() {
    var enabled = {}, order = [];
    settingsTiles.forEach(function (t) { enabled[t.key] = t.enabled; order.push(t.key); });
    var idle = parseInt($("s_idle").value, 10); if (isNaN(idle)) idle = 300;
    idle = Math.max(30, Math.min(3600, idle));
    try {
      await api("PUT", "/devices/" + encodeURIComponent(settingsHost) + "/settings", {
        enabled: enabled, order: order, autoSignage: $("s_auto").checked, idleSeconds: idle,
      });
      closeSettings();
      msg("Settings saved.", "ok");
    } catch (e) { msg(e.message, "err"); }
  }

  $("loginBtn").onclick = login;
  $("pw").addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
  $("logout").onclick = logout;
  $("addBtn").onclick = function () { openEditor(null); };
  $("saveBtn").onclick = save;
  $("cancelBtn").onclick = closeEditor;
  $("s_saveBtn").onclick = saveSettings;
  $("s_cancelBtn").onclick = closeSettings;

  // Auto-resume if a password is already stored for this tab.
  if (pw()) { api("POST", "/session").then(function () { showApp(true); return refresh(); }).catch(function () { setPw(""); showApp(false); }); }
  else { showApp(false); }
})();
</script>
</body>
</html>`;
