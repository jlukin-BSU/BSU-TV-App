/**
 * Self-contained management page (device registration), served by the
 * management server on its own port. Plain HTML/CSS/JS -- no build step, and
 * intentionally separate from the display UI. Mobile-first for phone use.
 *
 * Auth: the password is held in sessionStorage for the tab and sent as the
 * X-Manage-Password header on each API call.
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
  .actions { display:flex; gap:.5rem; flex-shrink:0; }
  .msg { padding:.7rem .9rem; border-radius:10px; font-size:.9rem; margin-bottom:.9rem; }
  .msg.err { background:rgba(196,18,48,.16); border:1px solid rgba(196,18,48,.5); color:#ff9aa8; }
  .msg.ok { background:rgba(30,125,60,.18); border:1px solid rgba(30,125,60,.5); color:#8ff0ad; }
  .muted { color:var(--muted); font-size:.85rem; }
  .hidden { display:none !important; }
  .toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:.9rem; }
  h2 { font-size:1.05rem; margin:.2rem 0 0; }
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
    <p class="muted" style="margin:.5rem 0 0;">Enter the management password to register displays.</p>
    <label for="pw">Password</label>
    <input id="pw" type="password" autocomplete="current-password" />
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
    <label for="f_ip">IP address <span class="muted">(the display's reserved address)</span></label>
    <input id="f_ip" type="text" inputmode="decimal" placeholder="10.28.147.50" />
    <label for="f_hostname">Hostname</label>
    <input id="f_hostname" type="text" placeholder="bsu-av-tv-lib-101" />
    <label for="f_label">Label <span class="muted">(shown on the display)</span></label>
    <input id="f_label" type="text" placeholder="Library 101" />
    <label for="f_psk">Pre-Shared Key</label>
    <input id="f_psk" type="text" autocomplete="off" placeholder="from the display's IP control settings" />
    <label for="f_controlip">Control IP <span class="muted">(optional; only for bench testing)</span></label>
    <input id="f_controlip" type="text" inputmode="decimal" placeholder="leave blank in production" />
    <div class="chk"><input id="f_dryrun" type="checkbox" /><label for="f_dryrun" style="margin:0;color:var(--text);">Dry-run (log commands, don't send &mdash; PSK optional)</label></div>
    <div class="row" style="margin-top:1.1rem; gap:.6rem;">
      <button id="saveBtn" class="primary">Save</button>
      <button id="cancelBtn" class="ghost">Cancel</button>
    </div>
  </section>
</main>
<script>
(function () {
  var PW_KEY = "bsu_mgmt_pw";
  var editingIp = null;
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
      headers: { "Content-Type": "application/json", "X-Manage-Password": pw() },
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
    if (!on) $("editor").classList.add("hidden");
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
      msg(e.message === "Incorrect management password." ? "Incorrect password." : e.message, "err");
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
      return '<div class="card device">' +
        '<div class="meta"><div class="name">' + esc(label) + dry + '</div>' +
        '<div class="addr">' + esc(d.ip) + ' &middot; ' + esc(d.hostname) + '</div></div>' +
        '<div class="actions">' +
        '<button class="ghost small" data-edit="' + esc(d.ip) + '">Edit</button>' +
        '<button class="danger" data-del="' + esc(d.ip) + '">Delete</button>' +
        '</div></div>';
    }).join("");
    Array.prototype.forEach.call(list.querySelectorAll("[data-edit]"), function (b) {
      b.onclick = function () { openEditor(displays.find(function (x) { return x.ip === b.getAttribute("data-edit"); })); };
    });
    Array.prototype.forEach.call(list.querySelectorAll("[data-del]"), function (b) {
      b.onclick = function () { del(b.getAttribute("data-del")); };
    });
  }

  function openEditor(d) {
    editingIp = d ? d.ip : null;
    $("editorTitle").textContent = d ? "Edit display" : "Add display";
    $("f_ip").value = d ? d.ip : "";
    $("f_hostname").value = d ? d.hostname : "";
    $("f_label").value = d && d.label ? d.label : "";
    $("f_psk").value = d && d.psk ? d.psk : "";
    $("f_controlip").value = d && d.controlIp ? d.controlIp : "";
    $("f_dryrun").checked = !!(d && d.dryRun);
    $("editor").classList.remove("hidden");
    $("app").classList.add("hidden");
    window.scrollTo(0, 0);
  }

  function closeEditor() { $("editor").classList.add("hidden"); $("app").classList.remove("hidden"); }

  async function save() {
    var body = {
      ip: $("f_ip").value.trim(),
      hostname: $("f_hostname").value.trim(),
      psk: $("f_psk").value,
      dryRun: $("f_dryrun").checked,
    };
    var label = $("f_label").value.trim(); if (label) body.label = label;
    var cip = $("f_controlip").value.trim(); if (cip) body.controlIp = cip;
    try {
      if (editingIp) await api("PUT", "/devices/" + encodeURIComponent(editingIp), body);
      else await api("POST", "/devices", body);
      closeEditor();
      await refresh();
      msg("Saved.", "ok");
    } catch (e) { msg(e.message, "err"); }
  }

  async function del(ip) {
    if (!window.confirm("Remove the display at " + ip + "?")) return;
    try { await api("DELETE", "/devices/" + encodeURIComponent(ip)); await refresh(); msg("Removed.", "ok"); }
    catch (e) { msg(e.message, "err"); }
  }

  $("loginBtn").onclick = login;
  $("pw").addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
  $("logout").onclick = logout;
  $("addBtn").onclick = function () { openEditor(null); };
  $("saveBtn").onclick = save;
  $("cancelBtn").onclick = closeEditor;

  // Auto-resume if a password is already stored for this tab.
  if (pw()) { api("POST", "/session").then(function () { showApp(true); return refresh(); }).catch(function () { setPw(""); showApp(false); }); }
  else { showApp(false); }
})();
</script>
</body>
</html>`;
