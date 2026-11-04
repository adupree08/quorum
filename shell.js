/* Quorum shell — three surfaces (launcher, dashboard, member app), one identity,
   one live chapter record shared across devices. Runs before app.js. */
(function () {
  "use strict";

  var KEY_ID = "quorum.identity.v1";
  var KEY_MODE = "quorum.mode.v1";
  /* The QR has to send phones to a plain web page. A claude.ai link deep-links
     into the Claude app on iOS, which is not the demo. */
  var SHARE_URL = "https://adupree08.github.io/quorum/";
  var CID = Math.random().toString(36).slice(2);

  /* ---- runs synchronously, before app.js boots ---- */
  var saved = null;
  try { saved = localStorage.getItem(KEY_ID); } catch (e) {}
  if (saved) window.QUORUM_ME = saved;

  var mode = null;
  try { mode = localStorage.getItem(KEY_MODE); } catch (e) {}
  if (!mode) mode = (window.innerWidth < 760 ? "app" : "launcher");
  if (!saved) mode = "launcher";
  document.documentElement.setAttribute("data-mode", mode);

  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]);
    });
  }
  function $(s) { return document.querySelector(s); }

  function qrSVG(text, px) {
    try {
      var q = qrcode(0, "M"); q.addData(text); q.make();
      return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      return '<div style="width:' + px + 'px;height:' + px + 'px;display:grid;place-items:center;' +
        'border:1px dashed #CFD4DA;border-radius:8px;font-size:11px;color:#6E7781;text-align:center;padding:12px">' +
        'QR unavailable.<br>Use the link below.</div>';
    }
  }

  var ROLE_LABEL = {
    president: "Full access", vicepresident: "No ledger", treasurer: "Money",
    secretary: "Records", strategus: "Attendance", chair: "One committee", member: "App only"
  };

  /* ------------------------------- launcher -------------------------------
     Two screens: a welcome card carrying the QR and the link, then the
     profile picker. The demo opens on the QR so the room can scan it first. */
  var PHONE = (window.innerWidth < 760);
  /* a phone arrived here BY scanning the code, so showing it the code again
     is a dead end. Land it straight on the picker. */
  var step = (PHONE && !saved) ? "signin" : "welcome";

  function buildLauncher() {
    var Q = window.QUORUM;
    var host = document.getElementById("launcher");
    if (!Q || !host) return;
    host.innerHTML = (step === "welcome" ? welcomeHTML() : signinHTML());
    host.scrollTop = 0;
  }

  function welcomeHTML() {
    var url = SHARE_URL;
    return '<div class="lx lx-welcome">' +
      '<div class="wcard">' +
      '<div class="lbrand"><span class="mark"></span><span class="wordmark">Quorum</span>' +
      '<span class="tag">Functional prototype</span></div>' +
      "<h1>Tulsa Alumni Chapter</h1>" +
      '<p class="lsub">Kappa Alpha Psi Fraternity, Inc. &middot; Southwestern Province &middot; chartered 1974</p>' +
      '<p class="wlead">A private chapter platform: one officer dashboard, one member app, one set of records. ' +
      "Nobody outside this chapter can read it, search it, or find it.</p>" +

      '<div class="wsplit">' +
      '<div class="wqr"><div class="qrbig">' + qrSVG(url, 210) + "</div>" +
      '<div class="wqr-cap">Scan to open the member app on your phone</div></div>' +
      '<div class="wqr-side">' +
      '<h2>Follow along on your own phone</h2>' +
      '<p class="lp">Point your camera at the code. The app opens full screen and signs you in as a brother of this chapter. ' +
      "Everything you tap is live, and the dashboard on this screen sees it.</p>" +
      '<div class="linkrow"><code>' + esc(url.replace("https://", "")) + "</code>" +
      '<button class="btn sm ghost" data-copy="' + esc(url) + '">Copy</button></div>' +
      '<p class="lfine">No download, no account. Works on any phone with a camera.</p>' +
      "</div></div>" +

      '<button class="btn wgo" data-step="signin">Sign in to the demo &rarr;</button>' +
      '<div class="wfoot"><span class="syncdot" id="syncDot"></span><span id="syncTxt">Connecting the live chapter record&hellip;</span>' +
      '<span class="sp"></span><button class="btn ghost sm" data-action="reset">Reset the chapter</button></div>' +
      "</div></div>";
  }

  function signinHTML() {
    var Q = window.QUORUM;
    var cards = Q.profiles().map(function (p) {
      var m = Q.member(p.id);
      var officer = p.role !== "member";
      var cur = Q.me() === p.id;
      var title = m.roles[0];
      if (p.role === "chair") {
        var k = (Q.committeeChairedBy && Q.committeeChairedBy(p.id)) || null;
        if (k) title = k + " \u00b7 Chair";
      }
      return '<article class="pcard' + (cur ? " on" : "") + '">' +
        '<div class="pc-top">' + Q.av(m, 48) +
        '<div class="pc-id"><div class="pc-n">' + esc(Q.full(m)) + "</div>" +
        '<div class="pc-r">' + esc(title) + "</div></div>" +
        '<span class="pc-tag' + (officer ? "" : " mem") + '">' + ROLE_LABEL[p.role] + "</span></div>" +
        '<p class="pc-b">' + esc(p.blurb) + "</p>" +
        '<div class="pc-go">' +
        (officer
          ? '<button class="btn" data-go="dashboard" data-id="' + p.id + '">Open dashboard</button>' +
            '<button class="btn ghost" data-go="app" data-id="' + p.id + '">His phone</button>'
          : '<button class="btn" data-go="app" data-id="' + p.id + '">Open his phone</button>') +
        "</div></article>";
    }).join("");

    return '<div class="lx">' +
      (PHONE ? "" : '<button class="backlink" data-step="welcome">&lsaquo; Back to the code</button>') +
      '<header class="lhead"><div class="lbrand"><span class="mark"></span><span class="wordmark">Quorum</span>' +
      '<span class="tag">Functional prototype</span></div>' +
      "<h1>Sign in as</h1>" +
      '<p class="lsub">' + (PHONE
        ? "Eight brothers, each with the access his office really carries. Pick one and you are in. " +
          "Whatever you tap shows up on the dashboard in the room."
        : "Eight profiles, each with the access that office really carries. " +
          "Pick one on this screen and a different one on your phone to watch both sides move together.") +
      "</p></header>" +
      '<div class="pgrid pgrid-wide">' + cards + "</div>" +
      '<div class="lfoot"><span class="syncdot" id="syncDot"></span><span id="syncTxt">Connecting&hellip;</span>' +
      '<span class="sp"></span><button class="btn ghost sm" data-copy="' + esc(SHARE_URL) + '">Copy the demo link</button>' +
      '<button class="btn ghost sm" data-action="reset">Reset the chapter</button></div>' +
      "</div>";
  }

  /* --------------------------- mode + chrome --------------------------- */
  function setMode(m) {
    mode = m;
    document.documentElement.setAttribute("data-mode", m);
    try { localStorage.setItem(KEY_MODE, m); } catch (e) {}
    if (m === "launcher") buildLauncher();
    buildChrome();
    window.scrollTo(0, 0);
  }
  function setIdentity(id) {
    try { localStorage.setItem(KEY_ID, id); } catch (e) {}
    window.QUORUM_ME = id;
    window.QUORUM.setIdentity(id);
    buildChrome();
  }

  function buildChrome() {
    var Q = window.QUORUM, bar = $("#modebar");
    if (!Q || !bar) return;
    if (mode === "launcher") { bar.innerHTML = ""; return; }
    var m = Q.member(Q.me()), p = Q.myProfile();
    var officer = p.role !== "member";
    bar.innerHTML =
      '<button class="mb-home" data-step-home="1" title="Back to the demo code">' +
      '<span class="mb-mark"></span>Quorum</button>' +
      '<button class="mb-id" data-action="switch-profile">' + Q.av(m, 26) +
      '<span class="mb-n">' + esc(Q.full(m)) + '</span><span class="mb-r">' + esc(m.roles[0]) + "</span>" +
      '<span class="mb-sw">Switch</span></button>' +
      '<span class="sp"></span>' +
      '<div class="mb-seg">' +
      (officer ? '<button data-mode="dashboard" class="' + (mode === "dashboard" ? "on" : "") + '">Dashboard</button>' : "") +
      '<button data-mode="app" class="' + (mode === "app" ? "on" : "") + '">Member app</button>' +
      "</div>" +
      '<span class="mb-sync" id="syncChip"></span>';
    paintSync();
  }

  /* ------------------------------ live sync ------------------------------ */
  var syncState = "connecting";
  function paintSync() {
    var txt = { connecting: "Connecting…", live: "Live — shared across devices",
      local: "This device only", readonly: "Read-only here" }[syncState];
    var t = $("#syncTxt"), d = $("#syncDot"), c = $("#syncChip");
    if (t) t.textContent = txt;
    if (d) d.className = "syncdot " + syncState;
    if (c) c.innerHTML = '<span class="syncdot ' + syncState + '"></span>' +
      (syncState === "live" ? "Live" : syncState === "local" ? "Local" : syncState === "readonly" ? "Read-only" : "…");
  }
  function setSync(s) { syncState = s; paintSync(); }

  var liveDoc = null, applying = false, timer = null;

  function startSync() {
    if (!window.claude || typeof window.claude.use !== "function") { setSync("local"); return; }
    window.claude.use("db").then(function (dbc) {
      if (!dbc) { setSync("local"); return; }
      liveDoc = dbc.doc("live/chapter");
      liveDoc.onSnapshot(function (snap) {
        var d = snap && snap.data;
        if (!d || !d.json || d.cid === CID) return;
        try {
          applying = true;
          window.QUORUM.restore(JSON.parse(d.json));
        } catch (e) {} finally { applying = false; }
        setSync("live");
      }, function () { setSync("local"); });
      setSync("live");
      window.QUORUM.onChange = push;
    }).catch(function () { setSync("local"); });
  }

  function push(obj) {
    if (!liveDoc || applying) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      liveDoc.set({ json: JSON.stringify(obj), cid: CID, at: Date.now() })
        .then(function () { setSync("live"); })
        .catch(function () { setSync("readonly"); });
    }, 650);
  }

  /* -------------------------------- events -------------------------------- */
  document.addEventListener("click", function (e) {
    var go = e.target.closest("[data-go]");
    if (go) { e.preventDefault(); setIdentity(go.dataset.id); setMode(go.dataset.go); return; }
    var hm = e.target.closest("[data-step-home]");
    if (hm) { e.preventDefault(); step = "welcome"; setMode("launcher"); return; }
    var st = e.target.closest("[data-step]");
    if (st) { e.preventDefault(); step = st.dataset.step; buildLauncher(); paintSync(); return; }
    var md = e.target.closest("[data-mode]");
    if (md) { e.preventDefault(); setMode(md.dataset.mode); return; }
    var cp = e.target.closest("[data-copy]");
    if (cp) {
      e.preventDefault();
      if (navigator.clipboard) navigator.clipboard.writeText(cp.dataset.copy).catch(function () {});
      cp.textContent = "Copied";
      setTimeout(function () { cp.textContent = "Copy"; }, 1400);
    }
  });

  window.QUORUM_SHELL = {
    bridgeReady: function () { boot(); },
    openPicker: function () { step = "signin"; setMode("launcher"); },
    clearLive: function () { if (liveDoc) liveDoc.set({ json: "", cid: CID, at: Date.now() }).catch(function () {}); }
  };

  /* visible diagnostics: a silent blank page is the worst failure mode */
  function fail(where, err) {
    var host = document.getElementById("launcher");
    document.documentElement.setAttribute("data-mode", "launcher");
    if (!host) return;
    host.innerHTML = '<div class="lx"><div class="lcard" style="max-width:640px">' +
      '<h2>The prototype could not start</h2>' +
      '<p class="lp">Stage: <b>' + esc(where) + "</b></p>" +
      '<pre style="background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;padding:12px;' +
      'overflow:auto;font-family:var(--mono);font-size:11.5px;white-space:pre-wrap">' +
      esc((err && (err.stack || err.message)) || String(err)) + "</pre></div></div>";
  }
  window.addEventListener("error", function (e) {
    if (!window.QUORUM) fail("loading app.js", e.error || e.message);
  });

  /* Script order is not guaranteed in every host, so wait for the bridge rather
     than assume app.js already ran. app.js also calls bridgeReady() directly. */
  var booted = false;
  function boot() {
    if (booted || !window.QUORUM) return;
    booted = true;
    try {
      if (mode === "launcher") buildLauncher();
      buildChrome();
    } catch (err) { fail("building the launcher", err); return; }
    try { startSync(); } catch (err) { setSync("local"); }
  }
  var waited = 0;
  var poll = setInterval(function () {
    waited += 60;
    if (window.QUORUM) { clearInterval(poll); boot(); return; }
    if (waited >= 8000) {
      clearInterval(poll);
      if (!window.QUORUM) fail("app.js never defined window.QUORUM", new Error("bridge missing after 8s"));
    }
  }, 60);
  if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(boot, 0);
  window.addEventListener("DOMContentLoaded", boot);
  window.addEventListener("load", boot);
})();
