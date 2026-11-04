/* Quorum — chapter operating system prototype. Two surfaces, one set of records. */
(function () {
  "use strict";

  /* The seed re-anchors itself onto today (see reanchor in data.js), so the
     clock here is the real one and past/upcoming is never stale. */
  var TODAY = (function () { var d = new Date(); d.setHours(12, 0, 0, 0); return d; })();
  function isoToday() {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return TODAY.getFullYear() + "-" + p(TODAY.getMonth() + 1) + "-" + p(TODAY.getDate());
  }
  function when(e) {
    /* an event is over once its start time has passed, not at midnight */
    var d = new Date(e.date + "T12:00:00");
    var t = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(e.time || "");
    if (t) { var h = Number(t[1]) % 12 + (/pm/i.test(t[3]) ? 12 : 0); d.setHours(h, Number(t[2]), 0, 0); }
    return d;
  }
  function isPast(e) { return when(e) < new Date(); }
  var db = window.QUORUM_SEED();
  // Who you are signed in as. Chosen on the launcher, persisted per device,
  // so a laptop can be the Polemarch while a phone is a plain Brother.
  var PROFILES = [
    { id: "m1",  role: "president",     blurb: "Runs the chapter. Sees and does everything, including settings and handoff." },
    { id: "m2",  role: "vicepresident", blurb: "Everything except the ledger and chapter settings." },
    { id: "m3",  role: "treasurer",     blurb: "The money: dues, payment requests, the budget and the ledger." },
    { id: "m5",  role: "secretary",     blurb: "Roster, attendance, minutes and votes, the Vault, messages. No money." },
    { id: "m9",  role: "strategus",     blurb: "Attendance, check-in and events. No money, no records." },
    { id: "m14", role: "chair",         blurb: "His committee, its budget line and its events. Roster is read-only." },
    { id: "m11", role: "member",        blurb: "App only. No dashboard at all. Financial, on one committee." },
    { id: "m15", role: "member",        blurb: "App only, and behind on dues. Use him to test the chasing flow." }
  ];
  var ME = (window.QUORUM_ME || "m1");
  function myProfile() { for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === ME) return PROFILES[i]; return PROFILES[0]; }
  var ROLE_MEMBER = { president: "m1", vicepresident: "m2", treasurer: "m3", secretary: "m5", strategus: "m9", chair: "m14", member: ME };
  var state = {
    role: "president", view: "home", tab: "home", search: "", filter: "all",
    selected: {}, channel: "c1", appChannel: null, focusSearch: false,
    checkout: { method: "ach", qty: 1 }, profileTab: "profile", moreView: null, ctx: null, komId: null, reqKind: "chapter", sort: "name", sortDir: 1, attEvent: null, evId: null, budgetEdit: false, goalEdit: null, calYM: "2026-10"
  };

  /* ---------------------------------------------------------- helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]); }); }
  function money(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
  function achFee(a) { return Math.min(a * 0.008, 5); }
  function cardFee(a) { return a * 0.029 + 0.30; }
  function uid(p) { return p + Math.random().toString(36).slice(2, 8); }
  function rcode() { return Math.random().toString(36).slice(2, 8); }
  function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function member(id) { return find(db.members, id); }
  function bill(id) { return find(db.bills, id); }
  function ev(id) { return find(db.events, id); }
  function kom(id) { return find(db.committees, id); }
  function chan(id) { return find(db.channels, id); }
  function full(m) { return m ? m.first + " " + m.last : "—"; }
  function initials(m) { return m ? (m.first[0] + m.last[0]).toUpperCase() : "?"; }
  function actives() { return db.members.filter(function (m) { return m.status === "active"; }); }
  function pendings() { return db.members.filter(function (m) { return m.status === "pending"; }); }
  function isLink(d) { return d.kind === "link"; }
  function docsFor(key, id) { return db.docs.filter(function (d) { return d[key] === id; }); }

  /* The same documents block on a committee page and an event page. Whatever is
     added here still lands in the Vault, it is just tagged so it also shows
     where the work actually happens. */
  function attachedDocs(label, key, id, folder) {
    var items = docsFor(key, id);
    var attr = (key === "komId" ? ' data-kom="' : ' data-ev="') + id + '" data-folder="' + folder + '"';
    var rows = items.length ? items.map(function (d) {
      return '<div class="docrow"><div class="dicon' + (isLink(d) ? " link" : "") + '"><span>' + docTag(d) + "</span></div>" +
        '<div><div class="dn">' + esc(d.name) + (isLink(d) ? '<span class="extchip">external</span>' : "") + "</div>" +
        '<div class="dm">' + docMeta(d) + "</div></div>" +
        '<span class="sp"></span><span class="chip ' + (d.vis === "officers" ? "late" : "neutral") + '">' +
        (d.vis === "officers" ? "Officers only" : "All members") + "</span>" +
        '<button class="btn ghost sm" data-action="doc-open" data-id="' + d.id + '">Open</button></div>';
    }).join("") : '<div class="empty">Nothing attached yet. Anything you add here also lands in the Vault.</div>';

    return '<div class="sec"><h2>' + label + '</h2><div class="card"><div class="card-h"><h3>' +
      items.length + " in the Vault</h3>" +
      '<div class="cardacts"><button class="btn ghost sm" data-action="add-link"' + attr + '>Link</button>' +
      '<button class="btn sm" data-action="upload"' + attr + '>Upload</button></div></div>' +
      '<div class="card-b flush">' + rows + "</div></div></div>";
  }
  function docTag(d) {
    if (!isLink(d)) return d.name.split(".").pop().toUpperCase();
    var h = (d.host || "").toLowerCase();
    return h.indexOf("sheet") > -1 ? "SHEET" : h.indexOf("form") > -1 ? "FORM"
      : h.indexOf("doc") > -1 ? "DOC" : h.indexOf("drive") > -1 ? "DRIVE"
      : h.indexOf("calendar") > -1 ? "CAL" : h.indexOf("slide") > -1 ? "SLIDE" : "LINK";
  }
  function docMeta(d) {
    return isLink(d) ? (d.host || "Link") + " &middot; added " + d.updated + " by " + esc(d.by)
      : d.size + " &middot; updated " + d.updated + " by " + esc(d.by);
  }
  function myName() { var m = member(ME); return m ? full(m) : "A brother"; }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
  function upcoming() { return db.events.filter(function (e) { return !isPast(e); }).sort(byDate); }
  function openBills(mid) {
    return db.bills.filter(function (b) { return paidBy(mid, b.id) < b.amount; }).sort(function (x, y) {
      return x.due < y.due ? -1 : x.due > y.due ? 1 : 0;
    });
  }
  function isOfficer(m) { return m && m.roles[0] !== "Member"; }
  function officers() { return actives().filter(isOfficer); }
  function avColor(m) { var h = 0, s = (m ? m.id + m.last : "x"); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return "hsl(" + h + " 30% 40%)"; }
  function photoSrc(m) {
    if (!m || !m.photo) return null;
    var idx = Number(String(m.id).replace("m", "")) || 1;
    if (m.id === ME && m.photoVariant) return "img/a" + m.photoVariant + ".jpg";
    return "img/p" + idx + ".jpg";
  }
  function av(m, size, extra) {
    var sz = size ? ";width:" + size + "px;height:" + size + "px" + (size > 40 ? ";font-size:" + Math.round(size / 3) + "px" : "") : "";
    var src = photoSrc(m);
    if (src) return '<span class="av ph" style="background:var(--surface-3)' + sz + '"' + (extra || "") +
      '><img src="' + src + '" alt="' + esc(full(m)) + '" loading="lazy"></span>';
    return '<span class="av" style="background:' + avColor(m) + sz + '"' + (extra || "") + ">" + initials(m) + "</span>";
  }
  function dLabel(iso) { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  function dShort(iso) { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function daysLate(iso) { return Math.floor((TODAY - new Date(iso + "T12:00:00")) / 86400000); }
  function catOf(k) { return db.cats[k] || { label: k, color: "#6E7781" }; }
  function catChip(k) { var c = catOf(k); return '<span class="cat" style="background:' + c.color + '">' + esc(c.label) + "</span>"; }
  function bdayLabel(b) { return new Date("2026-" + b + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" }); }
  function bdayMonth(b) { return Number(b.split("-")[0]); }

  function paidBy(mid, bid) { return db.payments.reduce(function (s, p) { return s + (p.memberId === mid && p.billId === bid ? p.amount : 0); }, 0); }
  function balanceOf(mid) {
    var m = member(mid); if (!m || m.status !== "active") return 0;
    return db.bills.reduce(function (s, b) { return s + Math.max(0, b.amount - paidBy(mid, b.id)); }, 0);
  }
  function isFin(mid) { return balanceOf(mid) <= 0; }
  function assessed() { return db.bills.reduce(function (s, b) { return s + b.amount * actives().length; }, 0); }
  function collected() { return db.payments.reduce(function (s, p) { return s + p.amount; }, 0); }
  function outstanding() { return actives().reduce(function (s, m) { return s + balanceOf(m.id); }, 0); }
  function pastDue() {
    var late = db.bills.filter(function (b) { return daysLate(b.due) > 0; });
    return actives().filter(function (m) { return late.some(function (b) { return paidBy(m.id, b.id) < b.amount; }); });
  }
  function feesPaid() { return db.payments.reduce(function (s, p) { return s + (p.method === "ach" ? achFee(p.amount) : p.method === "card" ? cardFee(p.amount) : 0); }, 0); }

  function pastEvents() { return db.events.filter(isPast).sort(byDate).reverse(); }
  function mandatoryPast() { return pastEvents().filter(function (e) { return e.mandatory; }); }
  function attRate(mid) {
    var mp = mandatoryPast(); if (!mp.length) return 1;
    var hit = mp.filter(function (e) {
      return e.checkedIn.indexOf(mid) > -1 || db.excuses.some(function (x) { return x.memberId === mid && x.eventId === e.id && x.status === "approved"; });
    }).length;
    return hit / mp.length;
  }
  function chapterAttRate() { var a = actives(); return a.length ? a.reduce(function (s, m) { return s + attRate(m.id); }, 0) / a.length : 0; }
  function serviceHours(mid) { return db.service.filter(function (s) { return s.memberId === mid && s.status === "approved"; }).reduce(function (t, s) { return t + s.hours; }, 0); }
  function eventsAttended(mid) { return pastEvents().filter(function (e) { return e.checkedIn.indexOf(mid) > -1; }); }
  function totalHours(mid) { return serviceHours(mid); }
  function pendingService() { return db.service.filter(function (s) { return s.status === "pending"; }); }
  function totalService() { return actives().reduce(function (s, m) { return s + totalHours(m.id); }, 0); }
  function committeesOf(mid) {
    var m = member(mid);
    return (m && m.committees ? m.committees : []).map(function (c) { return { k: kom(c.id), role: c.role }; }).filter(function (x) { return x.k; });
  }
  function unread() { return db.notes.filter(function (n) { return !n.read; }).length; }
  function bdaysThisMonth() { return actives().filter(function (m) { return bdayMonth(m.bday) === 10; }).sort(function (a, b) { return a.bday.localeCompare(b.bday); }); }

  /* ------------------------------------------------------------- qr */
  function qrMarkup(text) {
    try { var q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
    catch (e) {
      var n = 25, h = 0, i, j, out = "";
      for (i = 0; i < text.length; i++) h = (h * 131 + text.charCodeAt(i)) >>> 0;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
        var fin = (i < 7 && j < 7) || (i < 7 && j > n - 8) || (i > n - 8 && j < 7);
        var edge = fin && (i % 6 === 0 || j % 6 === 0 || (i > 1 && i < 5 && j > 1 && j < 5) || (i > n - 6 && i < n - 2 && j > 1 && j < 5) || (i > 1 && i < 5 && j > n - 6 && j < n - 2));
        if (fin ? edge : ((((h >> ((i * 7 + j * 3) % 29)) ^ (i * j)) & 3) === 0)) out += '<rect x="' + j + '" y="' + i + '" width="1" height="1" fill="#000"/>';
      }
      return '<svg viewBox="0 0 ' + n + " " + n + '" xmlns="http://www.w3.org/2000/svg"><rect width="' + n + '" height="' + n + '" fill="#fff"/>' + out + "</svg>";
    }
  }
  function qrBlock(url, cap) { return '<div class="qrwrap"><div class="qrbox">' + qrMarkup(url) + '</div><p class="qrcap">' + esc(cap || url) + "</p></div>"; }
  function linkBlock(url, label) {
    return '<div class="field"><label>' + esc(label || "Payment link") + "</label>" +
      '<div class="linkbox"><code>' + esc(url) + '</code><button class="btn sm ghost" data-action="copy" data-v="' + esc(url) + '">Copy</button></div>' +
      '<p class="hint">Anyone with this link can pay. No account, no app download, no login.</p></div>';
  }

  /* ---------------------------------------------------------- icons */
  var ICON = {
    bell: '<path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.5 4.5-1.5 4.5h12s-1.5-1-1.5-4.5A4.5 4.5 0 0 0 10 3Z"/><path d="M8.3 15a1.9 1.9 0 0 0 3.4 0"/>',
    chat: '<path d="M16.5 11.5a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 3V5A1.5 1.5 0 0 1 5 3.5h10A1.5 1.5 0 0 1 16.5 5Z"/>',
    pay: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M2.5 8.5h15"/>',
    cal: '<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4"/>',
    vault: '<path d="M3 6.2A1.7 1.7 0 0 1 4.7 4.5h3L9.2 6.4h6.1A1.7 1.7 0 0 1 17 8.1v6.2a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 14.3Z"/>',
    doc: '<path d="M5 3.2h6l4 4v9.6H5Z"/><path d="M11 3.2v4h4"/>',
    money: '<circle cx="10" cy="10" r="7"/><path d="M10 6.3v7.4M12 8.2a2 2 0 0 0-2-.9c-1.1 0-1.8.6-1.8 1.4 0 2 3.8 1.1 3.8 3.1 0 .9-.8 1.5-2 1.5a2.2 2.2 0 0 1-2-1"/>',
    more: '<circle cx="4.5" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="15.5" cy="10" r="1.3"/>',
    cake: '<path d="M3.5 16.5h13V11H3.5Z"/><path d="M3.5 11c1.1 1.2 2.2 1.2 3.3 0s2.2-1.2 3.2 0 2.2 1.2 3.3 0 2.2-1.2 3.2 0M10 4v3"/>'
  };
  function icon(n, s) { return '<svg viewBox="0 0 20 20" width="' + (s || 20) + '" height="' + (s || 20) + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[n] || "") + "</svg>"; }

  /* ------------------------------------------------------------ nav */
  var NAV = [
    { g: "Overview" },
    { id: "home", label: "Home", roles: ["president", "vicepresident", "treasurer", "secretary", "strategus", "chair"] },
    { g: "People" },
    { id: "members", label: "Roster", roles: ["president", "vicepresident", "treasurer", "secretary", "strategus", "chair"] },
    { id: "committees", label: "Committees", roles: ["president", "vicepresident", "treasurer", "secretary", "chair"] },
    { id: "attendance", label: "Attendance", roles: ["president", "vicepresident", "secretary", "strategus"] },
    { g: "Money" },
    { id: "dues", label: "Dues & Payments", roles: ["president", "treasurer"] },
    { id: "requests", label: "Payment Requests", roles: ["president", "treasurer"] },
    { id: "budget", label: "Budget", roles: ["president", "treasurer", "chair"] },
    { g: "Program" },
    { id: "calendar", label: "Calendar", roles: ["president", "vicepresident", "treasurer", "secretary", "strategus", "chair"] },
    { id: "events", label: "Events", roles: ["president", "vicepresident", "treasurer", "secretary", "strategus", "chair"] },
    { id: "service", label: "Service Hours", roles: ["president", "vicepresident", "secretary", "strategus", "chair"] },
    { g: "Records" },
    { id: "minutes", label: "Minutes & Votes", roles: ["president", "vicepresident", "secretary"] },
    { id: "vault", label: "Vault", roles: ["president", "vicepresident", "treasurer", "secretary", "strategus", "chair"] },
    { g: "Communicate" },
    { id: "messages", label: "Messages", roles: ["president", "vicepresident", "treasurer", "secretary", "strategus", "chair"] },
    { g: "Admin" },
    { id: "settings", label: "Settings", roles: ["president"] }
  ];
  function can(v) { for (var i = 0; i < NAV.length; i++) if (NAV[i].id === v) return NAV[i].roles.indexOf(state.role) > -1; return false; }

  /* An office is not a menu. These are the acts a chapter constitution reserves,
     so the dispatcher refuses them too, not just the sidebar. Anything absent
     here is open to every officer. */
  var ACT_ROLES = {
    "approve":             ["president", "vicepresident"],
    "start-ballot":        ["president"],
    "new-bill":            ["president", "treasurer"],
    "create-bill":         ["president", "treasurer"],
    "new-request":         ["president", "treasurer"],
    "record-payment":      ["president", "treasurer"],
    "chase":               ["president", "treasurer"],
    "new-announcement":    ["president", "vicepresident", "secretary"],
    "invite":              ["president", "vicepresident"],
    "new-event":           ["president", "vicepresident", "strategus", "chair"],
    "approve-service":     ["president", "vicepresident", "secretary", "strategus"],
    "approve-all-service": ["president", "vicepresident", "secretary", "strategus"],
    "approve-minutes":     ["president", "vicepresident", "secretary"],
    "upload-minutes":      ["president", "vicepresident", "secretary"]
  };
  var ROLE_TITLE = {
    president: "the Polemarch", vicepresident: "the Vice Polemarch", treasurer: "the Keeper of Exchequer",
    secretary: "the Keeper of Records", strategus: "the Strategus", chair: "a committee chair", member: "a member"
  };
  function mayDo(a) {
    var r = ACT_ROLES[a];
    return !r || r.indexOf(state.role) > -1;
  }
  function whoMay(a) {
    var r = ACT_ROLES[a] || [];
    return r.map(function (x) { return ROLE_TITLE[x]; }).join(" or ");
  }
  function refuse(a) {
    toast("That is not your office", "Only " + whoMay(a) + " can do this");
  }

  function toast(main, sub) {
    var t = $("#ticker"), el = document.createElement("div");
    el.className = "tmsg";
    el.innerHTML = '<span class="tarrow">&rarr;</span><span>' + esc(main) + (sub ? ' <span style="opacity:.7;font-weight:500">' + esc(sub) + "</span>" : "") + "</span>";
    t.prepend(el);
    while (t.children.length > 3) t.removeChild(t.lastChild);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 6500);
  }
  function logA(t) { db.activity.unshift({ t: t, at: "Just now" }); if (db.activity.length > 9) db.activity.pop(); }
  function notify(ic, title, body) { db.notes.unshift({ id: uid("n"), icon: ic, title: title, body: body, when: "Just now", read: false }); }

  /* ====================================================== DASHBOARD */
  function renderSide() {
    var counts = {
      members: pendings().length, dues: pastDue().length,
      service: pendingService().length, requests: db.requests.filter(function (r) { return !r.pushed; }).length,
      attendance: db.excuses.filter(function (x) { return x.status === "pending"; }).length
    };
    var html = '<div class="chapcard"><div class="cname">' + esc(db.chapter.name) + "</div>" +
      '<div class="cmeta">' + esc(db.chapter.org) + "<br>" + esc(db.chapter.district) + '</div><div class="chapstripe"></div></div>';
    NAV.forEach(function (n) {
      if (n.g) { html += '<div class="navgroup">' + n.g + "</div>"; return; }
      if (n.roles.indexOf(state.role) < 0) return;
      var c = counts[n.id];
      html += '<button class="navitem' + (state.view === n.id ? " on" : "") + '" data-action="view" data-view="' + n.id + '"><span>' + n.label + "</span>" +
        (c ? '<span class="pill">' + c + "</span>" : "") + "</button>";
    });
    html += '<div class="sidefoot"><b>Private chapter</b>Not listed. Not searchable. Invite only.</div>';
    $("#sideNav").innerHTML = html;
  }

  function viewHome() {
    var pend = pendings(), late = pastDue(), out = outstanding(), coll = collected();
    var att = Math.round(chapterAttRate() * 100), canMoney = can("dues");

    var q = '<button class="qcard' + (pend.length ? " warn" : " ok") + '" data-action="view" data-view="members" data-filter="pending">' +
      '<div class="qt">Waiting on approval</div><div class="qv">' + pend.length + '</div><div class="qd">' + (pend.length ? "Longest waiting " + Math.max.apply(null, pend.map(function (m) { return parseInt(m.requested, 10) || 0; })) + " days" : "All clear") + "</div></button>" +
      (canMoney ?
        '<button class="qcard' + (late.length ? " alert" : " ok") + '" data-action="view" data-view="dues">' +
        '<div class="qt">Not financial</div><div class="qv">' + late.length + '</div><div class="qd">' + (late.length ? "brothers behind on dues" : "every brother is current") + "</div></button>" : "") +
      '<button class="qcard" data-action="view" data-view="attendance">' +
      '<div class="qt">Meeting attendance</div><div class="qv">' + att + '%</div><div class="qd">' + mandatoryPast().length + " mandatory meetings</div></button>" +
      '<button class="qcard" data-action="view" data-view="service">' +
      '<div class="qt">Service hours YTD</div><div class="qv">' + totalService() + '</div><div class="qd">' +
      db.service.filter(function (s) { return s.status === "pending"; }).length + " awaiting approval</div></button>";

    var pendRows = pend.length ? pend.map(function (m) {
      return "<tr><td><div class=\"who\">" + av(m) +
        '<span><span class="nm">' + esc(full(m)) + '</span><span class="rl2">Initiated ' + m.initYear + ", " + esc(m.initChapter) + " &middot; vouched by " + esc(m.vouchedBy) + "</span></span></div></td>" +
        '<td class="r"><span class="chip neutral">' + esc(m.requested) + "</span></td>" +
        '<td class="r"><button class="btn ghost sm" data-action="profile" data-id="' + m.id + '">Review</button> ' +
        (mayDo("approve") ? '<button class="btn sm" data-action="approve" data-id="' + m.id + '">Approve</button>' : "") +
        "</td></tr>";
    }).join("") : '<tr><td colspan="3"><div class="empty">Nobody is waiting. The queue is clear.</div></td></tr>';

    var evRows = upcoming().slice(0, 4).map(function (e) {
      var parts = dShort(e.date).split(" ");
      return '<div class="docrow click" role="button" tabindex="0" data-action="open-event" data-id="' + e.id + '">' +
        '<div style="min-width:38px;text-align:center"><div class="num" style="font-weight:700;font-size:15px">' + parts[1] + "</div>" +
        '<div style="font-size:9.5px;color:var(--muted);text-transform:uppercase">' + parts[0] + "</div></div>" +
        '<div><div class="dn">' + esc(e.title) + '</div><div class="dm">' + e.time + " &middot; " + esc(e.place) + "</div>" +
        '<div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">' + catChip(e.cat) +
        (e.mandatory ? '<span class="chip late">Mandatory</span>' : "") + (e.price ? '<span class="chip neutral">' + money0(e.price) + "</span>" : "") + "</div></div>" +
        '<span class="sp"></span><span class="chip neutral">' + e.rsvps.length + " going</span>" +
        '<span class="rowgo">&rsaquo;</span></div>';
    }).join("");

    var openTasks = [];
    db.committees.forEach(function (k) {
      (k.tasks || []).forEach(function (t) { if (!t.done) openTasks.push({ k: k, t: t }); });
    });
    openTasks.sort(function (a, b) { return new Date(a.t.due) - new Date(b.t.due); });
    var myName = full(member(ROLE_MEMBER[state.role]));
    var taskRows = openTasks.length ? openTasks.slice(0, 7).map(function (x) {
      var late = daysLate(x.t.due) > 0, mine = x.t.who === myName;
      return '<div class="taskmini"><button class="tbox" data-action="toggle-task" data-k="' + x.k.id + '" data-t="' + x.t.id + '" aria-label="Mark done"></button>' +
        '<div class="tm-x"><div class="tm-t">' + esc(x.t.t) + (mine ? ' <span class="chip brand">You</span>' : "") + "</div>" +
        '<div class="tm-m">' + esc(x.k.name) + " &middot; " + esc(x.t.who) + "</div></div>" +
        (late ? '<span class="chip late">' + daysLate(x.t.due) + "d late</span>" : '<span class="chip neutral">' + dShort(x.t.due) + "</span>") +
        '<button class="btn ghost sm" data-action="open-committee" data-id="' + x.k.id + '">Open</button></div>';
    }).join("") : '<div class="empty">No open tasks. Every committee is current.</div>';

    var bd = bdaysThisMonth();
    var bdayRows = bd.length ? bd.map(function (m) {
      return '<div class="docrow">' + av(m) +
        '<div><div class="dn">' + esc(full(m)) + '</div><div class="dm">' + bdayLabel(m.bday) + " &middot; " + esc(m.jobTitle) + "</div></div>" +
        '<span class="sp"></span><button class="btn ghost sm" data-action="birthday" data-id="' + m.id + '">Send a note</button></div>';
    }).join("") : '<div class="empty">No birthdays this month.</div>';

    var meNow = member(ROLE_MEMBER[state.role]);
    var QA = [
      ["new-bill", "money", "Collect money", "Dues, assessments, tickets"],
      ["new-announcement", "bell", "Post an announcement", "Reaches every phone"],
      ["new-event", "cal", "Create an event", "Tagged, ticketed, QR check-in"],
      ["invite", "people", "Invite a brother", "Single-use link"],
      ["upload", "doc", "Add to the Vault", "With a visibility rule"],
      ["start-ballot", "vault", "Call a vote", "Financial brothers only"]
    ].filter(function (a) { return mayDo(a[0]); });
    var qa = '<div class="qa-grid">' + QA.map(function (a) {
      return '<button class="qa" data-action="' + a[0] + '"><span class="qa-i">' + icon(a[1], 17) + "</span>" +
        '<span class="qa-x"><span class="qa-t">' + a[2] + '</span><span class="qa-d">' + a[3] + "</span></span>" +
        '<span class="qa-arrow">&#8599;</span></button>';
    }).join("") + "</div>";

    return '<div class="dhead"><div><h1>Good evening, ' + esc(meNow.first) + "</h1>" +
      '<p class="sub">' + TODAY.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + ' &middot; ' + actives().length + " active brothers &middot; " + officers().length +
      " officers &middot; " + db.committees.length + " standing committees &middot; chartered " + db.chapter.founded + "</p></div></div>" +
      qa + '<div class="queue">' + q + "</div>" +
      '<div class="two3"><div class="sec"><h2>Membership queue</h2><div class="card"><div class="card-b flush"><div class="tw"><table>' +
      '<thead><tr><th>Candidate</th><th class="r">Waiting</th><th class="r"></th></tr></thead><tbody>' + pendRows + "</tbody></table></div></div></div>" +
      '<h2 style="margin-top:20px">Coming up</h2><div class="card"><div class="card-b flush">' + evRows + "</div></div></div>" +
      '<div class="sec"><h2>Open tasks</h2><div class="card"><div class="card-h"><h3>' + openTasks.length +
      ' across ' + db.committees.filter(function (k) { return (k.tasks || []).some(function (t) { return !t.done; }); }).length +
      ' committees</h3><button class="btn ghost sm" data-action="view" data-view="committees">All committees</button></div>' +
      '<div class="card-b flush">' + taskRows + "</div></div>" +
      '<h2 style="margin-top:20px">Birthdays this month</h2><div class="card"><div class="card-b flush">' + bdayRows + "</div></div></div></div>";
  }

  function viewMembers() {
    var q = state.search.toLowerCase();
    var list = db.members.filter(function (m) {
      if (state.filter === "pending") return m.status === "pending";
      if (m.status !== "active") return false;
      if (state.filter === "officers") return isOfficer(m);
      if (state.filter === "owing") return balanceOf(m.id) > 0;
      if (state.filter === "financial") return isFin(m.id);
      if (state.filter === "risk") return attRate(m.id) < 0.7;
      if (state.filter === "life") return m.lifeMember;
      return true;
    }).filter(function (m) {
      return !q || (full(m) + " " + m.roles.join(" ") + " " + m.employer + " " + m.jobTitle + " " + m.industry + " " + m.city + " " + m.lineName).toLowerCase().indexOf(q) > -1;
    });
    var dir = state.sortDir || 1;
    list.sort(function (a, b) {
      var A, B;
      switch (state.sort) {
        case "office": A = isOfficer(a) ? a.roles[0] : "zz"; B = isOfficer(b) ? b.roles[0] : "zz"; break;
        case "init": A = a.initYear; B = b.initYear; break;
        case "standing": A = balanceOf(a.id); B = balanceOf(b.id); break;
        case "att": A = attRate(a.id); B = attRate(b.id); break;
        default: A = a.last + a.first; B = b.last + b.first;
      }
      return (A < B ? -1 : A > B ? 1 : 0) * dir;
    });
    var sel = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
    var canMoney = can("dues");

    var rows = list.length ? list.map(function (m) {
      var bal = balanceOf(m.id), a = Math.round(attRate(m.id) * 100);
      var standing = m.status === "pending"
        ? '<td colspan="2"><span class="chip due">Awaiting ' + esc(m.requested) + "</span></td>"
        : "<td>" + (bal <= 0 ? '<span class="chip paid">Financial</span>' : '<span class="chip late">Not financial</span>') + "</td>" +
          '<td><div style="display:flex;align-items:center;gap:6px"><span class="meter"><i class="' + (a >= 80 ? "hi" : a < 60 ? "lo" : "") +
          '" style="width:' + a + '%"></i></span><span class="num" style="font-size:11px">' + a + "%</span></div></td>";
      return '<tr class="rowlink" data-action="profile" data-id="' + m.id + '"><td style="width:28px"><input type="checkbox" data-action="select" data-id="' + m.id + '"' +
        (state.selected[m.id] ? " checked" : "") + ' aria-label="Select ' + esc(full(m)) + '"></td>' +
        '<td><div class="who">' + av(m) +
        '<span><span class="nm">' + esc(full(m)) + (m.lifeMember ? ' <span class="chip brand">Life</span>' : "") + "</span>" +
        '<span class="rl2">' + esc(m.jobTitle) + " &middot; " + esc(m.employer) + "</span></span></div></td>" +
        "<td>" + m.roles.map(function (r) { return '<span class="chip ' + (r === "Member" ? "neutral" : "brand") + '">' + esc(r) + "</span>"; }).join(" ") + "</td>" +
        '<td><span class="num" style="font-size:11.5px">' + m.initYear + '</span><div style="font-size:10px;color:var(--muted)">' + esc(m.initChapter) + " &middot; #" + m.lineNum + "</div></td>" +
        standing + '<td class="r" style="color:var(--muted)">&rsaquo;</td></tr>';
    }).join("") : '<tr><td colspan="7"><div class="empty">No brothers match that search.</div></td></tr>';

    function fcount(k) {
      if (k === "pending") return pendings().length;
      var a = actives();
      if (k === "officers") return a.filter(isOfficer).length;
      if (k === "owing") return a.filter(function (m) { return balanceOf(m.id) > 0; }).length;
      if (k === "financial") return a.filter(function (m) { return isFin(m.id); }).length;
      if (k === "risk") return a.filter(function (m) { return attRate(m.id) < 0.7; }).length;
      if (k === "life") return a.filter(function (m) { return m.lifeMember; }).length;
      return a.length;
    }
    var fl = [["all", "All active"], ["officers", "Officers"], ["owing", "Not financial"], ["financial", "Financial"],
      ["risk", "Attendance risk"], ["life", "Life members"], ["pending", "Pending"]];

    return '<div class="dhead"><div><h1>Roster</h1><p class="sub">' + actives().length + " active &middot; " + pendings().length +
      " pending &middot; click any row to open his record &middot; searchable by name, employer, industry, city or line name, and by nobody outside this chapter</p></div>" +
      '<div class="dactions"><button class="btn ghost" data-action="export">Export</button>' +
      '<button class="btn ghost" data-action="directory">Career directory</button>' +
      '<button class="btn" data-action="invite">Invite a brother</button></div></div>' +
      '<div class="toolbar"><div class="search"><input type="text" id="memberSearch" placeholder="Search name, employer, industry, city, line name" value="' + esc(state.search) + '"></div>' +
      '<div class="filters">' + fl.map(function (f) {
        return '<button class="fbtn' + (state.filter === f[0] ? " on" : "") + '" data-action="filter" data-f="' + f[0] + '">' +
          f[1] + '<span class="fct">' + fcount(f[0]) + "</span></button>";
      }).join("") + "</div></div>" +
      (sel.length ? '<div class="bulkbar"><span>' + sel.length + ' selected</span><span class="sp"></span>' +
        '<button class="btn sm" data-action="bulk-message">Message</button>' +
        (canMoney ? '<button class="btn sm ghost" data-action="bulk-remind">Send payment link</button>' : "") +
        '<button class="btn sm ghost" data-action="bulk-committee">Add to committee</button>' +
        '<button class="btn sm ghost" data-action="export">Export</button>' +
        '<button class="btn sm ghost" data-action="clear-sel">Clear</button></div>' : "") +
      '<div class="card"><div class="card-b flush"><div class="tw"><table><thead><tr><th></th>' +
      [["name", "Brother"], ["office", "Office"], ["init", "Initiated"], ["standing", "Standing"], ["att", "Attendance"]].map(function (h) {
        var on = state.sort === h[0];
        return '<th class="sortable' + (on ? " on" : "") + '" data-action="sort" data-s="' + h[0] + '">' + h[1] +
          '<span class="caret">' + (on ? (state.sortDir < 0 ? "\u25B2" : "\u25BC") : "\u25BE") + "</span></th>";
      }).join("") + '<th class="r"></th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div></div></div>";
  }

  function viewCommittees() {
    var cards = db.committees.map(function (k) {
      var ch = member(k.chair), c = catOf(k.cat);
      var mem = k.members.map(function (nm) { return db.members.filter(function (m) { return full(m) === nm; })[0]; }).filter(Boolean);
      var pct = k.budget ? Math.round((k.spent / k.budget) * 100) : 0;
      return '<div class="kcard"><div class="ktop" style="background:' + c.color + '"></div><div class="kb">' +
        "<h3>" + esc(k.name) + "</h3>" +
        '<div class="kch">Chair: ' + esc(full(ch)) + " &middot; meets " + esc(k.meets) + "</div>" +
        '<p class="kc">' + esc(k.charge) + "</p>" +
        '<div class="kstat"><span>Members<b>' + (mem.length + 1) + "</b></span>" +
        (k.budget ? "<span>Budget<b>" + money0(k.budget) + "</b></span><span>Spent<b>" + money0(k.spent) + "</b></span>" : "<span>Budget<b>&mdash;</b></span>") +
        '<span>Next<b style="font-size:12px">' + dShort(k.next) + "</b></span></div>" +
        (k.budget ? '<div class="meter" style="margin-bottom:11px"><i class="' + (pct > 90 ? "lo" : "hi") + '" style="width:' + Math.min(100, pct) + '%"></i></div>' : "") +
        '<div style="display:flex;align-items:center;gap:9px"><div class="avstack">' +
        [ch].concat(mem).slice(0, 6).map(function (m) { return av(m, 0, ' title="' + esc(full(m)) + '"'); }).join("") +
        '</div><span style="flex:1"></span><button class="btn ghost sm" data-action="open-committee" data-id="' + k.id + '">Open committee</button></div></div></div>';
    }).join("");
    var un = actives().filter(function (m) { return !m.committees.length; });
    return '<div class="dhead"><div><h1>Committees</h1><p class="sub">' + db.committees.length + " standing committees &middot; " + un.length +
      " brothers not yet on one &middot; every committee has its own private channel, budget line and roster</p></div>" +
      '<div class="dactions"><button class="btn ghost" data-action="committee-report">Committee report</button><button class="btn" data-action="new-committee">New committee</button></div></div>' +
      '<div class="kgrid">' + cards + "</div>" +
      (un.length ? '<div class="sec" style="margin-top:20px"><h2>Not on a committee</h2><div class="card"><div class="card-b">' +
        '<p style="font-size:12.5px;color:var(--ink-2);margin-bottom:11px">A brother on a committee is a brother who stays financial. These ' + un.length + " have no assignment.</p>" +
        '<div style="display:flex;gap:7px;flex-wrap:wrap">' + un.map(function (m) {
          return '<button class="btn ghost sm" data-action="assign" data-id="' + m.id + '">' + av(m, 18) + esc(full(m)) + "</button>";
        }).join("") + "</div></div></div></div>" : "");
  }

  function attStatus(mid, e) {
    if (e.checkedIn.indexOf(mid) > -1) return "present";
    if (db.excuses.some(function (x) { return x.memberId === mid && x.eventId === e.id && x.status === "approved"; })) return "excused";
    return "absent";
  }
  function viewAttendance() {
    if (state.attEvent) return viewAttendanceEvent();
    var all = pastEvents().slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var pendingX = db.excuses.filter(function (x) { return x.status === "pending"; });

    var cards = all.map(function (e) {
      var tot = actives().length;
      var pres = actives().filter(function (m) { return attStatus(m.id, e) === "present"; }).length;
      var exc = actives().filter(function (m) { return attStatus(m.id, e) === "excused"; }).length;
      var abs = tot - pres - exc;
      var pct = Math.round((pres / tot) * 100);
      return '<button class="evattcard" data-action="att-event" data-id="' + e.id + '">' +
        '<div class="ea-d">' + dLabel(e.date) + " &middot; " + e.time + "</div>" +
        '<div class="ea-t">' + esc(e.title) + "</div>" +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' + catChip(e.cat) +
        (e.mandatory ? '<span class="chip late">Mandatory</span>' : '<span class="chip neutral">Optional</span>') + "</div>" +
        '<div class="ea-bar"><i style="width:' + (pres / tot * 100) + '%;background:var(--paid)"></i>' +
        '<i style="width:' + (exc / tot * 100) + '%;background:var(--due)"></i>' +
        '<i style="width:' + (abs / tot * 100) + '%;background:var(--line-2)"></i></div>' +
        '<div class="ea-n"><span><b>' + pres + "</b>present</span><span><b>" + exc + "</b>excused</span>" +
        "<span><b>" + abs + "</b>absent</span><span><b>" + pct + "%</b>turnout</span></div></button>";
    }).join("");

    var worst = actives().slice().sort(function (a, b) { return attRate(a.id) - attRate(b.id); }).slice(0, 6);
    var worstRows = worst.map(function (m) {
      var a = Math.round(attRate(m.id) * 100);
      return '<div class="rowbtn" role="button" tabindex="0" data-action="profile" data-id="' + m.id + '">' + av(m, 30) +
        '<div class="rb-x"><div class="rb-t">' + esc(full(m)) + '</div><div class="rb-m">' +
        eventsAttended(m.id).length + " of " + pastEvents().length + " attended</div></div>" +
        '<span class="chip ' + (a >= 80 ? "paid" : a < 60 ? "late" : "due") + '">' + a + "%</span>" +
        '<span class="rb-go">&rsaquo;</span></div>';
    }).join("");

    var xrows = db.excuses.map(function (x) {
      var m = member(x.memberId), e = ev(x.eventId);
      return '<tr><td><button class="btn ghost sm" data-action="profile" data-id="' + m.id + '" style="padding:2px 6px">' +
        esc(full(m)) + "</button></td>" +
        "<td>" + esc(e ? e.title : "\u2014") + '</td><td style="max-width:300px">' + esc(x.reason) + "</td>" +
        "<td>" + (x.status === "approved" ? '<span class="chip paid">Approved</span>' : x.status === "denied" ? '<span class="chip late">Denied</span>' : '<span class="chip due">Pending</span>') + "</td>" +
        '<td class="r">' + (x.status === "pending"
          ? '<button class="btn sm" data-action="excuse" data-id="' + x.id + '" data-v="approved">Excuse</button> <button class="btn ghost sm" data-action="excuse" data-id="' + x.id + '" data-v="denied">Deny</button>'
          : '<span class="chip neutral">' + esc(x.at) + "</span>") + "</td></tr>";
    }).join("");

    return '<div class="dhead"><div><h1>Attendance</h1><p class="sub">' + Math.round(chapterAttRate() * 100) +
      "% chapter rate across " + mandatoryPast().length + " mandatory meetings &middot; open a meeting to see who was there</p></div>" +
      '<div class="dactions"><button class="btn ghost" data-action="export">Export</button>' +
      '<button class="btn" data-action="checkin-qr">Check-in QR</button></div></div>' +
      (pendingX.length ? '<div class="banner"><b>' + pendingX.length + " excuse request" + (pendingX.length > 1 ? "s" : "") +
        " waiting.</b> An approved excuse protects a brother's standing without marking him present.</div>" : "") +
      '<div class="sec"><h2>Meetings and events</h2><div class="evatt">' + cards + "</div></div>" +
      '<div class="two"><div class="sec"><h2>Lowest attendance</h2><div class="card"><div class="card-b flush">' + worstRows + "</div></div></div>" +
      '<div class="sec"><h2>Excuse requests</h2><div class="card"><div class="card-b flush"><div class="tw"><table>' +
      '<thead><tr><th>Brother</th><th>Meeting</th><th>Reason</th><th>Status</th><th class="r"></th></tr></thead><tbody>' +
      xrows + "</tbody></table></div></div></div></div></div>";
  }

  function viewAttendanceEvent() {
    var e = ev(state.attEvent);
    if (!e) { state.attEvent = null; return viewAttendance(); }
    var groups = { present: [], excused: [], absent: [] };
    actives().forEach(function (m) { groups[attStatus(m.id, e)].push(m); });
    var tot = actives().length;

    function block(key, label, chipClass) {
      var list = groups[key];
      return '<div class="sec"><h2>' + label + " &middot; " + list.length + "</h2><div class=\"card\"><div class=\"card-b flush\">" +
        (list.length ? list.map(function (m) {
          return '<div class="rowbtn" role="button" tabindex="0" data-action="profile" data-id="' + m.id + '">' + av(m, 30) +
            '<div class="rb-x"><div class="rb-t">' + esc(full(m)) + '</div><div class="rb-m">' + esc(m.roles[0]) +
            " &middot; " + Math.round(attRate(m.id) * 100) + "% overall</div></div>" +
            '<span class="chip ' + chipClass + '">' + label.split(" ")[0] + "</span>" +
            (isPast(e) ? '<button class="btn ghost sm" data-action="toggle-checkin" data-id="' + e.id + '" data-m="' + m.id + '">' +
              (key === "present" ? "Undo" : "Mark present") + "</button>" : "") +
            '<span class="rb-go">&rsaquo;</span></div>';
        }).join("") : '<div class="empty">Nobody.</div>') + "</div></div></div>";
    }

    return '<button class="backlink" data-action="att-back">&lsaquo; All meetings</button>' +
      '<div class="dhead"><div><div style="display:flex;gap:5px;margin-bottom:5px">' + catChip(e.cat) +
      (e.mandatory ? '<span class="chip late">Mandatory</span>' : '<span class="chip neutral">Optional</span>') + "</div>" +
      "<h1>" + esc(e.title) + '</h1><p class="sub">' + dLabel(e.date) + " &middot; " + e.time + " &middot; " + esc(e.place) +
      (e.hours ? " &middot; " + e.hours + " service hours credited each" : "") + "</p></div>" +
      '<div class="dactions"><button class="btn ghost" data-action="event-update" data-id="' + e.id + '">Message attendees</button>' +
      '<button class="btn ghost" data-action="share-event" data-id="' + e.id + '">Check-in QR</button>' +
      '<button class="btn" data-action="checkin" data-id="' + e.id + '">Open check-in</button></div></div>' +
      '<div class="statrow">' +
      '<div><div class="sl">Present</div><div class="sv" style="color:var(--paid)">' + groups.present.length + "</div></div>" +
      '<div><div class="sl">Excused</div><div class="sv" style="color:var(--due)">' + groups.excused.length + "</div></div>" +
      '<div><div class="sl">Absent</div><div class="sv" style="color:var(--late)">' + groups.absent.length + "</div></div>" +
      '<div><div class="sl">Turnout</div><div class="sv">' + Math.round(groups.present.length / tot * 100) + "%</div></div>" +
      '<div><div class="sl">Service hours</div><div class="sv">' + (groups.present.length * (e.hours || 0)) + "</div></div></div>" +
      '<div class="two3"><div>' + block("absent", "Absent", "late") + block("excused", "Excused", "due") + "</div>" +
      "<div>" + block("present", "Present", "paid") + "</div></div>";
  }

  function viewDues() {
    var coll = collected(), ass = assessed(), out = outstanding();
    var pct = ass ? Math.round((coll / ass) * 100) : 0;
    var fin = actives().filter(function (m) { return isFin(m.id); }).length;
    var billCards = '<div class="billgrid">' + db.bills.map(function (b) {
      var n = actives().length;
      var paid = actives().filter(function (m) { return paidBy(m.id, b.id) >= b.amount; }).length;
      var got = db.payments.reduce(function (s, p) { return s + (p.billId === b.id ? p.amount : 0); }, 0);
      var late = daysLate(b.due) > 0, gpct = (got / (b.amount * n)) * 100;
      return '<div class="billcard"><div class="bc-t">' + esc(b.title) + "</div>" +
        '<div class="bc-m">' + money(b.amount) + " each &middot; due " + dShort(b.due) +
        (late ? ' &middot; <span style="color:var(--late);font-weight:700">' + daysLate(b.due) + "d late</span>" : "") + "</div>" +
        '<div class="bc-amt">' + money0(got) + '</div><div class="bc-sub">of ' + money0(b.amount * n) + " assessed</div>" +
        '<div class="meter"><i class="' + (gpct > 75 ? "hi" : gpct < 40 ? "lo" : "") + '" style="width:' + gpct + '%"></i></div>' +
        '<div class="bc-sub">' + paid + " of " + n + " paid &middot; " + money0(b.amount * n - got) + " out</div>" +
        '<div class="bc-go"><button class="btn sm ghost" data-action="share-bill" data-id="' + b.id + '">Link</button>' +
        '<button class="btn sm" data-action="unpaid-list" data-id="' + b.id + '">' + (n - paid) + " unpaid</button></div></div>";
    }).join("") + "</div>";

    var owing = actives().filter(function (m) { return balanceOf(m.id) > 0; }).sort(function (a, b) { return balanceOf(b.id) - balanceOf(a.id); });
    var owingRows = owing.length ? owing.map(function (m) {
      var oldest = db.bills.filter(function (b) { return paidBy(m.id, b.id) < b.amount; }).sort(function (a, b) { return new Date(a.due) - new Date(b.due); })[0];
      var dl = daysLate(oldest.due);
      return '<tr><td><div class="who">' + av(m) + '<span class="nm">' + esc(full(m)) + "</span></div></td>" +
        "<td>" + esc(oldest.title) + "</td><td>" + (dl > 0 ? '<span class="chip late">' + dl + " days late</span>" : '<span class="chip due">due ' + dShort(oldest.due) + "</span>") + "</td>" +
        '<td class="money-c r">' + money(balanceOf(m.id)) + "</td>" +
        '<td class="r"><button class="btn ghost sm" data-action="share-bill" data-id="' + oldest.id + '" data-member="' + m.id + '">Send link</button> ' +
        '<button class="btn ghost sm" data-action="record-payment" data-id="' + m.id + '">Record</button></td></tr>';
    }).join("") : '<tr><td colspan="5"><div class="empty">Every active brother is financial.</div></td></tr>';

    var recent = db.payments.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 9).map(function (p) {
      var m = member(p.memberId), b = bill(p.billId);
      var fee = p.method === "ach" ? achFee(p.amount) : p.method === "card" ? cardFee(p.amount) : 0;
      return '<tr><td><div class="who">' + av(m) +
        '<span><span class="nm">' + esc(full(m)) + '</span><span class="rl2">' + esc(b ? b.title : "Event ticket") + "</span></span></div></td>" +
        '<td><span class="chip neutral">' + (p.method === "ach" ? "Bank" : p.method === "card" ? "Card" : "Check") + "</span></td>" +
        '<td class="money-c">' + dShort(p.date) + '</td><td class="money-c r" style="color:var(--muted)">' + (fee ? "-" + money(fee) : "—") + "</td>" +
        '<td class="money-c r">' + money(p.amount) + "</td></tr>";
    }).join("");

    return '<div class="dhead"><div><h1>Dues &amp; Payments</h1><p class="sub">Visible to the Polemarch, Keeper of Exchequer and Assistant Keeper of Exchequer only</p></div>' +
      '<div class="dactions"><button class="btn ghost" data-action="export">Export ledger</button><button class="btn" data-action="new-bill">Bill the chapter</button></div></div>' +
      '<div class="card" style="margin-bottom:20px"><div class="money">' +
      '<div><div class="lab">Collected 2026&ndash;27</div><div class="big">' + money0(coll) + '</div><div class="note">' + pct + "% of " + money0(ass) + " assessed</div></div>" +
      '<div><div class="lab">Outstanding</div><div class="big" style="color:var(--late)">' + money0(out) + '</div><div class="note">' + owing.length + " brothers &middot; " + pastDue().length + " past due</div></div>" +
      '<div><div class="lab">Processing fees paid</div><div class="big">' + money0(feesPaid()) + '</div><div class="note">' + (feesPaid() / coll * 100).toFixed(1) + "% of collections</div></div>" +
      '<div><div class="lab">Financial rate</div><div class="big">' + Math.round(fin / actives().length * 100) + '%</div><div class="note">' + fin + " of " + actives().length + " brothers</div></div></div>" +
      '<div class="bar"><i class="p" style="width:' + pct + '%"></i><i class="d" style="width:' + (100 - pct) + '%"></i></div>' +
      '<div class="barkey"><span><em style="background:var(--paid)"></em>Collected</span><span><em style="background:var(--due)"></em>Outstanding</span></div></div>' +
      '<div class="sec"><h2>Bills</h2>' + billCards + "</div>" +
      '<div class="sec"><h2>Who owes what</h2><div class="card"><div class="card-b flush"><div class="tw"><table>' +
      '<thead><tr><th>Brother</th><th>Oldest unpaid</th><th>Status</th><th class="r">Balance</th><th class="r"></th></tr></thead><tbody>' + owingRows + "</tbody></table></div></div></div></div>" +
      '<div class="sec"><h2>Recent payments</h2><div class="card"><div class="card-b flush"><div class="tw"><table>' +
      '<thead><tr><th>Brother</th><th>Method</th><th>Date</th><th class="r">Fee</th><th class="r">Amount</th></tr></thead><tbody>' + recent + "</tbody></table></div></div></div></div>";
  }

  function viewBudget() {
    var inc = db.budget.filter(function (b) { return b.cat === "Income"; });
    var exp = db.budget.filter(function (b) { return b.cat === "Expense"; });
    var ip = inc.reduce(function (s, b) { return s + b.planned; }, 0), ia = inc.reduce(function (s, b) { return s + b.actual; }, 0);
    var ep = exp.reduce(function (s, b) { return s + b.planned; }, 0), ea = exp.reduce(function (s, b) { return s + b.actual; }, 0);
    function rows(set) {
      return set.map(function (b) {
        var pct = b.planned ? Math.round((b.actual / b.planned) * 100) : 0;
        var idx = db.budget.indexOf(b);
        if (state.budgetEdit) {
          return '<tr><td><input class="bedit" style="width:100%;text-align:left" value="' + esc(b.line) + '" data-action="bline" data-i="' + idx + '"></td>' +
            '<td class="r"><input class="bedit" type="number" value="' + b.planned + '" data-action="bplanned" data-i="' + idx + '"></td>' +
            '<td class="r"><input class="bedit" type="number" value="' + b.actual + '" data-action="bactual" data-i="' + idx + '"></td>' +
            '<td class="r"><button class="delbtn" data-action="bdel" data-i="' + idx + '">&times;</button></td><td></td></tr>';
        }
        return '<tr><td style="font-weight:600">' + esc(b.line) + '</td><td class="money-c r">' + money0(b.planned) + '</td><td class="money-c r">' + money0(b.actual) + "</td>" +
          '<td class="money-c r" style="color:' + (b.actual >= b.planned ? "var(--paid)" : "var(--muted)") + '">' + money0(b.planned - b.actual) + "</td>" +
          '<td style="width:112px"><div style="display:flex;align-items:center;gap:7px"><span class="meter" style="flex:1"><i class="' +
          (pct > 100 ? "lo" : pct > 70 ? "hi" : "") + '" style="width:' + Math.min(100, pct) + '%"></i></span><span class="num" style="font-size:10.5px">' + pct + "%</span></div></td></tr>";
      }).join("");
    }
    return '<div class="dhead"><div><h1>Budget</h1><p class="sub">Adopted September 13, 2026 &middot; fiscal year ends June 30 &middot; audited quarterly by the Budget &amp; Audit Committee</p></div>' +
      '<div class="dactions"><button class="btn ghost" data-action="export">Export</button>' +
      (state.budgetEdit ? '<button class="btn ghost" data-action="badd">Add a line</button>' +
        '<button class="btn" data-action="budget-edit" data-v="0">Done editing</button>'
        : '<button class="btn ghost" data-action="doc-open" data-id="d4">Approved budget</button>' +
          '<button class="btn" data-action="budget-edit" data-v="1">Edit budget</button>') + "</div></div>" +
      (state.budgetEdit ? '<div class="banner"><b>Editing.</b> Change any line, amount or actual. Add or remove lines. Changes reach every officer immediately and are kept in the chapter record.</div>' : "") +
      '<div class="card" style="margin-bottom:18px"><div class="money">' +
      '<div><div class="lab">Income received</div><div class="big" style="color:var(--paid)">' + money0(ia) + '</div><div class="note">of ' + money0(ip) + " projected</div></div>" +
      '<div><div class="lab">Spent</div><div class="big">' + money0(ea) + '</div><div class="note">of ' + money0(ep) + " budgeted</div></div>" +
      '<div><div class="lab">On hand</div><div class="big">' + money0(ia - ea) + '</div><div class="note">operating balance</div></div>' +
      '<div><div class="lab">Projected year end</div><div class="big">' + money0(ip - ep) + '</div><div class="note">if every line lands</div></div></div></div>' +
      '<div class="sec"><h2>Income</h2><div class="card"><div class="card-b flush"><div class="tw"><table>' +
      '<thead><tr><th>Line</th><th class="r">Projected</th><th class="r">Received</th><th class="r">Remaining</th><th>Progress</th></tr></thead><tbody>' + rows(inc) + "</tbody></table></div></div></div></div>" +
      '<div class="sec"><h2>Expense</h2><div class="card"><div class="card-b flush"><div class="tw"><table>' +
      '<thead><tr><th>Line</th><th class="r">Budgeted</th><th class="r">Spent</th><th class="r">Left</th><th>Used</th></tr></thead><tbody>' + rows(exp) + "</tbody></table></div></div></div></div>";
  }


  /* ------------------------------- calendar -------------------------------
     One month of everything the chapter has on: events coloured by program
     area, committee meetings, and the dates money is due. */
  function ymParts(ym) { var a = ym.split("-"); return { y: Number(a[0]), m: Number(a[1]) - 1 }; }
  function ymShift(ym, by) {
    var p = ymParts(ym), d = new Date(p.y, p.m + by, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function isoOf(y, m, day) {
    return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  function calItems() {
    var out = {};
    function put(iso, item) { (out[iso] = out[iso] || []).push(item); }

    db.events.forEach(function (e) {
      put(e.date, { kind: "event", id: e.id, label: e.title, time: e.time,
        color: catOf(e.cat).color, action: "open-event", mandatory: e.mandatory });
    });
    db.committees.forEach(function (k) {
      (k.meetings || []).forEach(function (mt) {
        put(mt.date, { kind: "meeting", id: k.id, label: k.name + " committee",
          time: mt.present + " present", color: "#6E7781", action: "open-committee" });
      });
      if (k.next) {
        put(k.next, { kind: "meeting", id: k.id, label: k.name + " committee",
          time: "next meeting", color: "#6E7781", action: "open-committee" });
      }
    });
    db.bills.forEach(function (b) {
      var tie = b.eventId ? ev(b.eventId) : null;
      put(b.due, { kind: "money", id: b.id, label: b.title + " due", color: "#8A6413",
        time: money0(b.amount) + (tie ? " \u00b7 " + tie.title : ""), action: "view", view: "dues" });
    });
    return out;
  }

  function viewCalendar() {
    var p = ymParts(state.calYM), y = p.y, m = p.m;
    var first = new Date(y, m, 1), lead = first.getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var items = calItems();
    var monthName = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    var todayIso = isoOf(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

    var cells = "";
    for (var i = 0; i < lead; i++) cells += '<div class="cday out"></div>';
    var monthCount = 0;
    for (var d = 1; d <= days; d++) {
      var iso = isoOf(y, m, d);
      var list = (items[iso] || []).sort(function (a, b) { return a.kind === "event" ? -1 : 1; });
      monthCount += list.length;
      var chips = list.map(function (it) {
        return '<span class="cev" role="button" tabindex="0" data-action="' + it.action + '"' +
          ' data-id="' + it.id + '"' + (it.view ? ' data-view="' + it.view + '"' : "") +
          ' title="' + esc(it.label + " · " + it.time) + '">' +
          '<i style="background:' + it.color + '"></i>' + esc(it.label) + "</span>";
      }).join("");
      cells += '<div class="cday' + (iso === todayIso ? " today" : "") + (list.length ? " has" : "") + '">' +
        '<div class="cdn num">' + d + "</div>" + chips + "</div>";
    }
    var trail = (7 - ((lead + days) % 7)) % 7;
    for (var t = 0; t < trail; t++) cells += '<div class="cday out"></div>';

    var dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(function (x) {
      return '<div class="cdow">' + x + "</div>";
    }).join("");

    var next5 = upcoming().slice(0, 5).map(function (e) {
      return '<div class="docrow click" role="button" tabindex="0" data-action="open-event" data-id="' + e.id + '">' +
        '<span class="cdot" style="background:' + catOf(e.cat).color + '"></span>' +
        '<div><div class="dn">' + esc(e.title) + '</div><div class="dm">' + dLabel(e.date) + " &middot; " + e.time + "</div></div>" +
        '<span class="sp"></span><span class="rowgo">&rsaquo;</span></div>';
    }).join("");

    var legend = Object.keys(db.cats).map(function (k) {
      return '<span class="lgd"><i style="background:' + db.cats[k].color + '"></i>' + esc(db.cats[k].label) + "</span>";
    }).join("") +
      '<span class="lgd"><i style="background:#6E7781"></i>Committee meeting</span>' +
      '<span class="lgd"><i style="background:#8A6413"></i>Money due</span>';

    return '<div class="dhead"><div><h1>Calendar</h1><p class="sub">Chapter events, committee meetings and every date money is due, on one month</p></div>' +
      '<div class="dactions"><button class="btn ghost" data-action="cal-today">Today</button>' +
      '<button class="btn" data-action="new-event">Create event</button></div></div>' +

      '<div class="calbar"><button class="iconbtn" data-action="cal-prev" aria-label="Previous month">&lsaquo;</button>' +
      '<h2>' + monthName + "</h2>" +
      '<button class="iconbtn" data-action="cal-next" aria-label="Next month">&rsaquo;</button>' +
      '<span class="sp"></span><span class="chip neutral">' + monthCount + " on the calendar</span></div>" +

      '<div class="calgrid">' + dows + cells + "</div>" +
      '<div class="callgd">' + legend + "</div>" +

      '<div class="sec"><h2>Next five</h2><div class="card"><div class="card-b flush">' +
      (next5 || '<div class="empty">Nothing scheduled.</div>') + "</div></div></div>";
  }

  function viewEvents() {
    function card(e) {
      var tix = e.tickets.reduce(function (s, t) { return s + t.qty; }, 0);
      var rev = e.tickets.reduce(function (s, t) { return s + t.paid; }, 0);
      return '<div class="card" style="margin-bottom:12px"><div class="card-h"><div><h3 style="cursor:pointer" data-action="open-event" data-id="' + e.id + '">' + esc(e.title) + "</h3>" +
        '<div style="font-size:11.5px;color:var(--muted);margin-top:3px">' + dLabel(e.date) + " &middot; " + e.time + " &middot; " + esc(e.place) + "</div>" +
        '<div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">' + catChip(e.cat) +
        (e.mandatory ? '<span class="chip late">Mandatory</span>' : '<span class="chip neutral">Optional</span>') +
        '<span class="chip ' + (e.visibility === "public" ? "brand" : "neutral") + '">' + (e.visibility === "public" ? "Public link" : "Chapter only") + "</span>" +
        (e.hours ? '<span class="chip neutral">' + e.hours + " service hrs</span>" : "") + "</div></div></div>" +
        '<div class="card-b"><div style="display:flex;gap:22px;flex-wrap:wrap;margin-bottom:12px">' +
        '<div><div style="font-size:11px;color:var(--muted)">' + (isPast(e) ? "Attended" : "Going") + '</div><div class="num" style="font-size:18px;font-weight:700">' + (isPast(e) ? e.checkedIn.length : e.rsvps.length) + "</div></div>" +
        (e.price ? '<div><div style="font-size:11px;color:var(--muted)">Tickets</div><div class="num" style="font-size:18px;font-weight:700">' + tix + "</div></div>" +
          '<div><div style="font-size:11px;color:var(--muted)">Collected</div><div class="num" style="font-size:18px;font-weight:700;color:var(--paid)">' + money0(rev) + "</div></div>" +
          '<div><div style="font-size:11px;color:var(--muted)">Price</div><div class="num" style="font-size:18px;font-weight:700">' + money0(e.price) + "</div></div>" : "") +
        (isPast(e) ? '<div><div style="font-size:11px;color:var(--muted)">Service hours credited</div><div class="num" style="font-size:18px;font-weight:700">' + (e.checkedIn.length * (e.hours || 0)) + "</div></div>" : "") +
        '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn sm" data-action="open-event" data-id="' + e.id + '">Open event</button>' +
        '<button class="btn sm ghost" data-action="share-event" data-id="' + e.id + '">' + (e.price ? "Ticket link &amp; QR" : "Check-in QR") + "</button>" +
        '<button class="btn sm ghost" data-action="checkin" data-id="' + e.id + '">Check-in roster</button>' +
        '<button class="btn sm ghost" data-action="event-update" data-id="' + e.id + '">Notify attendees</button>' +
        (isPast(e) ? '<button class="btn sm ghost" data-action="log-service" data-id="' + e.id + '">Log service hours</button>' : "") +
        "</div></div></div>";
    }
    return '<div class="dhead"><div><h1>Events</h1><p class="sub">Tagged by program area so your annual report writes itself &middot; every event carries a chat, a QR and its own money</p></div>' +
      '<div class="dactions"><button class="btn ghost" data-action="program-report">Program report</button><button class="btn" data-action="new-event">Create event</button></div></div>' +
      '<div class="sec"><h2>Upcoming</h2>' + upcoming().map(card).join("") + "</div>" +
      '<div class="sec"><h2>Past</h2>' + pastEvents().map(card).join("") + "</div>";
  }

  function viewEventDetail() {
    var e = ev(state.evId);
    if (!e) { state.evId = null; return viewEvents(); }
    var going = e.rsvps.map(member).filter(Boolean);
    var notYet = actives().filter(function (m) { return e.rsvps.indexOf(m.id) < 0; });
    var tix = e.tickets.reduce(function (a, t) { return a + t.qty; }, 0);
    var rev = e.tickets.reduce(function (a, t) { return a + t.paid; }, 0);

    function people(list, label, cls, withNudge) {
      return '<div class="sec"><h2>' + label + " &middot; " + list.length + '</h2><div class="card"><div class="card-b flush" style="max-height:420px;overflow-y:auto">' +
        (list.length ? list.map(function (m) {
          return '<div class="rowbtn" role="button" tabindex="0" data-action="profile" data-id="' + m.id + '">' + av(m, 30) +
            '<div class="rb-x"><div class="rb-t">' + esc(full(m)) + '</div><div class="rb-m">' + esc(m.roles[0]) + "</div></div>" +
            (withNudge ? '<button class="btn ghost sm" data-action="nudge-one" data-id="' + e.id + '" data-m="' + m.id + '">Nudge</button>' : '<span class="chip ' + cls + '">Going</span>') +
            '<span class="rb-go">&rsaquo;</span></div>';
        }).join("") : '<div class="empty">Nobody yet.</div>') + "</div></div></div>";
    }

    var ticketRows = e.tickets.length ? e.tickets.map(function (t) {
      var who = t.memberId ? full(member(t.memberId)) : t.guest + " (guest)";
      return '<div class="docrow"><div><div class="dn">' + esc(who) + '</div><div class="dm">' + t.qty + " ticket" + (t.qty > 1 ? "s" : "") + "</div></div>" +
        '<span class="sp"></span><span class="num" style="font-weight:600">' + money(t.paid) + "</span></div>";
    }).join("") : '<div class="empty">No tickets sold yet.</div>';

    return '<button class="backlink" data-action="event-back">&lsaquo; All events</button>' +
      '<div class="dhead"><div><div style="display:flex;gap:5px;margin-bottom:5px">' + catChip(e.cat) +
      (e.mandatory ? '<span class="chip late">Mandatory</span>' : '<span class="chip neutral">Optional</span>') +
      '<span class="chip ' + (e.visibility === "public" ? "brand" : "neutral") + '">' + (e.visibility === "public" ? "Public link" : "Chapter only") + "</span></div>" +
      "<h1>" + esc(e.title) + '</h1><p class="sub">' + dLabel(e.date) + " &middot; " + e.time + " &middot; " + esc(e.place) + "</p></div>" +
      '<div class="dactions"><button class="btn ghost" data-action="edit-event" data-id="' + e.id + '">Edit</button>' +
      '<button class="btn ghost" data-action="share-event" data-id="' + e.id + '">' + (e.price ? "Ticket link &amp; QR" : "Check-in QR") + "</button>" +
      '<button class="btn ghost" data-action="checkin" data-id="' + e.id + '">Check-in</button>' +
      '<button class="btn" data-action="push-rsvp" data-id="' + e.id + '">Push RSVP request</button></div></div>' +
      '<div class="statrow">' +
      '<div><div class="sl">Going</div><div class="sv">' + e.rsvps.length + "</div></div>" +
      '<div><div class="sl">No answer</div><div class="sv">' + notYet.length + "</div></div>" +
      (e.price ? '<div><div class="sl">Tickets</div><div class="sv">' + tix + "</div></div>" +
        '<div><div class="sl">Collected</div><div class="sv" style="color:var(--paid)">' + money0(rev) + "</div></div>" : "") +
      '<div><div class="sl">Service hours each</div><div class="sv">' + (e.hours || 0) + "</div></div>" +
      '<div><div class="sl">Checked in</div><div class="sv">' + e.checkedIn.length + "</div></div></div>" +
      (function () {
        var tied = db.bills.filter(function (b) { return b.eventId === e.id; });
        if (!tied.length) return "";
        return '<div class="sec"><h2>Money for this event</h2><div class="card"><div class="card-b flush">' +
          tied.map(function (b) {
            var paid = actives().filter(function (m) { return paidBy(m.id, b.id) >= b.amount; }).length;
            var owed = actives().length - paid;
            return '<div class="docrow click" role="button" tabindex="0" data-action="view" data-view="dues">' +
              '<div><div class="dn">' + esc(b.title) + '</div><div class="dm">' + money(b.amount) +
              " each &middot; due " + dLabel(b.due) + "</div></div>" +
              '<span class="sp"></span><span class="chip paid">' + paid + " paid</span>" +
              (owed ? '<span class="chip late">' + owed + " unpaid</span>" : "") +
              '<span class="rowgo">&rsaquo;</span></div>';
          }).join("") + "</div></div></div>";
      })() +
      (e.price ? '<div class="sec"><h2>Tickets</h2><div class="card"><div class="card-b flush">' + ticketRows + "</div></div></div>" : "") +
      attachedDocs("Event documents", "eventId", e.id, "Programs") +
      '<div class="two"><div>' + people(notYet, "Has not answered", "neutral", true) + "</div>" +
      "<div>" + people(going, "Going", "paid", false) + "</div></div>";
  }

  function viewService() {
    var byCat = {};
    pastEvents().forEach(function (e) { byCat[e.cat] = (byCat[e.cat] || 0) + e.checkedIn.length * (e.hours || 0); });
    db.service.filter(function (s) { return s.status === "approved"; }).forEach(function (s) { byCat.social = (byCat.social || 0) + s.hours; });
    var total = Object.keys(byCat).reduce(function (s, k) { return s + byCat[k]; }, 0) || 1;
    var bars = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).map(function (k) {
      var c = catOf(k), pct = Math.round((byCat[k] / total) * 100);
      return '<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">' +
        '<span style="font-weight:600">' + esc(c.label) + '</span><span class="num">' + byCat[k] + " hrs &middot; " + pct + "%</span></div>" +
        '<div class="meter"><i style="width:' + pct + "%;background:" + c.color + '"></i></div></div>';
    }).join("");
    var rows = actives().map(function (m) { return { m: m, h: totalHours(m.id) }; }).sort(function (a, b) { return b.h - a.h; }).map(function (r) {
      return '<tr class="rowlink" data-action="service-member" data-id="' + r.m.id + '"><td><div class="who">' + av(r.m) + '<span class="nm">' + esc(full(r.m)) + "</span></div></td>" +
        '<td class="money-c r">' + r.h + '</td><td style="width:130px"><div class="meter"><i class="' + (r.h >= 20 ? "hi" : r.h < 8 ? "lo" : "") + '" style="width:' + Math.min(100, r.h * 4) + '%"></i></div></td>' +
        '<td class="r">' + (r.h >= 20 ? '<span class="chip paid">Goal met</span>' : r.h >= 8 ? '<span class="chip due">On track</span>' : '<span class="chip late">Below 8</span>') +
        ' <span style="color:var(--muted)">&rsaquo;</span></td></tr>';
    }).join("");
    var pend = db.service.filter(function (s) { return s.status === "pending"; });
    return '<div class="dhead"><div><h1>Service Hours</h1><p class="sub">' + totalService() + " hours logged this fiscal year &middot; the number your province report asks for every spring</p></div>" +
      '<div class="dactions"><button class="btn ghost" data-action="export">Export</button><button class="btn" data-action="log-service">Log hours</button></div></div>' +
      (pend.length ? '<div class="sec"><h2>Awaiting approval</h2><div class="card"><div class="card-h">' +
        '<h3>' + pend.length + " submission" + (pend.length > 1 ? "s" : "") + " to review</h3>" +
        '<div style="display:flex;gap:6px"><button class="btn ghost sm" data-action="deny-all-service">Deny all</button>' +
        '<button class="btn sm" data-action="approve-all-service">Approve all ' + pend.length + "</button></div></div>" +
        '<div class="card-b flush">' + pend.map(function (sv) {
          var mm = member(sv.memberId);
          return '<div class="revrow">' + av(mm, 34) +
            '<div class="rvm"><div class="rvt">' + esc(full(mm)) + ' <span class="chip due">' + sv.hours + " hrs</span></div>" +
            '<div class="rvd">' + esc(sv.what) + " &middot; " + dLabel(sv.date) + " &middot; submitted from the app</div>" +
            (sv.note ? '<div class="rvn">' + esc(sv.note) + "</div>" : "") + "</div>" +
            '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" data-action="review-service" data-id="' + sv.id + '">Review</button>' +
            '<button class="btn sm" data-action="approve-service" data-id="' + sv.id + '">Approve</button></div></div>';
        }).join("") + "</div></div></div>" : "") +
      '<div class="two"><div class="card"><div class="card-h"><h3>Hours by program area</h3></div><div class="card-b">' + bars + "</div></div>" +
      '<div class="card"><div class="card-h"><h3>By brother</h3><span class="chip neutral">Goal: 20 hrs</span></div><div class="card-b flush"><div class="tw" style="max-height:430px;overflow-y:auto"><table>' +
      '<thead><tr><th>Brother</th><th class="r">Hours</th><th></th><th class="r">Status</th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div></div>";
  }

  function viewMinutes() {
    var html = db.minutes.map(function (mn) {
      return '<div class="card" style="margin-bottom:14px"><div class="card-h"><div><h3>' + esc(mn.title) + "</h3>" +
        '<div style="font-size:11.5px;color:var(--muted);margin-top:2px">' + dLabel(mn.date) + " &middot; recorded by " + esc(mn.by) +
        " &middot; " + mn.present + " present, " + mn.excused + " excused, " + mn.absent + " absent</div></div>" +
        '<span class="chip ' + (mn.status === "Approved" ? "paid" : "due") + '">' + esc(mn.status) + "</span></div>" +
        '<div class="card-b flush"><div class="tw"><table><thead><tr><th>Motion</th><th>Moved / seconded</th><th class="r">Yes</th><th class="r">No</th><th class="r">Abstain</th><th class="r">Result</th></tr></thead><tbody>' +
        (mn.motions.length ? mn.motions.map(function (mo) {
          return '<tr><td style="font-weight:600;max-width:340px">' + esc(mo.t) + "</td>" +
            '<td style="font-size:11.5px;color:var(--muted)">' + esc(mo.by) + "<br>" + esc(mo.second) + "</td>" +
            '<td class="money-c r">' + mo.yes + '</td><td class="money-c r">' + mo.no + '</td><td class="money-c r">' + mo.abstain + "</td>" +
            '<td class="r"><span class="chip ' + (mo.result === "Carried" ? "paid" : "late") + '">' + esc(mo.result) + "</span></td></tr>";
        }).join("") : '<tr><td colspan="6"><div class="empty">No motions recorded yet.</div></td></tr>') + "</tbody></table></div></div>" +
        (mn.text ? '<div style="padding:12px 14px;border-top:1px solid var(--line)"><div class="asec" style="margin:0 0 7px">Filed minutes</div>' +
          '<div class="minutesbox">' + esc(mn.text) + "</div></div>" : "") +
        '<div style="padding:11px 14px;border-top:1px solid var(--line);display:flex;gap:6px;flex-wrap:wrap">' +
        (mn.status !== "Approved" ? '<button class="btn sm" data-action="approve-minutes" data-id="' + mn.id + '">Mark approved</button>' : "") +
        (mn.text ? "" : '<button class="btn sm ghost" data-action="attach-minutes" data-id="' + mn.id + '">Attach the minutes</button>') +
        '<button class="btn sm ghost" data-action="new-motion" data-id="' + mn.id + '">Record a motion</button>' +
        '<button class="btn sm ghost" data-action="export">Export for the record</button></div></div>';
    }).join("");
    return '<div class="dhead"><div><h1>Minutes &amp; Votes</h1><p class="sub">Every motion, mover, second and tally &mdash; the record the next administration inherits</p></div>' +
      '<div class="dactions"><button class="btn ghost" data-action="start-ballot">Call a vote</button>' +
      '<button class="btn ghost" data-action="upload-minutes">Upload minutes</button>' +
      '<button class="btn" data-action="new-minutes">New minutes</button></div></div>' + html;
  }

  function viewVault() {
    var body = ["Governance", "Finance", "Minutes", "Programs", "Executive Board"].map(function (f) {
      var items = db.docs.filter(function (d) { return d.folder === f; });
      if (!items.length) return "";
      var nf = items.filter(function (d) { return !isLink(d); }).length, nl = items.length - nf;
      return '<div class="folder">' + esc(f) + (f === "Executive Board" ? ' &middot; <span style="color:var(--late)">restricted</span>' : "") +
        " &middot; " + nf + " file" + (nf === 1 ? "" : "s") + (nl ? " &middot; " + nl + " link" + (nl === 1 ? "" : "s") : "") + "</div>" +
        items.map(function (d) {
          return '<div class="docrow"><div class="dicon' + (isLink(d) ? " link" : "") + '"><span>' + docTag(d) + "</span></div>" +
            '<div><div class="dn">' + esc(d.name) + (isLink(d) ? '<span class="extchip">external</span>' : "") + '</div>' +
            '<div class="dm">' + docMeta(d) + " &middot; " + d.opens + " opens</div></div>" +
            '<span class="sp"></span><span class="chip ' + (d.vis === "officers" ? "late" : "neutral") + '">' + (d.vis === "officers" ? "Officers only" : "All members") + "</span>" +
            '<button class="btn ghost sm" data-action="doc-open" data-id="' + d.id + '">Open</button></div>';
        }).join("");
    }).join("");
    var nLink = db.docs.filter(isLink).length;
    return '<div class="dhead"><div><h1>Vault</h1><p class="sub">' + (db.docs.length - nLink) +
      " documents and " + nLink + " linked Google files &middot; each one carries a visibility rule and an open count &middot; " +
      "the links transfer at handoff like everything else</p></div>" +
      '<div class="dactions"><button class="btn ghost" data-action="add-link">Link a document</button>' +
      '<button class="btn" data-action="upload">Upload a file</button></div></div>' +
      '<div class="card"><div class="card-b flush">' + body + "</div></div>";
  }

  function viewMessages() {
    var meId = ROLE_MEMBER[state.role];
    var visible = db.channels.filter(function (c) { return c.vis === "all" || isOfficer(member(meId)); });
    if (!visible.some(function (c) { return c.id === state.channel; })) state.channel = visible[0].id;
    var active = chan(state.channel);
    var list = visible.map(function (c) {
      return '<button class="chanbtn' + (c.id === state.channel ? " on" : "") + '" data-action="channel" data-id="' + c.id + '">' +
        '<div class="cn">' + esc(c.name) + (c.vis === "officers" ? ' <span class="chip late">Officers</span>' : "") + "</div>" +
        '<div class="cd">' + esc(c.desc) + "</div></button>";
    }).join("");
    var msgs = active.msgs.map(function (m) {
      var w = member(m.who), mine = m.who === meId;
      var rk = Object.keys(m.reacts || {}).map(function (k) { return "<span>" + k + " " + m.reacts[k] + "</span>"; }).join("");
      return '<div class="msg' + (mine ? " mine" : "") + '">' + av(w) +
        '<div class="mb">' + (mine ? "" : '<div class="mn">' + esc(full(w)) + "</div>") + esc(m.text) +
        (rk ? '<div class="reacts">' + rk + "</div>" : "") +
        '<div class="mt">' + esc(m.at) + (m.views ? " &middot; " + m.views + " read" : "") + "</div></div></div>";
    }).join("");
    return '<div class="dhead"><div><h1>Messages</h1><p class="sub">Encrypted in transit and at rest &middot; retention set by the chapter &middot; no ads, no scanning, no outside eyes</p></div></div>' +
      '<div class="card"><div class="card-b flush"><div style="display:grid;grid-template-columns:236px minmax(0,1fr)">' +
      '<div class="chanlist">' + list + "</div>" +
      '<div class="thread"><div class="msgs" id="dashMsgs">' + msgs + "</div>" +
      '<form class="composer" data-action="send-dash"><input type="text" id="dashInput" placeholder="Message ' + esc(active.name) + '" autocomplete="off"><button class="btn" type="submit">Send</button></form></div></div></div></div>' +
      '<div class="banner"><b>Private, not invisible.</b> Officers can export a channel for the chapter record, and the chapter sets how long messages are kept. What the chapter cannot do is let anyone outside it read, search or find this.</div>';
  }

  function viewSettings() {
    var sets = {
      kap: ["Polemarch", "Vice Polemarch", "Keeper of Exchequer", "Keeper of Records", "Strategus", "Lieutenant Strategus", "Reporter", "Historian"],
      standard: ["President", "Vice President", "Treasurer", "Recording Secretary", "Sergeant-at-Arms", "Corresponding Secretary", "Historian"],
      alt: ["Basileus", "Vice Basileus", "Keeper of Finance", "Keeper of Records & Seal", "Keeper of Peace"] };
    var cur = sets[db.chapter.titles] || sets.kap;
    var saved = (14.25 - 2.28) * actives().length;
    return '<div class="dhead"><div><h1>Settings</h1><p class="sub">Polemarch only</p></div></div>' +
      '<div class="two"><div>' +
      '<div class="card" style="margin-bottom:15px"><div class="card-h"><h3>Plan</h3></div><div class="card-b">' +
      '<div class="kv"><span class="k">Chapter subscription</span><span class="v num">' + money(db.chapter.plan) + "/month</span></div>" +
      '<div class="kv"><span class="k">Members included</span><span class="v">Unlimited</span></div>' +
      '<div class="kv"><span class="k">Bank payment (ACH)</span><span class="v num">0.8%, capped at $5.00</span></div>' +
      '<div class="kv"><span class="k">Card payment</span><span class="v num">2.9% + $0.30</span></div>' +
      '<div class="kv"><span class="k">Platform share of dues</span><span class="v" style="color:var(--paid)">None</span></div>' +
      '<p style="font-size:12px;color:var(--muted);margin-top:11px">A $285 tax paid by bank costs the brother $2.28. On a platform charging a 5% convenience fee it costs $14.25. Across ' +
      actives().length + " brothers that is " + money0(saved) + " a year that stays in your chapter.</p></div></div>" +
      '<div class="card" style="margin-bottom:15px"><div class="card-h"><h3>Chapter type</h3></div><div class="card-b">' +
      '<p style="font-size:12.5px;color:var(--ink-2);margin-bottom:11px">Quorum runs graduate and undergraduate chapters. The type changes the vocabulary, the dues calendar and which modules appear.</p>' +
      '<div class="segment" style="margin-bottom:11px">' +
      '<button data-action="ctype" data-t="grad" class="' + (db.chapter.type !== "undergrad" ? "on" : "") + '">Graduate / Alumni</button>' +
      '<button data-action="ctype" data-t="undergrad" class="">Undergraduate</button></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + (db.chapter.type === "undergrad"
        ? ['Study hours', 'GPA tracking', 'New member education', 'Risk management', 'Housing'].map(function (t) { return '<span class="chip brand">' + t + "</span>"; }).join("")
        : ['Annual dues calendar', 'Province reporting', 'Reclamation', 'Life members'].map(function (t) { return '<span class="chip brand">' + t + "</span>"; }).join("")) +
      "</div></div></div>" +
      '<div class="card" style="margin-bottom:15px"><div class="card-h"><h3>Officer titles</h3></div><div class="card-b">' +
      '<p style="font-size:12.5px;color:var(--ink-2);margin-bottom:11px">Quorum uses your organization\'s language, not ours.</p>' +
      '<div class="segment" style="margin-bottom:11px">' +
      '<button data-action="titles" data-t="kap" class="' + (db.chapter.titles === "kap" ? "on" : "") + '">This chapter</button>' +
      '<button data-action="titles" data-t="standard" class="' + (db.chapter.titles === "standard" ? "on" : "") + '">Generic</button>' +
      '<button data-action="titles" data-t="alt" class="' + (db.chapter.titles === "alt" ? "on" : "") + '">Another org</button></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + cur.map(function (t) { return '<span class="chip brand">' + esc(t) + "</span>"; }).join("") + "</div></div></div>" +
      '<div class="card"><div class="card-h"><h3>Roles and what each one sees</h3></div><div class="card-b flush">' +
      [["Polemarch", "Everything, including roles, settings and handoff"], ["Vice Polemarch", "Everything except the ledger"],
       ["Keeper of Exchequer", "Dues, budget, roster, documents"], ["Assistant Keeper of Exchequer", "Dues and roster only"],
       ["Keeper of Records", "Roster, minutes, documents, messages"], ["Strategus", "Attendance, check-in and ritual"],
       ["Reporter", "Announcements and the chapter channel"], ["Committee Chair", "Their committee channel, roster and budget line"],
       ["Brother", "App only, no dashboard"]].map(function (r) {
        return '<div class="docrow"><div><div class="dn">' + r[0] + '</div><div class="dm">' + r[1] + "</div></div></div>";
      }).join("") + "</div></div></div><div>" +
      '<div class="card" style="margin-bottom:15px"><div class="card-h"><h3>Privacy and security</h3></div><div class="card-b">' +
      '<div class="kv"><span class="k">Chapter discovery</span><span class="v" style="color:var(--paid)">Off, invite only</span></div>' +
      '<div class="kv"><span class="k">Member directory</span><span class="v">This chapter only</span></div>' +
      '<div class="kv"><span class="k">Messages at rest</span><span class="v">Encrypted, per-chapter key</span></div>' +
      '<div class="kv"><span class="k">Messages in transit</span><span class="v">TLS 1.3</span></div>' +
      '<div class="kv"><span class="k">Advertising and tracking</span><span class="v" style="color:var(--paid)">None</span></div>' +
      '<div class="kv"><span class="k">Message retention</span><span class="v">Keep everything</span></div>' +
      '<div class="kv"><span class="k">Screenshot alerts</span><span class="v">On for Executive Board</span></div>' +
      '<div class="kv"><span class="k">Annual records export</span><span class="v">Every June 30</span></div>' +
      '<p style="font-size:12px;color:var(--muted);margin-top:11px">Officers can export any channel for the chapter record. Nobody outside the chapter, including Quorum staff, can read, search or discover it.</p></div></div>' +
      '<div class="card" style="margin-bottom:15px"><div class="card-h"><h3>Program areas</h3>' +
      '<button class="btn ghost sm" data-action="new-cat">Add a program area</button></div><div class="card-b flush">' +
      '<p class="lp" style="padding:11px 14px 4px;margin:0">Every event, committee and bill is tagged with one of these. They are what the annual report counts, so name them the way your organization names them.</p>' +
      Object.keys(db.cats).map(function (ck) {
        var used = db.events.filter(function (x) { return x.cat === ck; }).length +
          db.committees.filter(function (x) { return x.cat === ck; }).length;
        return '<div class="pacard"><span class="paswatch" style="background:' + db.cats[ck].color + '"></span>' +
          '<span class="pa-n">' + esc(db.cats[ck].label) + '</span><span class="pa-c">' + used + " tagged</span>" +
          '<button class="btn ghost sm" data-action="edit-cat" data-c="' + ck + '">Rename</button></div>';
      }).join("") + "</div></div>" +
      '<div class="card" style="margin-bottom:15px"><div class="card-h"><h3>Chapter appearance</h3></div><div class="card-b">' +
      '<p style="font-size:12.5px;color:var(--ink-2);margin-bottom:11px">Quorum stays neutral so it belongs to every organization. Your chapter sets its own accent.</p>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap">' + ["#15454F", "#5B2340", "#2E3A6B", "#7A4A14", "#2F5134", "#4A2458", "#8A1538"].map(function (c) {
        return '<button class="btn ghost sm" data-action="accent" data-c="' + c + '" style="width:38px;height:32px;background:' + c + ";border-color:" + c + '" aria-label="Accent"></button>';
      }).join("") + "</div></div></div>" +
      '<div class="card"><div class="card-h"><h3>Handoff</h3></div><div class="card-b">' +
      '<p style="font-size:12.5px;color:var(--ink-2);margin-bottom:11px">When the new slate is seated, one action transfers the roster, ledger, minutes, documents and channels with their history intact. Nothing is retyped and nothing is lost.</p>' +
      '<button class="btn ghost" data-action="handoff">Preview the handoff</button></div></div></div></div>';
  }

  function viewLocked() {
    var m = member(ME);
    return '<div class="lockwrap"><div>' + icon("vault", 34) +
      "<h2>Brothers don't get a dashboard</h2>" +
      "<p>" + esc(full(m)) + " is a brother of this chapter, not an officer. The dashboard is where chapter business is run, so it stays with the officer line.</p>" +
      "<p>His chapter lives entirely in the app: messages, dues, events, documents, committees and his own record.</p>" +
      '<p style="margin-top:15px"><button class="btn" data-action="switch-profile">Sign in as someone else</button></p></div></div>';
  }

  function renderDash() {
    var el = $("#dashMain");
    if (state.role === "member") { el.innerHTML = viewLocked(); return; }
    if (!can(state.view)) { state.view = "home"; state.komId = null; state.attEvent = null; }
    var map = { home: viewHome, members: viewMembers, committees: viewCommittees, attendance: viewAttendance, dues: viewDues,
      requests: viewRequests, budget: viewBudget, calendar: viewCalendar, events: viewEvents, service: viewService, minutes: viewMinutes,
      vault: viewVault, messages: viewMessages, settings: viewSettings };
    el.innerHTML = state.komId ? viewCommitteeDetail()
      : (state.view === "events" && state.evId) ? viewEventDetail()
      : map[state.view]();
    var dm = $("#dashMsgs"); if (dm) dm.scrollTop = dm.scrollHeight;
    if (state.focusSearch) { var s = $("#memberSearch"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } state.focusSearch = false; }
  }

  /* ============================================================ APP */
  var TABS = [{ id: "home", label: "Home", icon: "bell" }, { id: "chat", label: "Chat", icon: "chat" },
    { id: "events", label: "Events", icon: "cal" }, { id: "pay", label: "Dues", icon: "pay" }, { id: "more", label: "More", icon: "more" }];

  function renderApp() {
    var me = member(ME);
    var sub = { vault: "Vault", directory: "Directory", committees: "My Committees", profile: "My Record", service: "Service Hours" };
    var titles = { home: "Home", chat: "Messages", pay: "Dues", events: "Events", more: state.moreView ? sub[state.moreView] : "More" };
    var inRoom = (state.tab === "chat" && state.appChannel) ? chan(state.appChannel) : null;
    var headT = inRoom ? "# " + inRoom.name : titles[state.tab];
    var headS = inRoom ? (inRoom.desc || db.chapter.name) : db.chapter.name;
    $("#appHead").innerHTML =
      (inRoom ? '<button class="ah-back" data-action="chat-back" aria-label="All messages">&lsaquo;</button>' : "") +
      '<div class="ah-x"><div class="ah-t">' + esc(headT) + '</div><div class="ah-s">' + esc(headS) + "</div></div>" +
      '<div class="ah-r"><button class="bell" data-action="tab" data-t="home" aria-label="Notifications">' + icon("bell", 19) +
      (unread() ? '<span class="bdg">' + unread() + "</span>" : "") + "</button>" +
      '<button style="background:none;border:0;padding:0;cursor:pointer;line-height:0" data-action="more-view" data-v="profile" title="' + esc(full(me)) + '">' + av(me, 30) + "</button></div>";
    $("#tabBar").innerHTML = TABS.map(function (t) {
      return '<button class="tab' + (state.tab === t.id ? " on" : "") + '" data-action="tab" data-t="' + t.id + '">' + icon(t.icon, 20) + '<span class="tl">' + t.label + "</span></button>";
    }).join("");
    var body = { home: appHome, chat: appChat, pay: appPay, events: appEvents, more: appMore }[state.tab];
    $("#appBody").innerHTML = body(balanceOf(ME));
    var am = $("#appMsgs"); if (am) am.scrollTop = am.scrollHeight;
  }

  function appHome(bal) {
    var a = Math.round(attRate(ME) * 100), hrs = totalHours(ME);
    var next = upcoming()[0];
    var head = bal > 0
      ? '<div class="acard balance"><div class="bl">Your chapter balance</div><div class="bv">' + money(bal) + "</div>" +
        '<div class="bn">' + db.bills.filter(function (b) { return paidBy(ME, b.id) < b.amount; }).length + " unpaid bills</div>" +
        '<button class="btn block" data-action="tab" data-t="pay">Pay</button></div>'
      : '<div class="acard balance"><div class="bl">Your chapter balance</div><div class="bv">$0.00</div><div class="bn">Financial through June 2027</div></div>';
    var cells = [["Attendance", a + "%", a >= 80 ? "var(--paid)" : a < 60 ? "var(--late)" : "var(--ink)"],
      ["Service hrs", String(hrs), "var(--ink)"], ["Committees", String(committeesOf(ME).length), "var(--ink)"]];
    var stats = '<div class="acard" style="display:flex;gap:0;padding:0;overflow:hidden">' + cells.map(function (s, i) {
      return '<div style="flex:1;padding:12px;' + (i ? "border-left:1px solid var(--line)" : "") + '">' +
        '<div style="font-size:10.5px;color:var(--muted)">' + s[0] + '</div><div class="num" style="font-size:19px;font-weight:700;color:' + s[2] + '">' + s[1] + "</div></div>";
    }).join("") + "</div>";
    var nextCard = next ? '<div class="acard"><div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px">' + catChip(next.cat) +
      (next.mandatory ? '<span class="chip late">Mandatory</span>' : "") + "</div>" +
      "<h3>" + esc(next.title) + '</h3><p class="asub">' + dLabel(next.date) + " &middot; " + next.time + "<br>" + esc(next.place) + "</p>" +
      '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">' +
      (next.rsvps.indexOf(ME) > -1 ? '<span class="chip paid">You are going</span>' : '<button class="btn sm" data-action="rsvp" data-id="' + next.id + '">RSVP</button>') +
      '<button class="btn sm ghost" data-action="request-excuse" data-id="' + next.id + '">Request excuse</button></div></div>' : "";
    var map = { money: "money", doc: "doc", cal: "cal", bell: "bell", chat: "chat", cake: "cake" };
    var rows = db.notes.map(function (n) {
      return '<div class="nrow' + (n.read ? "" : " unread") + '"><span class="ni">' + icon(map[n.icon] || "bell", 17) + "</span>" +
        '<div><div class="nt">' + esc(n.title) + '</div><div class="nd">' + esc(n.body) + '</div><div class="nm2">' + esc(n.when) + "</div></div></div>";
    }).join("");
    return head + stats + nextCard + '<div class="asec">Notifications</div><div class="acard flush">' + rows + "</div>" +
      '<button class="btn ghost block" data-action="mark-read" style="margin-top:4px">Mark all as read</button>';
  }

  /* Messages on a phone is two screens, not a split. The tab opens on the list
     of rooms; tapping one takes the whole screen; the header carries the way back. */
  function appChat() {
    return state.appChannel ? appChatRoom() : appChatList();
  }

  function appChatList() {
    var visible = db.channels.filter(function (c) { return c.vis === "all"; });
    var chapterCh = visible.filter(function (x) { return (x.desc || "").indexOf("Committee") < 0; });
    var cteeCh = visible.filter(function (x) { return (x.desc || "").indexOf("Committee") > -1; });

    function row(c) {
      var last = c.msgs[c.msgs.length - 1];
      var who = last ? member(last.who) : null;
      var prev = last ? ((who ? who.first + ": " : "") + last.text) : "No messages yet";
      return '<div class="croom" role="button" tabindex="0" data-action="app-channel" data-id="' + c.id + '">' +
        '<span class="crhash">#</span>' +
        '<div class="crx"><div class="crn">' + esc(c.name) +
        (last ? '<span class="crwhen">' + esc(last.at) + "</span>" : "") + "</div>" +
        '<div class="crp">' + esc(prev) + "</div></div>" +
        '<span class="crgo">&rsaquo;</span></div>';
    }
    function group(label, list) {
      if (!list.length) return "";
      return '<div class="crhead">' + label + "</div>" +
        '<div class="card"><div class="card-b flush">' + list.map(row).join("") + "</div></div>";
    }

    return '<div class="chatlist">' +
      group("Chapter", chapterCh) +
      group("Committees", cteeCh) +
      '<div class="crhead">Closed to you</div>' +
      '<div class="card"><div class="card-b flush">' +
      '<div class="croom lock" role="button" tabindex="0" data-action="locked-channel">' +
      '<span class="crhash">#</span>' +
      '<div class="crx"><div class="crn">Executive Board</div>' +
      '<div class="crp">Officers only. You cannot see it, or see that it has traffic.</div></div>' +
      '<span class="crlock">&#128274;</span></div>' +
      "</div></div></div>";
  }

  function appChatRoom() {
    var visible = db.channels.filter(function (c) { return c.vis === "all"; });
    if (!visible.some(function (x) { return x.id === state.appChannel; })) { state.appChannel = null; return appChatList(); }
    var c = chan(state.appChannel);
    var msgs = c.msgs.map(function (m) {
      var w = member(m.who), mine = m.who === ME;
      var rk = Object.keys(m.reacts || {}).map(function (k) { return "<span>" + k + " " + m.reacts[k] + "</span>"; }).join("");
      return '<div class="msg' + (mine ? " mine" : "") + '">' + av(w) +
        '<div class="mb">' + (mine ? "" : '<div class="mn">' + esc(full(w)) + "</div>") + esc(m.text) +
        (rk ? '<div class="reacts">' + rk + "</div>" : "") + '<div class="mt">' + esc(m.at) + "</div></div></div>";
    }).join("");
    return '<div class="chatroom">' +
      '<div class="appmsgs" id="appMsgs">' + msgs + "</div>" +
      '<form class="appcomposer" data-action="send-app"><input type="text" id="appInput" placeholder="Message ' +
      esc(c.name) + '" autocomplete="off"><button class="btn" type="submit">Send</button></form></div>';
  }

  function appPay(bal) {
    var unpaid = db.bills.filter(function (b) { return paidBy(ME, b.id) < b.amount; });
    var mine = db.payments.filter(function (p) { return p.memberId === ME; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var head = '<div class="acard balance"><div class="bl">You owe</div><div class="bv">' + money(bal) + "</div>" +
      '<div class="bn">' + (bal > 0 ? "Pay by bank and the fee is " + money(achFee(bal)) : "Thank you, Brother") + "</div>" +
      (bal > 0 ? '<button class="btn block" data-action="pay-all">Pay ' + money(bal) + "</button>" : "") + "</div>";
    var bills = unpaid.length ? unpaid.map(function (b) {
      var owed = b.amount - paidBy(ME, b.id), dl = daysLate(b.due);
      return '<div class="acard"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
        "<div><h3>" + esc(b.title) + '</h3><p class="asub">Due ' + dLabel(b.due) + "</p></div>" +
        '<span class="num" style="font-weight:700;font-size:16px">' + money(owed) + "</span></div>" +
        '<div style="margin:8px 0">' + (dl > 0 ? '<span class="chip late">' + dl + " days past due</span>" : '<span class="chip due">Due ' + dShort(b.due) + "</span>") + "</div>" +
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-action="pay-bill" data-id="' + b.id + '">Pay ' + money(owed) + "</button></div></div>";
    }).join("") : '<div class="acard"><p class="asub">No open bills. Your next notice arrives in July.</p></div>';
    var hist = mine.length ? mine.map(function (p) {
      var b = bill(p.billId);
      return '<div class="vrow"><div><div class="vn">' + esc(b ? b.title : "Event ticket") + "</div>" +
        '<div class="vm">' + dLabel(p.date) + " &middot; " + (p.method === "ach" ? "Bank" : p.method === "card" ? "Card" : "Check") + "</div></div>" +
        '<span class="sp"></span><span class="num" style="font-weight:600">' + money(p.amount) + "</span>" +
        '<button class="btn ghost sm" data-action="receipt" data-id="' + p.id + '">Receipt</button></div>';
    }).join("") : '<div class="empty">No payments yet.</div>';
    return head + '<div class="asec">Open bills</div>' + bills + '<div class="asec">Payment history</div><div class="acard flush">' + hist + "</div>";
  }

  function appEvents() {
    var rows = upcoming().map(function (e) {
      var going = e.rsvps.indexOf(ME) > -1;
      var qty = e.tickets.filter(function (t) { return t.memberId === ME; }).reduce(function (s, t) { return s + t.qty; }, 0);
      return '<div class="evrow"><div style="display:flex;gap:5px;flex-wrap:wrap">' + catChip(e.cat) + (e.mandatory ? '<span class="chip late">Mandatory</span>' : "") + "</div>" +
        '<div class="et">' + esc(e.title) + '</div><div class="ed">' + dLabel(e.date) + " &middot; " + e.time + "<br>" + esc(e.place) + "</div>" +
        (e.price ? '<div class="ed" style="margin-top:4px"><b>' + money0(e.price) + "</b> per person &middot; guests welcome</div>" : "") +
        '<div class="ea">' + (going ? '<span class="chip paid">Going</span>' : '<button class="btn sm ghost" data-action="rsvp" data-id="' + e.id + '">RSVP</button>') +
        (e.price ? (qty ? '<span class="chip brand">' + qty + " ticket" + (qty > 1 ? "s" : "") + '</span><button class="btn sm ghost" data-action="my-ticket" data-id="' + e.id + '">Show ticket</button>'
                        : '<button class="btn sm" data-action="buy-ticket" data-id="' + e.id + '">Get tickets</button>')
                 : '<button class="btn sm ghost" data-action="my-ticket" data-id="' + e.id + '">Check-in code</button>') +
        '<button class="btn sm ghost" data-action="request-excuse" data-id="' + e.id + '">Excuse</button></div></div>';
    }).join("");
    var past = pastEvents().map(function (e) {
      var inn = e.checkedIn.indexOf(ME) > -1;
      return '<div class="vrow"><div><div class="vn">' + esc(e.title) + '</div><div class="vm">' + dLabel(e.date) + " &middot; " + (e.hours || 0) + " service hrs</div></div>" +
        '<span class="sp"></span>' + (inn ? '<span class="chip paid">Attended</span>' : '<span class="chip neutral">Missed</span>') + "</div>";
    }).join("");
    return '<div class="asec">Upcoming</div><div class="acard flush">' + rows + "</div>" +
      '<div class="asec">Your attendance record</div><div class="acard flush">' + past + "</div>";
  }

  function backBtn() { return '<button class="btn ghost sm" data-action="more-view" data-v="" style="margin-bottom:11px">&lsaquo; More</button>'; }

  function appMore() {
    var m = member(ME);
    if (state.moreView === "vault") {
      var vis = db.docs.filter(function (d) { return d.vis === "all"; });
      var out = ["Governance", "Finance", "Minutes", "Programs"].map(function (f) {
        var items = vis.filter(function (d) { return d.folder === f; });
        if (!items.length) return "";
        return '<div class="asec">' + f + '</div><div class="acard flush">' + items.map(function (d) {
          return '<div class="vrow"><div class="dicon' + (isLink(d) ? " link" : "") + '"><span>' + docTag(d) + "</span></div>" +
            '<div><div class="vn">' + esc(d.name) + '</div><div class="vm">' + (isLink(d) ? esc(d.host || "Link") : d.size) + " &middot; " + d.updated + "</div></div>" +
            '<span class="sp"></span><button class="btn ghost sm" data-action="doc-open" data-id="' + d.id + '">Open</button></div>';
        }).join("") + "</div>";
      }).join("");
      return backBtn() + out + '<p style="font-size:11px;color:var(--muted);padding:6px 4px 0">' +
        db.docs.filter(function (d) { return d.vis === "officers"; }).length + " documents in Executive Board are not shown to members.</p>";
    }
    if (state.moreView === "directory") {
      var inds = {};
      actives().forEach(function (x) { (inds[x.industry] = inds[x.industry] || []).push(x); });
      return backBtn() + '<p style="font-size:12px;color:var(--muted);padding:0 2px 10px">Your brothers by industry. This directory stops at the chapter line, nobody outside it can search you.</p>' +
        Object.keys(inds).sort().map(function (k) {
          return '<div class="asec">' + esc(k) + '</div><div class="acard flush">' + inds[k].map(function (x) {
            return '<div class="vrow">' + av(x) +
              '<div><div class="vn">' + esc(full(x)) + '</div><div class="vm">' + esc(x.jobTitle) + " &middot; " + esc(x.employer) + "</div></div>" +
              '<span class="sp"></span><button class="btn ghost sm" data-action="profile" data-id="' + x.id + '">View</button></div>';
          }).join("") + "</div>";
        }).join("");
    }
    if (state.moreView === "committees") {
      var mineK = committeesOf(ME);
      return backBtn() + (mineK.length ? mineK.map(function (x) {
        return '<div class="acard"><div style="display:flex;gap:5px;margin-bottom:7px">' + catChip(x.k.cat) + '<span class="chip neutral">' + esc(x.role) + "</span></div>" +
          "<h3>" + esc(x.k.name) + '</h3><p class="asub">Chair: ' + esc(full(member(x.k.chair))) + " &middot; meets " + esc(x.k.meets) + "</p>" +
          '<p style="font-size:12.5px;color:var(--ink-2);margin-top:8px">' + esc(x.k.charge) + "</p>" +
          '<div class="kv" style="margin-top:9px"><span class="k">Next meeting</span><span class="v">' + dLabel(x.k.next) + "</span></div>" +
          (x.k.budget ? '<div class="kv"><span class="k">Budget used</span><span class="v num">' + money0(x.k.spent) + " of " + money0(x.k.budget) + "</span></div>" : "") +
          '<button class="btn ghost block" style="margin-top:10px" data-action="app-channel-jump" data-id="' + esc(x.k.name) + '">Open committee chat</button></div>';
      }).join("") : '<div class="acard"><p class="asub">You are not on a committee yet. Tell the Polemarch which one you want.</p></div>');
    }
    if (state.moreView === "service") {
      var mineS = db.service.filter(function (s) { return s.memberId === ME; });
      var fromEv = eventsAttended(ME);
      return backBtn() + '<div class="acard balance"><div class="bl">Service hours this year</div><div class="bv">' + totalHours(ME) + "</div>" +
        '<div class="bn">Chapter goal is 20 hours</div><button class="btn block" data-action="log-service-app">Log hours</button></div>' +
        '<div class="asec">From chapter events</div><div class="acard flush">' + (fromEv.map(function (e) {
          return '<div class="vrow"><div><div class="vn">' + esc(e.title) + '</div><div class="vm">' + dLabel(e.date) + '</div></div><span class="sp"></span><span class="num" style="font-weight:600">' + (e.hours || 0) + " hrs</span></div>";
        }).join("") || '<div class="empty">None yet.</div>') + "</div>" +
        '<div class="asec">Logged on your own</div><div class="acard flush">' + (mineS.map(function (s) {
          return '<div class="vrow"><div><div class="vn">' + esc(s.what) + '</div><div class="vm">' + dLabel(s.date) + '</div></div><span class="sp"></span>' +
            '<span class="chip ' + (s.status === "approved" ? "paid" : "due") + '">' + s.hours + " hrs</span></div>";
        }).join("") || '<div class="empty">Nothing logged yet.</div>') + "</div>";
    }
    if (state.moreView === "profile") {
      return backBtn() + '<div class="prof-hero">' +
        '<button class="prof-photo" data-action="change-photo" aria-label="Change photo">' + av(m, 78) + '<span class="prof-cam">' + icon("cal", 13) + "</span></button>" +
        '<div class="prof-name">' + esc(full(m)) + '</div><div class="prof-role">' + esc(m.jobTitle) + " &middot; " + esc(m.employer) + "</div>" +
        '<div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-top:9px">' +
        (isFin(ME) ? '<span class="chip paid">Financial</span>' : '<span class="chip late">Owes ' + money0(balanceOf(ME)) + "</span>") +
        '<span class="chip neutral">Initiated ' + m.initYear + '</span><span class="chip brand">' + esc(m.lineName) + " &middot; #" + m.lineNum + "</span></div></div>" +
        '<button class="statcard" data-action="more-view" data-v="service"><span class="sc-h">Your year so far<span class="sc-a">&rsaquo;</span></span>' +
        '<span class="sc-row">' + [[Math.round(attRate(ME) * 100) + "%", "Attendance"], [String(totalHours(ME)), "Service hrs"],
          [String(eventsAttended(ME).length), "Events"], [String(committeesOf(ME).length), "Committees"]].map(function (x) {
          return '<span class="sc-c"><b>' + x[0] + "</b>" + x[1] + "</span>";
        }).join("") + "</span></button>" +
        '<div class="acard"><div class="kv"><span class="k">Chapter of initiation</span><span class="v">' + esc(m.initChapter) + "</span></div>" +
        '<div class="kv"><span class="k">Birthday</span><span class="v">' + bdayLabel(m.bday) + "</span></div>" +
        '<div class="kv"><span class="k">Email</span><span class="v">' + esc(m.email) + "</span></div>" +
        '<div class="kv"><span class="k">Phone</span><span class="v">' + esc(m.phone) + "</span></div>" +
        '<div class="kv"><span class="k">City</span><span class="v">' + esc(m.city) + "</span></div>" +
        '<div class="kv"><span class="k">Shirt size</span><span class="v">' + esc(m.shirt) + "</span></div></div>" +
        '<div style="display:flex;gap:7px"><button class="btn ghost" style="flex:1;justify-content:center" data-action="change-photo">Update photo</button>' +
        '<button class="btn ghost" style="flex:1;justify-content:center" data-action="edit-profile">Edit details</button></div>' +
        '<p style="font-size:11px;color:var(--muted);padding:9px 4px 0">What you change here updates the chapter roster instantly. Officers never retype it. Nobody outside the chapter sees any of it, in any organization.</p>';
    }
    var rows = [["profile", "My record", "Contact, career, line"], ["committees", "My committees", committeesOf(ME).length + " assigned"],
      ["directory", "Brother directory", actives().length + " brothers"], ["vault", "Vault", db.docs.filter(function (d) { return d.vis === "all"; }).length + " documents"],
      ["service", "Service hours", totalHours(ME) + " hrs"]];
    return '<div class="acard flush">' + rows.map(function (r) {
      return '<button class="morerow" data-action="more-view" data-v="' + r[0] + '"><span>' + r[1] + '</span><span class="sp"></span><span class="cnt">' + r[2] + '</span><span style="color:var(--muted)">&rsaquo;</span></button>';
    }).join("") + "</div>" +
      '<div class="acard" style="margin-top:12px"><h3>' + esc(db.chapter.name) + '</h3><p class="asub">Chartered ' + db.chapter.founded + " &middot; " + esc(db.chapter.district) + "</p>" +
      '<div class="kv" style="margin-top:9px"><span class="k">Active brothers</span><span class="v num">' + actives().length + "</span></div>" +
      '<div class="kv"><span class="k">Committees</span><span class="v num">' + db.committees.length + "</span></div>" +
      '<div class="kv"><span class="k">Service hours YTD</span><span class="v num">' + totalService() + "</span></div></div>";
  }

  /* -------------------------------------------------------- modal */
  function openSheet(title, body, foot) {
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = body;
    $("#sheetFoot").innerHTML = foot || "";
    $("#sheetBody").scrollTop = 0;
    $("#appSheet").hidden = false;
  }
  function closeSheet() { $("#appSheet").hidden = true; }
  function openModal(title, body, foot, wide, fixed) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = body;
    $("#modalFoot").innerHTML = foot || "";
    var mo = document.querySelector(".modal");
    mo.classList.toggle("wide", !!wide);
    mo.classList.toggle("auto", !fixed);
    $("#modalBody").scrollTop = 0;
    $("#modalRoot").hidden = false;
  }
  function closeModal() { $("#modalRoot").hidden = true; }
  function segWire(id) {
    var g = $("#" + id); if (!g) return;
    g.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      Array.prototype.forEach.call(g.children, function (c) { c.classList.remove("on"); });
      b.classList.add("on");
    });
  }
  function feeTable(amount) {
    var m = state.checkout.method, fee = m === "ach" ? achFee(amount) : cardFee(amount);
    var saves = cardFee(amount) - achFee(amount);
    return '<div class="segment" style="margin-bottom:12px">' +
      '<button data-action="method" data-m="ach" class="' + (m === "ach" ? "on" : "") + '">Bank account</button>' +
      '<button data-action="method" data-m="card" class="' + (m === "card" ? "on" : "") + '">Debit or credit</button></div>' +
      '<div class="feeline"><span>To the chapter</span><span class="num">' + money(amount) + "</span></div>" +
      '<div class="feeline"><span>Processing fee <button class="infodot" data-action="fee-info" aria-label="About this fee">i</button>' +
      '<span class="feenote">' + (m === "ach" ? "0.8%, capped at $5" : "2.9% + $0.30") + "</span></span>" +
      '<span class="num">' + money(fee) + "</span></div>" +
      '<div class="feeline tot"><span>You pay</span><span class="num">' + money(amount + fee) + "</span></div>" +
      '<div class="platfee">Quorum takes <b>$0.00</b> of this. The chapter receives ' + money(amount) + " in full.</div>" +
      (m === "card" && saves > 0.5
        ? '<div class="savebox">Paying by bank instead would cost <b>' + money(achFee(amount)) + "</b> rather than " + money(fee) +
          ", saving you " + money(saves) + ".</div>"
        : "");
  }
  function checkoutModal(o) {
    state.ctx = o;
    var fee = state.checkout.method === "ach" ? achFee(o.amount) : cardFee(o.amount);
    var render2 = o.phone ? openSheet : openModal;
    render2(o.modalTitle || "Pay",
      '<div class="checkout"><div class="co-org">' + esc(db.chapter.name) + "</div>" +
      '<div class="co-t">' + esc(o.title) + '</div><p style="font-size:12.5px;color:var(--muted)">' + esc(o.subtitle || "") + "</p>" +
      '<div class="co-a">' + money(o.amount) + "</div>" +
      (o.qtyPicker ? '<div class="field" style="margin:13px 0 4px"><label>Tickets</label><div class="segment">' +
        [1, 2, 3, 4].map(function (n) { return '<button data-action="qty" data-n="' + n + '" class="' + (state.checkout.qty === n ? "on" : "") + '">' + n + "</button>"; }).join("") + "</div></div>" : "") +
      '<div style="margin-top:15px">' + feeTable(o.amount) + "</div>" +
      (o.note ? '<p style="font-size:11.5px;color:var(--muted);margin-top:11px">' + o.note + "</p>" : "") + "</div>",
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="confirm-pay">Pay ' + money(o.amount + fee) + "</button>");
  }

  /* ------------------------------------------------------- actions */
  var A = {};
  A["att-event"] = function (el) { state.attEvent = el.dataset.id; renderDash(); window.scrollTo(0, 0); };
  A["att-back"] = function () { state.attEvent = null; renderDash(); };
  A["view"] = function (el) { state.view = el.dataset.view; state.komId = null; state.attEvent = null; state.evId = null; state.budgetEdit = false; if (el.dataset.filter) state.filter = el.dataset.filter; render(); };
  A["role"] = function (el) { state.role = el.dataset.r; state.view = "home"; state.komId = null; render(); };
  A["tab"] = function (el) {
    state.tab = el.dataset.t;
    if (el.dataset.t !== "more") state.moreView = null;
    /* tapping Messages while inside a room backs out to the list, as it does on iOS */
    if (el.dataset.t === "chat") state.appChannel = null;
    renderApp();
  };
  A["chat-back"] = function () { state.appChannel = null; renderApp(); };
  A["more-view"] = function (el) { state.moreView = el.dataset.v || null; state.tab = "more"; renderApp(); };
  A["filter"] = function (el) { state.filter = el.dataset.f; render(); };
  A["clear-sel"] = function () { state.selected = {}; render(); };
  A["select"] = function (el) { state.selected[el.dataset.id] = el.checked; render(); };
  A["close-modal"] = function () { closeModal(); closeSheet(); };
  A["close-sheet"] = closeSheet;
  A["copy"] = function (el) { if (navigator.clipboard) navigator.clipboard.writeText(el.dataset.v).catch(function () {}); el.textContent = "Copied"; setTimeout(function () { el.textContent = "Copy"; }, 1400); };
  A["accent"] = function (el) { db.chapter.accent = el.dataset.c; document.documentElement.style.setProperty("--brand", el.dataset.c); toast("Chapter accent updated", "brothers see it on next open"); render(); };
  A["titles"] = function (el) { db.chapter.titles = el.dataset.t; toast("Officer titles updated", "across every screen and export"); render(); };
  A["channel"] = function (el) { state.channel = el.dataset.id; renderDash(); };
  A["app-channel"] = function (el) { state.appChannel = el.dataset.id; renderApp(); var b = $("#appBody"); if (b) b.scrollTop = 0; };
  A["app-channel-jump"] = function (el) {
    var c = db.channels.filter(function (x) { return x.name === el.dataset.id; })[0];
    if (c) { state.appChannel = c.id; state.tab = "chat"; state.moreView = null; renderApp(); }
    else toast("Committee chat opens here", "every committee gets one in the live product");
  };
  A["locked-channel"] = function () { toast("Executive Board is officers only", "Andre cannot see it, or see that it has traffic"); };
  A["mark-read"] = function () { db.notes.forEach(function (n) { n.read = true; }); renderApp(); };

  A["approve"] = function (el) {
    var m = member(el.dataset.id);
    m.status = "active"; m.requested = null; m.joined = TODAY.getFullYear();
    logA(full(m) + " was approved and added to the roster");
    notify("bell", full(m) + " joined the chapter", "Approved by " + full(member(ROLE_MEMBER[state.role])) + ". He can now see chapter messages, documents and committees.");
    toast(full(m) + " approved", "roster, directory and channels updated");
    closeModal(); render();
  };

  A["profile"] = function (el) { state.ctx = { id: el.dataset.id }; state.profileTab = "profile"; renderProfile(); };
  A["profile-tab"] = function (el) { state.profileTab = el.dataset.t; renderProfile(0); };
  function renderProfile(keepScroll) {
    var m = member(state.ctx.id), bal = balanceOf(m.id), a = Math.round(attRate(m.id) * 100);
    var tabs = [["profile", "Profile"], ["dues", "Dues"], ["attendance", "Attendance"], ["committees", "Committees"]];
    var body = "";
    if (state.profileTab === "profile") {
      body = '<div class="row2"><div>' +
        '<div class="kv"><span class="k">Email</span><span class="v">' + esc(m.email) + "</span></div>" +
        '<div class="kv"><span class="k">Phone</span><span class="v">' + esc(m.phone) + "</span></div>" +
        '<div class="kv"><span class="k">Address</span><span class="v" style="font-size:11.5px">' + esc(m.address) + "</span></div>" +
        '<div class="kv"><span class="k">Birthday</span><span class="v">' + bdayLabel(m.bday) + "</span></div>" +
        '<div class="kv"><span class="k">Shirt size</span><span class="v">' + esc(m.shirt) + "</span></div>" +
        '<div class="kv"><span class="k">Emergency contact</span><span class="v" style="font-size:11.5px">' + esc(m.emergency) + "</span></div></div><div>" +
        '<div class="kv"><span class="k">Employer</span><span class="v">' + esc(m.employer) + "</span></div>" +
        '<div class="kv"><span class="k">Title</span><span class="v">' + esc(m.jobTitle) + "</span></div>" +
        '<div class="kv"><span class="k">Industry</span><span class="v">' + esc(m.industry) + "</span></div>" +
        '<div class="kv"><span class="k">Initiated</span><span class="v">' + m.initYear + ", " + esc(m.initChapter) + "</span></div>" +
        '<div class="kv"><span class="k">Line</span><span class="v">' + esc(m.lineName) + " &middot; #" + m.lineNum + "</span></div>" +
        '<div class="kv"><span class="k">Joined this chapter</span><span class="v">' + (m.joined || "Pending") + "</span></div></div></div>" +
        '<div class="banner" style="margin-bottom:0"><b>Who can see this.</b> Officers on this chapter roster. Career and contact details are visible to brothers in the directory; address, birthday and emergency contact stay with the officer line.</div>';
    } else if (state.profileTab === "dues") {
      body = db.bills.map(function (b) {
        var p = paidBy(m.id, b.id);
        return '<div class="kv"><span class="k">' + esc(b.title) + '<br><span style="font-size:10.5px">due ' + dLabel(b.due) + "</span></span>" +
          '<span class="v">' + (p >= b.amount ? '<span class="chip paid">Paid ' + money(p) + "</span>" : '<span class="chip late">' + money(b.amount - p) + " owed</span>") + "</span></div>";
      }).join("") +
      '<div class="kv" style="border-top:2px solid var(--line-2);margin-top:6px"><span class="k">Total balance</span><span class="v num" style="font-size:16px">' + money(bal) + "</span></div>" +
      '<div class="asec" style="margin-top:14px">Payment history</div><div class="card"><div class="card-b flush">' +
      (db.payments.filter(function (p) { return p.memberId === m.id; }).map(function (p) {
        var b = bill(p.billId);
        return '<div class="docrow"><div><div class="dn">' + esc(b ? b.title : "Event ticket") + '</div><div class="dm">' + dLabel(p.date) + " &middot; " + p.method + "</div></div>" +
          '<span class="sp"></span><span class="num" style="font-weight:600">' + money(p.amount) + "</span></div>";
      }).join("") || '<div class="empty">No payments recorded.</div>') + "</div></div>";
    } else if (state.profileTab === "attendance") {
      body = '<div style="display:flex;gap:22px;margin-bottom:14px">' +
        '<div><div style="font-size:11px;color:var(--muted)">Attendance rate</div><div class="num" style="font-size:24px;font-weight:700;color:' +
        (a >= 80 ? "var(--paid)" : a < 60 ? "var(--late)" : "var(--ink)") + '">' + a + "%</div></div>" +
        '<div><div style="font-size:11px;color:var(--muted)">Events attended</div><div class="num" style="font-size:24px;font-weight:700">' + eventsAttended(m.id).length + "</div></div>" +
        '<div><div style="font-size:11px;color:var(--muted)">Service hours</div><div class="num" style="font-size:24px;font-weight:700">' + totalHours(m.id) + "</div></div></div>" +
        '<div class="card"><div class="card-b flush">' + pastEvents().map(function (e) {
          var inn = e.checkedIn.indexOf(m.id) > -1;
          var exc = db.excuses.some(function (x) { return x.memberId === m.id && x.eventId === e.id && x.status === "approved"; });
          return '<div class="docrow"><div><div class="dn">' + esc(e.title) + '</div><div class="dm">' + dLabel(e.date) + " &middot; " + catOf(e.cat).label + (e.mandatory ? " &middot; mandatory" : "") + "</div></div>" +
            '<span class="sp"></span><span class="chip ' + (inn ? "paid" : exc ? "due" : "late") + '">' + (inn ? "Attended" : exc ? "Excused" : "Absent") + "</span></div>";
        }).join("") + "</div></div>";
    } else {
      var cs = committeesOf(m.id);
      body = (cs.length ? cs.map(function (x) {
        return '<div class="docrow"><span style="width:9px;height:34px;border-radius:3px;background:' + catOf(x.k.cat).color + ';flex:none"></span>' +
          '<div><div class="dn">' + esc(x.k.name) + ' <span class="chip ' + (x.role === "Chair" ? "brand" : "neutral") + '">' + esc(x.role) + "</span></div>" +
          '<div class="dm">Meets ' + esc(x.k.meets) + " &middot; next " + dLabel(x.k.next) + "</div></div></div>";
      }).join("") : '<div class="empty">Not assigned to a committee yet.</div>') +
      '<div style="margin-top:13px"><button class="btn ghost" data-action="assign" data-id="' + m.id + '">Assign to a committee</button></div>';
    }
    openModal(full(m),
      '<div class="prof-h">' + av(m) +
      '<div><div class="pn">' + esc(full(m)) + '</div><div class="pm">' + m.roles.join(" &middot; ") + " &middot; " + esc(m.jobTitle) + ", " + esc(m.employer) + "</div>" +
      '<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">' +
      (m.status === "pending" ? '<span class="chip due">Pending approval</span>' : bal <= 0 ? '<span class="chip paid">Financial</span>' : '<span class="chip late">Owes ' + money0(bal) + "</span>") +
      (m.lifeMember ? '<span class="chip brand">Life member</span>' : "") +
      '<span class="chip neutral">' + a + "% attendance</span></div></div></div>" +
      '<div class="mtabs" style="margin:0 -17px 15px">' + tabs.map(function (t) {
        return '<button class="mtab' + (state.profileTab === t[0] ? " on" : "") + '" data-action="profile-tab" data-t="' + t[0] + '">' + t[1] + "</button>";
      }).join("") + "</div>" + body,
      '<button class="btn ghost" data-action="close-modal">Close</button>' +
      (m.status === "pending" ? '<button class="btn" data-action="approve" data-id="' + m.id + '">Approve candidate</button>'
        : (can("dues") && bal > 0 ? '<button class="btn" data-action="share-bill" data-id="' + db.bills[0].id + '" data-member="' + m.id + '">Send payment link</button>' : "")), true, true);
    if (keepScroll) $("#modalBody").scrollTop = keepScroll;
  }

  A["committee"] = function (el) {
    var k = kom(el.dataset.id), ch = member(k.chair);
    var mem = k.members.map(function (nm) { return db.members.filter(function (m) { return full(m) === nm; })[0]; }).filter(Boolean);
    openModal(k.name,
      '<div style="display:flex;gap:5px;margin-bottom:12px">' + catChip(k.cat) + '<span class="chip neutral">Meets ' + esc(k.meets) + "</span></div>" +
      '<p style="font-size:13.5px;color:var(--ink-2);margin-bottom:14px">' + esc(k.charge) + "</p>" +
      '<div class="row3" style="margin-bottom:15px">' +
      '<div><div style="font-size:11px;color:var(--muted)">Budget</div><div class="num" style="font-size:19px;font-weight:700">' + (k.budget ? money0(k.budget) : "—") + "</div></div>" +
      '<div><div style="font-size:11px;color:var(--muted)">Spent</div><div class="num" style="font-size:19px;font-weight:700">' + money0(k.spent) + "</div></div>" +
      '<div><div style="font-size:11px;color:var(--muted)">Next meeting</div><div style="font-size:14px;font-weight:700;padding-top:3px">' + dLabel(k.next) + "</div></div></div>" +
      '<div class="asec">Chair</div><div class="card" style="margin-bottom:12px"><div class="card-b flush"><div class="docrow">' +
      av(ch) +
      '<div><div class="dn">' + esc(full(ch)) + '</div><div class="dm">' + esc(ch.jobTitle) + " &middot; " + esc(ch.employer) + "</div></div>" +
      '<span class="sp"></span><span class="chip brand">Chair</span></div></div></div>' +
      '<div class="asec">Members (' + mem.length + ')</div><div class="card"><div class="card-b flush">' + mem.map(function (m) {
        return '<div class="docrow">' + av(m) +
          '<div><div class="dn">' + esc(full(m)) + '</div><div class="dm">' + esc(m.jobTitle) + " &middot; " + esc(m.industry) + "</div></div>" +
          '<span class="sp"></span><button class="btn ghost sm" data-action="profile" data-id="' + m.id + '">Open</button></div>';
      }).join("") + "</div></div>",
      '<button class="btn ghost" data-action="close-modal">Close</button>' +
      '<button class="btn ghost" data-action="bulk-message">Message the committee</button>' +
      '<button class="btn" data-action="assign" data-committee="' + k.id + '">Add a brother</button>', true);
  };

  A["assign"] = function (el) {
    var kid = el.dataset.committee || db.committees[0].id, mid = el.dataset.id || "";
    openModal("Assign to a committee",
      '<div class="field"><label>Brother</label><select id="asgM">' + actives().map(function (m) {
        return '<option value="' + m.id + '"' + (m.id === mid ? " selected" : "") + ">" + esc(full(m)) + " — " + esc(m.industry) + (m.committees.length ? "" : " (unassigned)") + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Committee</label><select id="asgK">' + db.committees.map(function (k) {
        return '<option value="' + k.id + '"' + (k.id === kid ? " selected" : "") + ">" + esc(k.name) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Role</label><div class="segment" id="asgR"><button type="button" data-r="Member" class="on">Member</button><button type="button" data-r="Chair">Chair</button></div></div>' +
      '<label class="checkline"><input type="checkbox" checked><span>Add him to the committee channel and notify him</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-assign">Assign</button>');
    segWire("asgR");
  };
  A["save-assign"] = function () {
    var m = member($("#asgM").value), k = kom($("#asgK").value), role = $("#asgR").querySelector(".on").dataset.r;
    if (role === "Chair") k.chair = m.id;
    else if (k.members.indexOf(full(m)) < 0) k.members.push(full(m));
    if (!m.committees.some(function (c) { return c.id === k.id; })) m.committees.push({ id: k.id, role: role });
    logA(full(m) + " joined " + k.name + " as " + role);
    notify("bell", "You were added to " + k.name, "As " + role + ". The committee meets " + k.meets + ". Next meeting " + dLabel(k.next) + ".");
    toast(full(m) + " added to " + k.name, "channel access granted");
    closeModal(); render();
  };

  A["new-committee"] = function () {
    openModal("New committee",
      '<div class="field"><label>Name</label><input type="text" id="ncN" value="Veterans Affairs"></div>' +
      '<div class="field"><label>Program area</label><div class="catgrid" id="ncCat">' + Object.keys(db.cats).map(function (k, i) {
        return '<button type="button" class="catpick' + (i === 2 ? " on" : "") + '" data-c="' + k + '"><i style="background:' + db.cats[k].color + '"></i>' + esc(db.cats[k].label) + "</button>";
      }).join("") + "</div></div>" +
      '<div class="field"><label>Charge</label><textarea id="ncC" rows="2">Serve brothers who served, and connect them to benefits they have earned.</textarea></div>' +
      '<div class="row2"><div class="field"><label>Chair</label><select id="ncCh">' + actives().map(function (m) { return '<option value="' + m.id + '">' + esc(full(m)) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>Budget</label><input type="number" id="ncB" value="1500"></div></div>' +
      '<label class="checkline"><input type="checkbox" checked><span>Create a private committee channel and a budget line</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-committee">Create</button>');
    segWire("ncCat");
  };
  A["save-committee"] = function () {
    var k = { id: uid("k"), name: $("#ncN").value.trim() || "New committee", cat: $("#ncCat").querySelector(".on").dataset.c,
      chair: $("#ncCh").value, charge: $("#ncC").value.trim(), budget: Number($("#ncB").value) || 0, spent: 0,
      meets: "To be set", next: "2026-12-01", members: [] };
    db.committees.push(k);
    member(k.chair).committees.push({ id: k.id, role: "Chair" });
    db.channels.push({ id: uid("c"), name: k.name, vis: "all", desc: "Committee · 1 member", msgs: [] });
    db.budget.push({ line: k.name, cat: "Expense", planned: k.budget, actual: 0 });
    logA(k.name + " committee created, chaired by " + full(member(k.chair)));
    notify("bell", "New committee: " + k.name, k.charge);
    toast("Committee created", "channel and budget line added");
    closeModal(); state.view = "committees"; render();
  };
  A["committee-report"] = function () {
    var rows = db.committees.map(function (k) { return [k.name, catOf(k.cat).label, full(member(k.chair)), k.members.length + 1, k.budget, k.spent].join(","); });
    openModal("Committee report",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">What the province report asks for every spring, already assembled.</p>' +
      '<pre style="background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;padding:12px;overflow:auto;max-height:280px;font-family:var(--mono);font-size:11.5px;margin:0">Committee,Program Area,Chair,Members,Budget,Spent\n' +
      esc(rows.join("\n")) + "</pre>", '<button class="btn ghost" data-action="close-modal">Close</button>');
  };
  A["program-report"] = function () {
    var byCat = {};
    db.events.forEach(function (e) {
      byCat[e.cat] = byCat[e.cat] || { n: 0, att: 0, hrs: 0, rev: 0 };
      byCat[e.cat].n++;
      byCat[e.cat].att += isPast(e) ? e.checkedIn.length : e.rsvps.length;
      byCat[e.cat].hrs += (isPast(e) ? e.checkedIn.length : 0) * (e.hours || 0);
      byCat[e.cat].rev += e.tickets.reduce(function (s, t) { return s + t.paid; }, 0);
    });
    openModal("Program report 2026–27",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:13px">Because every event is tagged, the annual report is a query, not a weekend.</p>' +
      '<div class="card"><div class="card-b flush"><div class="tw"><table><thead><tr><th>Program area</th><th class="r">Events</th><th class="r">Participation</th><th class="r">Service hrs</th><th class="r">Raised</th></tr></thead><tbody>' +
      Object.keys(byCat).map(function (k) {
        var v = byCat[k];
        return "<tr><td>" + catChip(k) + '</td><td class="money-c r">' + v.n + '</td><td class="money-c r">' + v.att + '</td><td class="money-c r">' + v.hrs + '</td><td class="money-c r">' + (v.rev ? money0(v.rev) : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div></div></div>",
      '<button class="btn ghost" data-action="close-modal">Close</button><button class="btn" data-action="export">Export</button>', true);
  };

  A["new-bill"] = function () {
    openModal("Bill the chapter",
      '<div class="field"><label>What is this for</label><input type="text" id="bTitle" value="Founders Day Assessment"></div>' +
      '<div class="row3"><div class="field"><label>Amount per brother</label><input type="number" id="bAmount" value="60" min="1"></div>' +
      '<div class="field"><label>Due date</label><input type="date" id="bDue" value="2026-11-10"></div>' +
      '<div class="field"><label>Cadence</label><select id="bCad"><option value="one-time">Once</option><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div></div>' +
      '<div class="attach"><div class="attach-h">Connect this to something</div>' +
      '<div class="row2"><div class="field"><label>An event</label><select id="bEvent" data-action="bill-event">' +
      '<option value="">Not attached &middot; a plain chapter assessment</option>' +
      upcoming().map(function (x) {
        return '<option value="' + x.id + '">' + esc(x.title) + " &middot; " + dShort(x.date) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>A committee budget line</label><select id="bKom">' +
      '<option value="">Chapter general fund</option>' +
      db.committees.map(function (k) { return '<option value="' + k.id + '">' + esc(k.name) + "</option>"; }).join("") +
      "</select></div></div>" +
      '<p class="attach-n" id="bAttachNote">Attach it to an event and the money, the RSVPs and the check-in all sit on one page. ' +
      "Credit a committee and it lands on that committee&rsquo;s budget instead of the general fund.</p></div>" +
      '<div class="field"><label>Program area</label><div class="catgrid" id="bCat">' + Object.keys(db.cats).slice(0, 6).map(function (k, i) {
        return '<button type="button" class="catpick' + (i === 0 ? " on" : "") + '" data-c="' + k + '"><i style="background:' + db.cats[k].color + '"></i>' + esc(db.cats[k].label) + "</button>";
      }).join("") + "</div></div>" +
      '<label class="checkline"><input type="checkbox" id="bInstall" checked><span>Let brothers split this into monthly installments</span></label>' +
      '<label class="checkline"><input type="checkbox" id="bNotify" checked><span>Notify all ' + actives().length + " active brothers and send each one a payment link</span></label>",
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="create-bill">Create bill</button>');
    segWire("bCat");
  };
  A["bill-event"] = function (el) {
    var e = ev(el.value), note = $("#bAttachNote");
    if (!e) {
      if (note) note.textContent = "Attach it to an event and the money, the RSVPs and the check-in all sit on one page. " +
        "Credit a committee and it lands on that committee\u2019s budget instead of the general fund.";
      return;
    }
    var t = $("#bTitle"); if (t) t.value = e.title + (e.price ? " ticket" : " assessment");
    var d = $("#bDue");
    if (d) { var day = new Date(e.date + "T12:00:00"); day.setDate(day.getDate() - 1); d.value = day.toISOString().slice(0, 10); }
    if (e.price) { var a = $("#bAmount"); if (a) a.value = e.price; }
    var grid = $("#bCat");
    if (grid) {
      var hit = grid.querySelector('[data-c="' + e.cat + '"]');
      if (!hit) {
        /* the grid only shows six areas, and the event may belong to one of the others */
        var c = catOf(e.cat);
        hit = document.createElement("button");
        hit.type = "button";
        hit.className = "catpick";
        hit.dataset.c = e.cat;
        hit.innerHTML = '<i style="background:' + c.color + '"></i>' + esc(c.label);
        grid.appendChild(hit);
      }
      grid.querySelectorAll(".catpick").forEach(function (b) { b.classList.remove("on"); });
      hit.classList.add("on");
    }
    if (note) note.textContent = "Billed against " + e.title + " on " + dLabel(e.date) +
      ". The " + e.rsvps.length + " brothers already going get it first, and it shows on the event page next to the check-in.";
  };

  A["create-bill"] = function () {
    var b = { id: uid("b"), code: rcode(), title: $("#bTitle").value.trim() || "Chapter assessment",
      amount: Math.max(1, Number($("#bAmount").value) || 0), cadence: $("#bCad").value, due: $("#bDue").value || "2026-12-01",
      created: isoToday(), plan: $("#bInstall").checked, cat: $("#bCat").querySelector(".on").dataset.c,
      eventId: $("#bEvent") ? ($("#bEvent").value || null) : null,
      komId: $("#bKom") ? ($("#bKom").value || null) : null };
    db.bills.push(b);
    var att = b.eventId ? ev(b.eventId) : null, akom = b.komId ? kom(b.komId) : null;
    logA(b.title + " created · " + money(b.amount) + " per brother, due " + dLabel(b.due) +
      (att ? " · attached to " + att.title : "") + (akom ? " · credited to " + akom.name : ""));
    if ($("#bNotify").checked) {
      notify("money", b.title + " is now open", money(b.amount) + " due " + dLabel(b.due) +
        (att ? " for " + att.title + "." : ".") + " Tap to pay by bank or card." + (b.plan ? " Monthly installments available." : ""));
      toast(actives().length + " brothers notified", money(b.amount) + " each, payment link sent");
    }
    closeModal(); state.view = "dues"; render();
    setTimeout(function () { A["share-bill"]({ dataset: { id: b.id } }); }, 160);
  };
  A["share-bill"] = function (el) {
    var b = bill(el.dataset.id), who = el.dataset.member ? member(el.dataset.member) : null;
    var url = "https://quorum.app/p/" + b.code + (who ? "-" + who.id : "");
    var unpaid = actives().filter(function (m) { return paidBy(m.id, b.id) < b.amount; });
    openModal(who ? "Payment link for " + full(who) : "Payment link · " + b.title,
      linkBlock(url, who ? "Personal link for " + full(who) : "Chapter payment link") + qrBlock(url, url.replace("https://", "")) +
      '<div class="banner"><b>How brothers use it.</b> Text it, email it, print the QR on the meeting agenda. It opens a page with your chapter name, the amount, and a choice of bank or card. The chapter receives the full ' +
      money(b.amount) + " either way.</div>" +
      '<p style="font-size:12.5px;color:var(--muted)">' + unpaid.length + " of " + actives().length + " brothers have not paid this bill.</p>",
      '<button class="btn ghost" data-action="close-modal">Done</button>' +
      '<button class="btn ghost" data-action="preview-pay" data-id="' + b.id + '">Preview the page</button>' +
      (unpaid.length ? '<button class="btn" data-action="chase" data-id="' + b.id + '">Send to ' + unpaid.length + " unpaid</button>" : ""));
  };
  A["preview-pay"] = function (el) {
    var b = bill(el.dataset.id), owed = b.amount - paidBy(ME, b.id);
    state.checkout.method = "ach";
    checkoutModal({ modalTitle: "quorum.app/p/" + b.code, title: b.title, subtitle: "Due " + dLabel(b.due) + " · " + db.chapter.name,
      amount: owed > 0 ? owed : b.amount, billId: b.id, kind: "bill",
      note: "This is the page a brother sees when he taps the link. Paying here records against " + myName() + " so you can watch both surfaces update." });
  };
  A["method"] = function (el) { state.checkout.method = el.dataset.m; checkoutModal(state.ctx); };
  A["fee-info"] = function () {
    toast("This fee goes to Stripe, not to Quorum", "bank 0.8% capped at $5 \u00b7 card 2.9% + 30\u00a2");
  };
  A["sort"] = function (el) {
    if (state.sort === el.dataset.s) state.sortDir = (state.sortDir || 1) * -1;
    else { state.sort = el.dataset.s; state.sortDir = 1; }
    renderDash();
  };
  A["qty"] = function (el) { state.checkout.qty = Number(el.dataset.n); state.ctx.amount = state.ctx.unit * state.checkout.qty; checkoutModal(state.ctx); };
  A["confirm-pay"] = function () {
    var o = state.ctx, fee = state.checkout.method === "ach" ? achFee(o.amount) : cardFee(o.amount);
    if (o.kind === "ticket") {
      var e = ev(o.eventId);
      e.tickets.push({ memberId: ME, qty: state.checkout.qty || 1, paid: o.amount });
      if (e.rsvps.indexOf(ME) < 0) e.rsvps.push(ME);
      db.payments.push({ id: uid("p"), memberId: ME, billId: null, amount: o.amount, method: state.checkout.method, date: isoToday() });
      logA(myName() + " bought " + (state.checkout.qty || 1) + " ticket(s) to " + e.title + " · " + money(o.amount));
      toast("Ticket purchased", money(o.amount) + " to the chapter, " + money(fee) + " in fees");
      closeModal(); closeSheet(); state.tab = "events"; state.moreView = null; render();
      setTimeout(function () { A["my-ticket"]({ dataset: { id: e.id } }); }, 180);
      return;
    }
    if (o.kind === "balance") {
      /* one tap, several bills: pour the money into each open bill in due-date
         order until it runs out, so nothing is ever overpaid. */
      var left = o.amount, hit = [];
      openBills(ME).forEach(function (ob) {
        if (left <= 0) return;
        var owed = ob.amount - paidBy(ME, ob.id), take = Math.min(owed, left);
        if (take <= 0) return;
        db.payments.push({ id: uid("p"), memberId: ME, billId: ob.id, amount: take,
          method: state.checkout.method, date: isoToday() });
        left -= take; hit.push(ob.title);
      });
      logA(myName() + " paid " + money(o.amount) + " \u00b7 cleared " + hit.length + " bill" + (hit.length === 1 ? "" : "s"));
      notify("money", "Payment received", money(o.amount) + " across " + hit.length + " bill" +
        (hit.length === 1 ? "" : "s") + ". Your receipts are in the Dues tab.");
      toast("Balance cleared", hit.join(" \u00b7 "));
      closeModal(); closeSheet(); render();
      return;
    }
    var b = bill(o.billId);
    db.payments.push({ id: uid("p"), memberId: ME, billId: b.id, amount: o.amount, method: state.checkout.method, date: isoToday() });
    logA(myName() + " paid " + money(o.amount) + " toward " + b.title);
    notify("money", "Payment received", money(o.amount) + " toward " + b.title + ". Your receipt is in the Dues tab.");
    toast("Payment recorded", money(o.amount) + " \u00b7 chapter total updated");
    closeModal(); closeSheet(); render();
  };
  A["pay-all"] = function () {
    var bal = balanceOf(ME), open = openBills(ME);
    state.checkout.method = "ach";
    checkoutModal({ modalTitle: "Pay your balance", title: "Chapter balance", subtitle: db.chapter.name,
      amount: bal, billId: open.length ? open[0].id : null, kind: "balance", phone: true,
      note: "This clears " + open.length + " open bill" + (open.length === 1 ? "" : "s") +
        ". The money is split across them in due-date order." });
  };
  A["pay-bill"] = function (el) {
    var b = bill(el.dataset.id), owed = b.amount - paidBy(ME, b.id);
    state.checkout.method = "ach";
    checkoutModal({ modalTitle: "Pay " + b.title, title: b.title, subtitle: "Due " + dLabel(b.due), amount: owed, billId: b.id, kind: "bill", phone: true });
  };
  A["plan"] = function (el) {
    var b = bill(el.dataset.id), owed = b.amount - paidBy(ME, b.id), n = 6, per = Math.round((owed / n) * 100) / 100;
    var dates = [0, 1, 2, 3, 4, 5].map(function (i) {
      var d = new Date(TODAY.getTime()); d.setMonth(d.getMonth() + i);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });
    openModal("Split into monthly payments",
      '<div class="checkout"><div class="co-org">' + esc(db.chapter.name) + '</div><div class="co-t">' + esc(b.title) + "</div>" +
      '<div class="co-a">' + money(per) + '<span style="font-size:14px;font-family:var(--ui);font-weight:600;color:var(--muted)"> /month</span></div>' +
      '<p style="font-size:12.5px;color:var(--muted)">' + n + " automatic payments, first one today.</p>" +
      '<div style="margin-top:14px">' + dates.map(function (d, i) {
        return '<div class="feeline"><span>Payment ' + (i + 1) + " &middot; " + d + '</span><span class="num">' + money(per + achFee(per)) + " " +
          (i === 0 ? '<span class="chip due">today</span>' : '<span class="chip neutral">scheduled</span>') + "</span></div>";
      }).join("") +
      '<div class="feeline tot"><span>Total you pay</span><span class="num">' + money(owed + achFee(per) * n) + "</span></div></div></div>" +
      '<div class="banner" style="margin-bottom:0"><b>The chapter still receives ' + money(owed) + " in full.</b> The Keeper of Exchequer sees him as current as long as the plan is on schedule.</div>",
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="start-plan" data-id="' + b.id + '">Start the plan</button>');
  };
  A["start-plan"] = function (el) {
    var b = bill(el.dataset.id), owed = b.amount - paidBy(ME, b.id), per = Math.round((owed / 6) * 100) / 100;
    db.payments.push({ id: uid("p"), memberId: ME, billId: b.id, amount: per, method: "ach", date: isoToday() });
    logA(myName() + " started a 6-month plan on " + b.title + " · " + money(per) + "/month");
    notify("money", "Payment plan started", money(per) + " a month for 6 months toward " + b.title + ". First payment taken today.");
    toast("Plan started", money(per) + "/month · counted as current");
    closeModal(); render();
  };
  A["receipt"] = function (el) {
    var p = find(db.payments, el.dataset.id), b = bill(p.billId);
    var fee = p.method === "ach" ? achFee(p.amount) : p.method === "card" ? cardFee(p.amount) : 0;
    openSheet("Receipt",
      '<div class="checkout"><div class="co-org">' + esc(db.chapter.name) + '</div><div class="co-t">' + esc(b ? b.title : "Event ticket") + "</div>" +
      '<div class="co-a">' + money(p.amount) + '</div><div style="margin-top:13px">' +
      '<div class="kv"><span class="k">Paid by</span><span class="v">' + esc(myName()) + "</span></div>" +
      '<div class="kv"><span class="k">Date</span><span class="v">' + dLabel(p.date) + "</span></div>" +
      '<div class="kv"><span class="k">Method</span><span class="v">' + (p.method === "ach" ? "Bank account" : p.method === "card" ? "Card" : "Check") + "</span></div>" +
      '<div class="kv"><span class="k">Processing fee</span><span class="v num">' + money(fee) + "</span></div>" +
      '<div class="kv"><span class="k">To the chapter</span><span class="v num">' + money(p.amount) + "</span></div>" +
      '<div class="kv"><span class="k">Reference</span><span class="v num">' + p.id.toUpperCase() + "</span></div></div></div>",
      '<button class="btn ghost" data-action="close-modal">Close</button>');
  };
  A["record-payment"] = function (el) {
    var m = member(el.dataset.id);
    var b = db.bills.filter(function (x) { return paidBy(m.id, x.id) < x.amount; })[0];
    openModal("Record a payment for " + full(m),
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:13px">He handed you a check at the meeting. Record it so the ledger matches the bank.</p>' +
      '<div class="row2"><div class="field"><label>Amount</label><input type="number" id="rAmount" value="' + (b.amount - paidBy(m.id, b.id)) + '"></div>' +
      '<div class="field"><label>Applies to</label><select id="rBill">' + db.bills.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === b.id ? " selected" : "") + ">" + esc(x.title) + "</option>";
      }).join("") + "</select></div></div>" +
      '<div class="field"><label>Method</label><select id="rMethod"><option value="check">Check</option><option value="cash">Cash</option><option value="ach">Bank transfer</option></select></div>' +
      '<p class="hint">Outstanding balance today: ' + money(balanceOf(m.id)) + "</p>",
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-payment" data-id="' + m.id + '">Record payment</button>');
  };
  A["save-payment"] = function (el) {
    var m = member(el.dataset.id), amt = Math.max(0, Number($("#rAmount").value) || 0);
    db.payments.push({ id: uid("p"), memberId: m.id, billId: $("#rBill").value, amount: amt, method: $("#rMethod").value, date: isoToday() });
    logA(full(m) + " paid " + money(amt) + " by " + $("#rMethod").value + " · recorded by " + full(member(ROLE_MEMBER[state.role])));
    toast("Recorded " + money(amt), "ledger and standing updated");
    closeModal(); render();
  };
  A["chase"] = function (el) {
    var b = bill(el.dataset.id);
    var unpaid = actives().filter(function (m) { return paidBy(m.id, b.id) < b.amount; });
    notify("money", "Reminder: " + b.title, money(b.amount) + " was due " + dLabel(b.due) + ". Tap to pay by bank or card.");
    logA("Payment reminder sent to " + unpaid.length + " brothers for " + b.title);
    toast(unpaid.length + " reminders sent", "each with a personal payment link");
    closeModal(); render();
  };

  A["new-event"] = function () {
    openModal("Create an event",
      '<div class="field"><label>Event</label><input type="text" id="eTitle" value="Guide Right Saturday Academy"></div>' +
      '<div class="row3"><div class="field"><label>Date</label><input type="date" id="eDate" value="2026-12-13"></div>' +
      '<div class="field"><label>Ticket price</label><input type="number" id="ePrice" value="0" min="0"></div>' +
      '<div class="field"><label>Service hours</label><input type="number" id="eHours" value="4" min="0"></div></div>' +
      '<div class="field"><label>Location</label><input type="text" id="ePlace" value="Booker T. Washington High School"></div>' +
      '<div class="field"><label>Program area &mdash; this is what makes your annual report write itself</label><div class="catgrid" id="eCat">' +
      Object.keys(db.cats).map(function (k) {
        return '<button type="button" class="catpick' + (k === "mentoring" ? " on" : "") + '" data-c="' + k + '"><i style="background:' + db.cats[k].color + '"></i>' + esc(db.cats[k].label) + "</button>";
      }).join("") + "</div></div>" +
      '<div class="field"><label>Who can see it</label><div class="segment" id="eVis">' +
      '<button type="button" data-v="chapter" class="on">Chapter only</button><button type="button" data-v="public">Public link &amp; QR</button></div></div>' +
      '<label class="checkline"><input type="checkbox" id="eMand"><span>Mandatory &mdash; counts toward attendance standing</span></label>' +
      '<label class="checkline"><input type="checkbox" checked><span>Open an event chat that closes two days after</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="create-event">Create</button>');
    segWire("eCat"); segWire("eVis");
  };
  A["create-event"] = function () {
    var e = { id: uid("e"), code: rcode(), title: $("#eTitle").value.trim() || "Chapter event",
      date: $("#eDate").value || "2026-12-13", time: "9:00 AM", place: $("#ePlace").value.trim() || "To be announced",
      cat: $("#eCat").querySelector(".on").dataset.c, mandatory: $("#eMand").checked,
      price: Math.max(0, Number($("#ePrice").value) || 0), hours: Math.max(0, Number($("#eHours").value) || 0),
      visibility: $("#eVis").querySelector(".on").dataset.v, rsvps: [], tickets: [], checkedIn: [] };
    db.events.push(e);
    notify("cal", e.title + (e.price ? " — tickets open" : " — RSVP open"), dLabel(e.date) + " at " + e.place + (e.price ? ". " + money0(e.price) + " per person." : ".") + (e.mandatory ? " Mandatory." : ""));
    logA(e.title + " created for " + dLabel(e.date) + " · " + catOf(e.cat).label);
    toast("Event published", actives().length + " brothers notified");
    closeModal(); state.view = "events"; render();
    setTimeout(function () { A["share-event"]({ dataset: { id: e.id } }); }, 160);
  };
  A["share-event"] = function (el) {
    var e = ev(el.dataset.id), url = "https://quorum.app/e/" + e.code, paid = e.price > 0;
    openModal((paid ? "Ticket link · " : "Check-in QR · ") + e.title,
      linkBlock(url, paid ? "Ticket page" : "Check-in page") + qrBlock(url, url.replace("https://", "")) +
      '<div class="banner">' + (paid
        ? "<b>Print it on the flyer.</b> Guests who are not brothers can buy a ticket from this page with no account. Brothers who tap it are recognized and charged with one tap."
        : "<b>Put it on the sign-in table.</b> Brothers scan it to check in. Attendance and service hours land in the chapter record automatically, no paper sheet.") + "</div>" +
      (paid ? '<p style="font-size:12.5px;color:var(--muted)">' + e.tickets.reduce(function (s, t) { return s + t.qty; }, 0) + " tickets sold &middot; " +
        money(e.tickets.reduce(function (s, t) { return s + t.paid; }, 0)) + " collected</p>" : ""),
      '<button class="btn ghost" data-action="close-modal">Done</button>' +
      (paid ? '<button class="btn ghost" data-action="preview-ticket" data-id="' + e.id + '">Preview the page</button>' : ""));
  };
  A["checkin-qr"] = function () { var n = upcoming()[0]; if (n) A["share-event"]({ dataset: { id: n.id } }); };
  A["preview-ticket"] = function (el) {
    var e = ev(el.dataset.id);
    state.checkout.method = "card"; state.checkout.qty = 1;
    checkoutModal({ modalTitle: "quorum.app/e/" + e.code, title: e.title, subtitle: dLabel(e.date) + " · " + e.time + " · " + e.place,
      amount: e.price, unit: e.price, qtyPicker: true, kind: "ticket", eventId: e.id,
      note: "Guests see this exact page with no account and no app. Brothers tapping from the app skip straight to paying." });
  };
  A["buy-ticket"] = function (el) {
    var e = ev(el.dataset.id);
    state.checkout.method = "card"; state.checkout.qty = 1;
    checkoutModal({ modalTitle: "Get tickets", title: e.title, subtitle: dLabel(e.date) + " · " + e.time + " · " + e.place,
      amount: e.price, unit: e.price, qtyPicker: true, kind: "ticket", eventId: e.id, phone: true, note: "Bring your wife, bring a guest. Tickets are not limited to brothers." });
  };
  A["rsvp"] = function (el) {
    var e = ev(el.dataset.id);
    if (e.rsvps.indexOf(ME) < 0) e.rsvps.push(ME);
    logA(myName() + " RSVP'd to " + e.title);
    toast("RSVP recorded", "officers see it immediately");
    render();
  };
  A["my-ticket"] = function (el) {
    var e = ev(el.dataset.id);
    var qty = e.tickets.filter(function (t) { return t.memberId === ME; }).reduce(function (s, t) { return s + t.qty; }, 0);
    var tc = (e.code + ME).toUpperCase().slice(0, 8);
    openModal(e.price ? "Your tickets" : "Your check-in code",
      '<div class="ticket"><div class="tt">' + esc(e.title) + '</div><div class="tm">' + dLabel(e.date) + " &middot; " + e.time + "</div>" +
      '<div class="tq">' + qrMarkup("https://quorum.app/t/" + tc) + "</div>" +
      '<div class="tt">' + (e.price ? qty + " ticket" + (qty > 1 ? "s" : "") + " · " + esc(myName()) : esc(myName())) + "</div>" +
      '<div class="tc">' + tc + "</div></div>" +
      '<p style="font-size:12.5px;color:var(--muted);margin-top:13px">Show this at the door. Scanning it checks him in, credits ' + (e.hours || 0) +
      " service hours and updates his attendance rate. The code rotates after the event and cannot be forwarded.</p>",
      '<button class="btn ghost" data-action="close-modal">Close</button>');
  };
  A["checkin"] = function (el) {
    var e = ev(el.dataset.id);
    var ids = e.rsvps.length ? e.rsvps : actives().map(function (m) { return m.id; });
    var rows = ids.map(function (id) {
      var m = member(id); if (!m) return "";
      var inn = e.checkedIn.indexOf(id) > -1;
      return '<div class="docrow">' + av(m) +
        '<div><div class="dn">' + esc(full(m)) + '</div><div class="dm">' + (inn ? "Checked in &middot; " + (e.hours || 0) + " hrs credited" : "Expected") + "</div></div>" +
        '<span class="sp"></span><button class="btn sm' + (inn ? " ghost" : "") + '" data-action="toggle-checkin" data-id="' + e.id + '" data-m="' + id + '">' + (inn ? "Undo" : "Check in") + "</button></div>";
    }).join("");
    openModal("Check-in · " + e.title,
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:11px">' + e.checkedIn.length + " of " + ids.length + " checked in. Brothers can also scan the QR themselves at the door.</p>" +
      '<div class="card"><div class="card-b flush" style="max-height:380px;overflow-y:auto">' + rows + "</div></div>",
      '<button class="btn ghost" data-action="close-modal">Done</button>');
  };
  A["toggle-checkin"] = function (el) {
    var e = ev(el.dataset.id), id = el.dataset.m, i = e.checkedIn.indexOf(id);
    var sid = "sa_" + e.id + "_" + id;
    if (i > -1) {
      e.checkedIn.splice(i, 1);
      db.service = db.service.filter(function (x) { return x.id !== sid; });
    } else {
      e.checkedIn.push(id);
      if (e.hours && !find(db.service, sid)) {
        db.service.push({ id: sid, memberId: id, eventId: e.id, hours: e.hours, what: e.title, date: e.date, status: "approved", auto: true });
        toast(full(member(id)) + " checked in", e.hours + " service hours credited automatically");
      }
    }
    A["checkin"]({ dataset: { id: e.id } });
    renderDash();
  };
  A["event-update"] = function (el) {
    var e = ev(el.dataset.id);
    openModal("Notify everyone going to " + e.title,
      '<div class="field"><label>Update</label><textarea id="evMsg" rows="3">Parking has moved to the Boston Avenue garage. Validation at the registration table.</textarea></div>' +
      '<label class="checkline"><input type="checkbox" checked><span>Push to ' + e.rsvps.length + " brothers who RSVP'd and every ticket holder</span></label>",
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="send-event-update" data-id="' + e.id + '">Send update</button>');
  };
  A["send-event-update"] = function (el) {
    var e = ev(el.dataset.id);
    notify("cal", e.title + " — update", $("#evMsg").value.trim());
    logA("Event update sent for " + e.title);
    toast(e.rsvps.length + " attendees notified", "push + in-app");
    closeModal(); render();
  };

  A["excuse"] = function (el) {
    var x = find(db.excuses, el.dataset.id);
    x.status = el.dataset.v; x.at = "Just now";
    logA(full(member(x.memberId)) + "'s excuse was " + x.status);
    notify("bell", "Your excuse was " + x.status, x.reason);
    toast("Excuse " + x.status, x.status === "approved" ? "his attendance standing is protected" : "");
    render();
  };
  A["request-excuse"] = function (el) {
    var e = ev(el.dataset.id);
    openSheet("Request an excuse",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:13px">' + esc(e.title) + " &middot; " + dLabel(e.date) + "</p>" +
      '<div class="field"><label>Reason</label><textarea id="xReason" rows="3">Out of state on a job site that weekend.</textarea></div>' +
      '<p class="hint">An approved excuse protects your attendance standing. The Keeper of Records reviews it.</p>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="send-excuse" data-id="' + e.id + '">Send request</button>');
  };
  A["send-excuse"] = function (el) {
    db.excuses.push({ id: uid("x"), memberId: ME, eventId: el.dataset.id, reason: $("#xReason").value.trim(), status: "pending", at: "Just now" });
    logA(myName() + " requested an excuse for " + ev(el.dataset.id).title);
    toast("Excuse requested", "it is in the Keeper of Records queue on the dashboard");
    closeSheet(); render();
  };
  A["approve-service"] = function (el) {
    var s = find(db.service, el.dataset.id);
    if (el.dataset.adj && $("#svAdj")) s.hours = Math.max(0, Number($("#svAdj").value) || s.hours);
    s.status = "approved";
    closeModal();
    logA(full(member(s.memberId)) + "'s " + s.hours + " service hours were approved");
    toast("Service hours approved", s.hours + " hrs added to the chapter total");
    render();
  };
  A["log-service"] = function (el) {
    var e = el.dataset.id ? ev(el.dataset.id) : null;
    openModal("Log service hours",
      '<div class="field"><label>Brother</label><select id="svM">' + actives().map(function (m) { return '<option value="' + m.id + '">' + esc(full(m)) + "</option>"; }).join("") + "</select></div>" +
      '<div class="row2"><div class="field"><label>Hours</label><input type="number" id="svH" value="' + (e ? e.hours : 4) + '"></div>' +
      '<div class="field"><label>Date</label><input type="date" id="svD" value="' + isoToday() + '"></div></div>' +
      '<div class="field"><label>What was done</label><input type="text" id="svW" value="' + (e ? esc(e.title) : "Community service") + '"></div>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-service">Log hours</button>');
  };
  A["log-service-app"] = function () {
    openSheet("Log your service hours",
      '<div class="row2"><div class="field"><label>Hours</label><input type="number" id="svH2" value="3"></div>' +
      '<div class="field"><label>Date</label><input type="date" id="svD2" value="' + isoToday() + '"></div></div>' +
      '<div class="field"><label>What you did</label><input type="text" id="svW2" value="Tutoring at Carver Middle School"></div>' +
      '<p class="hint">The Keeper of Records approves it before it counts toward the chapter total.</p>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-service-app">Submit</button>');
  };
  A["save-service"] = function () {
    var m = member($("#svM").value), h = Number($("#svH").value) || 0;
    db.service.push({ id: uid("s"), memberId: m.id, eventId: null, hours: h, what: $("#svW").value.trim(), date: $("#svD").value, status: "approved" });
    logA(h + " service hours logged for " + full(m));
    toast(h + " hours logged", "chapter total updated");
    closeModal(); render();
  };
  A["save-service-app"] = function () {
    var h = Number($("#svH2").value) || 0;
    db.service.push({ id: uid("s"), memberId: ME, eventId: null, hours: h, what: $("#svW2").value.trim(), date: $("#svD2").value, status: "pending" });
    logA(myName() + " submitted " + h + " service hours for approval");
    toast("Submitted for approval", "it is in the Keeper of Records queue");
    closeSheet(); render();
  };

  A["approve-minutes"] = function (el) {
    var mn = find(db.minutes, el.dataset.id);
    mn.status = "Approved";
    logA(mn.title + " minutes approved by the body");
    toast("Minutes approved", "locked into the chapter record");
    render();
  };
  A["new-motion"] = function (el) {
    openModal("Record a motion",
      '<div class="field"><label>Motion</label><textarea id="moT" rows="2">Authorize the Fundraising Committee to secure a $5,000 title sponsor for the Gala.</textarea></div>' +
      '<div class="row2"><div class="field"><label>Moved by</label><select id="moBy">' + actives().map(function (m) { return "<option>" + esc(full(m)) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>Seconded by</label><select id="moSec">' + actives().map(function (m, i) { return "<option" + (i === 4 ? " selected" : "") + ">" + esc(full(m)) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="row3"><div class="field"><label>Yes</label><input type="number" id="moY" value="16"></div>' +
      '<div class="field"><label>No</label><input type="number" id="moN" value="2"></div>' +
      '<div class="field"><label>Abstain</label><input type="number" id="moA" value="1"></div></div>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-motion" data-id="' + el.dataset.id + '">Record</button>');
  };
  A["save-motion"] = function (el) {
    var mn = find(db.minutes, el.dataset.id);
    var y = Number($("#moY").value) || 0, n = Number($("#moN").value) || 0;
    mn.motions.push({ t: $("#moT").value.trim(), by: $("#moBy").value, second: $("#moSec").value, yes: y, no: n, abstain: Number($("#moA").value) || 0, result: y > n ? "Carried" : "Failed" });
    logA("Motion recorded in " + mn.title);
    toast("Motion recorded", y + " yes, " + n + " no");
    closeModal(); render();
  };
  A["new-minutes"] = function () {
    db.minutes.unshift({ id: uid("mn"), title: "November Chapter Meeting", date: "2026-11-01", present: 0, excused: 0, absent: 0,
      status: "In progress", by: full(member(ROLE_MEMBER[state.role])), motions: [] });
    logA("November minutes opened");
    toast("Minutes opened", "attendance will fill in from check-in");
    render();
  };
  A["start-ballot"] = function () {
    openModal("Call a vote",
      '<div class="field"><label>Question before the body</label><textarea id="vQ" rows="2">Shall the chapter raise the annual scholarship award from $2,500 to $3,000?</textarea></div>' +
      '<div class="field"><label>Who votes</label><select><option>All financial brothers (' + actives().filter(function (m) { return isFin(m.id); }).length +
      ")</option><option>Executive Board only (" + officers().length + ")</option></select></div>" +
      '<div class="field"><label>Ballot type</label><div class="segment" id="vType"><button type="button" class="on">Secret</button><button type="button">Recorded</button></div></div>' +
      '<label class="checkline"><input type="checkbox" checked><span>Push to every eligible voter now, close in 48 hours</span></label>' +
      '<div class="banner" style="margin-bottom:0"><b>Only financial brothers can vote.</b> Standing is computed from the ledger, so nobody has to check a list.</div>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="send-ballot">Open the ballot</button>');
    segWire("vType");
  };
  A["send-ballot"] = function () {
    var q = $("#vQ").value.trim();
    notify("bell", "A vote is open", q + " Secret ballot, closes in 48 hours.");
    logA("Ballot opened: " + q.slice(0, 60));
    toast(actives().filter(function (m) { return isFin(m.id); }).length + " ballots sent", "financial brothers only");
    closeModal(); render();
  };

  A["upload"] = function (el) {
    var ctx = docCtx(el);
    openModal("Upload a file" + ctx.suffix,
      '<div class="field"><label>File</label><input type="text" id="uName" value="Minutes — November Chapter Meeting.pdf"></div>' +
      '<div class="row2"><div class="field"><label>Folder</label><select id="uFolder">' +
      ["Governance", "Finance", "Minutes", "Programs", "Executive Board"].map(function (f) {
        return "<option" + (f === (ctx.folder || "Minutes") ? " selected" : "") + ">" + f + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Who can open it</label><select id="uVis"><option value="all">All brothers</option><option value="officers">Officers only</option></select></div></div>' +
      '<label class="checkline"><input type="checkbox" id="uNotify" checked><span>Notify the chapter that a new document is posted</span></label>' +
      '<div class="banner" style="margin-bottom:0"><b>Documents outlive officers.</b> ' +
      (ctx.note || "Everything in the Vault transfers to the next administration with its history intact.") + "</div>",
      '<button class="btn ghost" data-action="close-modal">Cancel</button>' +
      '<button class="btn" data-action="save-doc" data-kom="' + (ctx.komId || "") + '" data-ev="' + (ctx.eventId || "") + '">Add to Vault</button>');
  };
  A["add-link"] = function (el) {
    var ctx = docCtx(el);
    openModal("Link a document" + ctx.suffix,
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:13px">For the things the chapter already keeps in Google. ' +
      "Quorum stores the link, the visibility rule and the open count. The file itself stays where it is.</p>" +
      '<div class="field"><label>What is it</label><input type="text" id="lName" value="Scholarship Applications 2026\u201327"></div>' +
      '<div class="field"><label>Paste the link</label><input type="text" id="lUrl" placeholder="https://docs.google.com/..." ' +
      'value="https://docs.google.com/spreadsheets/d/1ScholarshipApps/edit"></div>' +
      '<div class="row2"><div class="field"><label>Folder</label><select id="lFolder">' +
      ["Governance", "Finance", "Minutes", "Programs", "Executive Board"].map(function (f) {
        return "<option" + (f === (ctx.folder || "Programs") ? " selected" : "") + ">" + f + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Who can open it</label><select id="lVis"><option value="all">All brothers</option>' +
      '<option value="officers">Officers only</option></select></div></div>' +
      '<div class="banner" style="margin-bottom:0"><b>Quorum cannot enforce access inside Google.</b> ' +
      "Set the sharing on the file itself too, or a brother who is not meant to see it still can.</div>",
      '<button class="btn ghost" data-action="close-modal">Cancel</button>' +
      '<button class="btn" data-action="save-link" data-kom="' + (ctx.komId || "") + '" data-ev="' + (ctx.eventId || "") + '">Add to Vault</button>');
  };
  A["save-link"] = function (el) {
    var name = $("#lName").value.trim() || "Linked document";
    var url = $("#lUrl").value.trim();
    if (!/^https?:\/\//i.test(url)) { toast("That does not look like a link", "It needs to start with https://"); return; }
    var host = /spreadsheets/.test(url) ? "Google Sheets" : /\/forms\//.test(url) ? "Google Forms"
      : /\/document\//.test(url) ? "Google Docs" : /drive\.google/.test(url) ? "Google Drive"
      : /calendar\.google/.test(url) ? "Google Calendar" : /presentation/.test(url) ? "Google Slides"
      : (url.split("/")[2] || "Link").replace(/^www\./, "");
    var me = member(ROLE_MEMBER[state.role]);
    db.docs.unshift({ id: uid("l"), kind: "link", name: name, folder: $("#lFolder").value, vis: $("#lVis").value,
      url: url, host: host, updated: dShort(isoToday()).replace(/ \d+$/, " " + TODAY.getFullYear()),
      by: full(me), opens: 0,
      komId: (el && el.dataset.kom) || null, eventId: (el && el.dataset.ev) || null });
    logA(full(me) + " linked " + name + " (" + host + ") in the Vault");
    toast("Link added to the Vault", host + " \u00b7 " + ($("#lVis").value === "officers" ? "officers only" : "all brothers"));
    closeModal(); state.view = "vault"; render();
  };
  /* Where an upload was started from, so the record can be tagged to it. */
  function docCtx(el) {
    var kom = el && el.dataset ? el.dataset.kom : null;
    var evi = el && el.dataset ? el.dataset.ev : null;
    var folder = (el && el.dataset && el.dataset.folder) || null;
    var label = kom ? (komOf(kom) || {}).name : evi ? (ev(evi) || {}).title : null;
    return { komId: kom || null, eventId: evi || null, folder: folder,
      suffix: label ? " \u00b7 " + label : "",
      note: label ? "It goes to the Vault and shows on " + label + "." : null };
  }
  function komOf(id) { return find(db.committees, id); }

  A["save-doc"] = function (el) {
    var name = $("#uName").value.trim() || "Untitled.pdf", vis = $("#uVis").value, f = $("#uFolder").value;
    var me = member(ROLE_MEMBER[state.role]);
    db.docs.unshift({ id: uid("d"), kind: "file", name: name, folder: f, vis: vis, size: "128 KB",
      updated: dShort(isoToday()).replace(/ \d+$/, " " + TODAY.getFullYear()), by: full(me), opens: 0,
      komId: (el && el.dataset.kom) || null, eventId: (el && el.dataset.ev) || null });
    logA(full(me) + " posted " + name + " to " + f);
    if ($("#uNotify").checked && vis === "all") {
      notify("doc", "New document: " + name, full(me) + " added it to " + f + ".");
      toast("Posted to the Vault", actives().length + " brothers notified");
    } else toast("Posted to the Vault", vis === "officers" ? "officers only, members not notified" : "");
    closeModal(); state.view = "vault"; render();
  };
  A["doc-open"] = function (el) {
    var d = find(db.docs, el.dataset.id); if (!d) return;
    d.opens++;
    if (isLink(d)) {
      openModal(d.name,
        '<div style="display:flex;gap:13px;align-items:center;margin-bottom:15px">' +
        '<div class="dicon link" style="width:44px;height:54px"><span>' + docTag(d) + "</span></div>" +
        '<div><div style="font-weight:700">' + esc(d.name) + '</div><div style="font-size:12.5px;color:var(--muted)">' +
        esc(d.host || "Link") + " &middot; " + d.folder + " &middot; added " + d.updated + "</div></div></div>" +
        '<div class="linkrow"><code>' + esc(d.url.replace(/^https?:\/\//, "")) + "</code>" +
        '<button class="btn sm ghost" data-copy="' + esc(d.url) + '">Copy</button></div>' +
        '<div class="kv" style="margin-top:13px"><span class="k">Added by</span><span class="v">' + esc(d.by) + "</span></div>" +
        '<div class="kv"><span class="k">Who can open it</span><span class="v">' + (d.vis === "officers" ? "Officers only" : "All active brothers") + "</span></div>" +
        '<div class="kv"><span class="k">Opens</span><span class="v num">' + d.opens + "</span></div>" +
        '<div class="banner" style="margin-bottom:0"><b>This one lives in Google, not in Quorum.</b> ' +
        "Quorum keeps the link, who may open it and who has, so it does not vanish when the line turns over. " +
        "Whoever owns the Google file still controls access there.</div>",
        '<button class="btn ghost" data-action="close-modal">Close</button>' +
        '<a class="btn" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">Open in Google</a>');
      renderDash();
      return;
    }
    openModal(d.name,
      '<div style="display:flex;gap:13px;align-items:center;margin-bottom:15px">' +
      '<div class="dicon" style="width:44px;height:54px"><span>' + esc(d.name.split(".").pop().toUpperCase()) + "</span></div>" +
      '<div><div style="font-weight:700">' + esc(d.name) + '</div><div style="font-size:12.5px;color:var(--muted)">' + d.folder + " &middot; " + d.size + " &middot; updated " + d.updated + "</div></div></div>" +
      '<div class="kv"><span class="k">Posted by</span><span class="v">' + esc(d.by) + "</span></div>" +
      '<div class="kv"><span class="k">Who can open it</span><span class="v">' + (d.vis === "officers" ? "Officers only" : "All active brothers") + "</span></div>" +
      '<div class="kv"><span class="k">Opens</span><span class="v num">' + d.opens + "</span></div>" +
      '<div class="kv"><span class="k">Leaves the chapter</span><span class="v" style="color:var(--paid)">Never</span></div>' +
      '<div class="banner" style="margin-bottom:0">In the live product this opens the file in place. Officers see who opened it and when.</div>',
      '<button class="btn ghost" data-action="close-modal">Close</button>');
  };
  A["new-announcement"] = function () {
    openModal("Post an announcement",
      '<div class="field"><label>Announcement</label><textarea id="annText" rows="4">Brothers, Founders Day tickets close this Friday. If you need a payment plan, see Carlton before Sunday.</textarea></div>' +
      '<div class="field"><label>Goes to</label><select id="annChan">' + db.channels.filter(function (c) { return c.vis === "all"; }).map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + "</option>";
      }).join("") + "</select></div>" +
      '<label class="checkline"><input type="checkbox" id="annPush" checked><span>Send a push notification to all ' + actives().length + " active brothers</span></label>" +
      '<label class="checkline"><input type="checkbox"><span>Pin to the top until Founders Day</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="send-announcement">Post</button>');
  };
  A["send-announcement"] = function () {
    var txt = $("#annText").value.trim(); if (!txt) return;
    var cid = $("#annChan").value, c = chan(cid), me = member(ROLE_MEMBER[state.role]);
    c.msgs.push({ who: me.id, text: txt, at: "Just now", views: 0, reacts: {} });
    if ($("#annPush").checked) notify("bell", full(me) + " posted an announcement", txt);
    logA(full(me) + " posted an announcement to " + c.name);
    toast("Posted to " + c.name, $("#annPush").checked ? actives().length + " brothers notified" : "no push sent");
    closeModal(); state.view = "messages"; state.channel = cid; state.appChannel = cid; render();
  };
  A["bulk-message"] = function () {
    var ids = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
    openModal("Message " + (ids.length ? ids.length + " brothers" : "the committee"),
      '<div class="field"><label>Message</label><textarea id="bulkMsg" rows="4">Brother, please confirm you received the November meeting packet.</textarea></div>' +
      '<label class="checkline"><input type="checkbox" checked><span>Send in-app and as a push notification</span></label>' +
      '<label class="checkline"><input type="checkbox"><span>Also send as a text message</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="send-bulk" data-n="' + (ids.length || 5) + '">Send</button>');
  };
  A["send-bulk"] = function (el) {
    notify("chat", "A message from your chapter", $("#bulkMsg").value.trim());
    toast(el.dataset.n + " brothers messaged", "push sent");
    state.selected = {}; closeModal(); render();
  };
  A["bulk-remind"] = function () {
    var ids = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
    notify("money", "A payment link from your chapter", "Your Keeper of Exchequer sent you a link for your outstanding balance.");
    toast(ids.length + " payment links sent", "by text and in-app");
    state.selected = {}; render();
  };
  A["bulk-committee"] = function () { A["assign"]({ dataset: {} }); };
  A["birthday"] = function (el) {
    var m = member(el.dataset.id);
    notify("cake", "Happy birthday, Brother " + m.last, "The chapter sends its best on " + bdayLabel(m.bday) + ".");
    toast("Birthday note sent to " + full(m), "and posted in the chapter channel");
    render();
  };
  A["invite"] = function () {
    var url = "https://quorum.app/join/" + rcode();
    openModal("Invite a brother",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:13px">Quorum has no public sign-up. The only way in is an officer invite or a vouch from a brother the chapter already trusts.</p>' +
      linkBlock(url, "Single-use invite link") + qrBlock(url, "Scan at the meeting") +
      '<div class="banner" style="margin-bottom:0"><b>Expires in 7 days.</b> One use. The Polemarch still approves the candidate before he can see anything.</div>',
      '<button class="btn ghost" data-action="close-modal">Done</button>');
  };
  A["directory"] = function () {
    var inds = {};
    actives().forEach(function (m) { (inds[m.industry] = inds[m.industry] || []).push(m); });
    openModal("Career directory",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:13px">Your brothers by industry. The reason a graduate chapter is worth the dues, and a directory that stops at the chapter line.</p>' +
      Object.keys(inds).sort().map(function (k) {
        return '<div class="asec">' + esc(k) + " &middot; " + inds[k].length + '</div><div class="card" style="margin-bottom:10px"><div class="card-b flush">' +
          inds[k].map(function (m) {
            return '<div class="docrow">' + av(m) +
              '<div><div class="dn">' + esc(full(m)) + '</div><div class="dm">' + esc(m.jobTitle) + " &middot; " + esc(m.employer) + " &middot; " + esc(m.city) + "</div></div>" +
              '<span class="sp"></span><button class="btn ghost sm" data-action="profile" data-id="' + m.id + '">Open</button></div>';
          }).join("") + "</div></div>";
      }).join(""), '<button class="btn ghost" data-action="close-modal">Close</button>', true);
  };
  A["edit-profile"] = function () {
    var m = member(ME);
    openSheet("Edit my information",
      '<div class="row2"><div class="field"><label>Phone</label><input type="text" id="epP" value="' + esc(m.phone) + '"></div>' +
      '<div class="field"><label>Email</label><input type="text" id="epE" value="' + esc(m.email) + '"></div></div>' +
      '<div class="row2"><div class="field"><label>Employer</label><input type="text" id="epEm" value="' + esc(m.employer) + '"></div>' +
      '<div class="field"><label>Title</label><input type="text" id="epT" value="' + esc(m.jobTitle) + '"></div></div>' +
      '<div class="field"><label>Shirt size</label><select id="epS">' + ["S", "M", "L", "XL", "2XL", "3XL"].map(function (s) {
        return "<option" + (s === m.shirt ? " selected" : "") + ">" + s + "</option>";
      }).join("") + "</select></div>" +
      '<p class="hint">Your birthday and line information are set by the chapter and cannot be edited here.</p>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-profile">Save</button>');
  };
  A["save-profile"] = function () {
    var m = member(ME);
    m.phone = $("#epP").value; m.email = $("#epE").value; m.employer = $("#epEm").value; m.jobTitle = $("#epT").value; m.shirt = $("#epS").value;
    logA(myName() + " updated his contact and career information");
    toast("Profile updated", "the roster and directory now match");
    closeSheet(); render();
  };
  A["handoff"] = function () {
    openModal("Administration handoff",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:13px">When the new slate is seated in December, this is what transfers in one action.</p>' +
      [["Roster", actives().length + " brothers with full history"], ["Ledger", db.payments.length + " payments, " + db.bills.length + " bills, every receipt"],
       ["Minutes", db.minutes.length + " meetings with every motion and tally"], ["Vault", db.docs.length + " documents with open counts"],
       ["Committees", db.committees.length + " committees with charges, budgets and rosters"], ["Attendance", mandatoryPast().length + " meetings of record"],
       ["Service", totalService() + " hours logged and approved"], ["Channels", db.channels.length + " channels with full history"]].map(function (r) {
        return '<div class="kv"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + "</span></div>";
      }).join("") +
      '<div class="banner" style="margin-bottom:0"><b>This is the pitch.</b> Officer turnover is what kills a chapter\'s memory. Nothing here lives in one brother\'s inbox or on his laptop.</div>',
      '<button class="btn ghost" data-action="close-modal">Close</button>');
  };
  A["export"] = function () {
    var sel = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
    var list = sel.length ? sel.map(member) : actives();
    var csv = ["Name,Office,Initiated,Chapter,Line,Standing,Balance,Attendance,Service Hours,Committees,Employer,Title,Industry,Email,Phone,Birthday"]
      .concat(list.map(function (m) {
        return [full(m), m.roles.join(" / "), m.initYear, m.initChapter, m.lineName + " #" + m.lineNum,
          isFin(m.id) ? "Financial" : "Owes", balanceOf(m.id).toFixed(2), Math.round(attRate(m.id) * 100) + "%",
          totalHours(m.id), committeesOf(m.id).map(function (c) { return c.k.name; }).join(" | "),
          m.employer, m.jobTitle, m.industry, m.email, m.phone, m.bday].join(",");
      })).join("\n");
    openModal("Export · " + list.length + " brothers",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">The file the Treasurer hands the next administration, or opens in Excel at tax time.</p>' +
      '<pre style="background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;padding:12px;overflow:auto;max-height:300px;font-family:var(--mono);font-size:11px;margin:0">' +
      esc(csv) + "</pre>",
      '<button class="btn ghost" data-action="close-modal">Close</button><button class="btn" data-action="copy" data-v="' + esc(csv) + '">Copy</button>', true);
  };

  A["open-committee"] = function (el) {
    if (state.role === "chair") {
      var mine = window.QUORUM.committeeChairedBy(ROLE_MEMBER.chair);
      var k = kom(el.dataset.id);
      if (k && mine && k.name !== mine) {
        toast("That is not your committee", "A chair sees his own committee and the chapter roster");
        return;
      }
    }
    state.komId = el.dataset.id; state.view = "committees"; closeModal(); render();
  };
  A["back-committees"] = function () { state.komId = null; render(); };
  A["toggle-task"] = function (el) {
    var k = kom(el.dataset.k), t = find(k.tasks, el.dataset.t);
    t.done = !t.done;
    logA(k.name + ": " + (t.done ? "completed" : "reopened") + " “" + t.t + "”");
    toast(t.done ? "Task completed" : "Task reopened", esc(t.who) + " notified");
    renderDash();
  };
  A["new-task"] = function (el) {
    var k = kom(el.dataset.k);
    openModal("Add a task to " + k.name,
      '<div class="field"><label>Task</label><input type="text" id="ntT" value="Confirm the venue deposit"></div>' +
      '<div class="row2"><div class="field"><label>Assign to</label><select id="ntW">' +
      [member(k.chair)].concat(komMembers(k)).map(function (m) { return "<option>" + esc(full(m)) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>Due</label><input type="date" id="ntD" value="2026-11-15"></div></div>' +
      '<label class="checkline"><input type="checkbox" checked><span>Notify him in the app and add it to his task list</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-task" data-k="' + k.id + '">Add task</button>');
  };
  A["save-task"] = function (el) {
    var k = kom(el.dataset.k);
    k.tasks.push({ id: uid("t"), t: $("#ntT").value.trim(), who: $("#ntW").value, due: $("#ntD").value, done: false });
    notify("bell", "New task: " + $("#ntT").value.trim(), k.name + " committee · due " + dLabel($("#ntD").value) + ".");
    logA("Task assigned in " + k.name + " to " + $("#ntW").value);
    toast("Task assigned", $("#ntW").value + " notified");
    closeModal(); render();
  };
  A["committee-report"] = function (el) {
    var title = el.dataset.id ? kom(el.dataset.id).name + " Committee Report" : "Standing Committee Report";
    var body = committeeReportDoc(el.dataset.id || null);
    if (!openReportWindow(title, body)) {
      openPrintZone(title, body);
      toast("Pop-up blocked", "opened it here instead");
    }
  };
  A["do-print"] = function () { window.print(); };
  A["close-print"] = function () { var z = document.querySelector(".printzone"); if (z) z.remove(); };

  A["review-service"] = function (el) {
    var sv = find(db.service, el.dataset.id), m = member(sv.memberId);
    var his = db.service.filter(function (x) { return x.memberId === m.id && x.status === "approved"; });
    openModal("Review service submission",
      '<div class="prof-h">' + av(m, 52) + '<div><div class="pn">' + esc(full(m)) + '</div><div class="pm">' + esc(m.jobTitle) + ", " + esc(m.employer) + "</div></div></div>" +
      '<div class="card" style="margin-bottom:14px"><div class="card-b">' +
      '<div class="kv"><span class="k">Hours claimed</span><span class="v num" style="font-size:17px">' + sv.hours + "</span></div>" +
      '<div class="kv"><span class="k">What he did</span><span class="v">' + esc(sv.what) + "</span></div>" +
      '<div class="kv"><span class="k">Date of service</span><span class="v">' + dLabel(sv.date) + "</span></div>" +
      '<div class="kv"><span class="k">Tied to a chapter event</span><span class="v">' + (sv.eventId ? esc(ev(sv.eventId).title) : "No — logged on his own") + "</span></div>" +
      '<div class="kv"><span class="k">Submitted</span><span class="v">From the app</span></div></div></div>' +
      '<div class="field"><label>Adjust the hours before approving</label><input type="number" id="svAdj" value="' + sv.hours + '"></div>' +
      '<div class="asec">His record this year</div><div class="card"><div class="card-b flush">' +
      '<div class="kv" style="padding:10px 14px"><span class="k">Approved hours to date</span><span class="v num">' + serviceHours(m.id) + "</span></div>" +
      '<div class="kv" style="padding:10px 14px"><span class="k">Events attended</span><span class="v num">' + eventsAttended(m.id).length + "</span></div>" +
      '<div class="kv" style="padding:10px 14px"><span class="k">Attendance rate</span><span class="v num">' + Math.round(attRate(m.id) * 100) + "%</span></div>" +
      '<div class="kv" style="padding:10px 14px"><span class="k">Standing</span><span class="v">' + (isFin(m.id) ? "Financial" : "Not financial") + "</span></div></div></div>" +
      '<div class="banner" style="margin-bottom:0">Hours from chapter events are credited automatically at check-in. Only hours a brother logs on his own need this review.</div>',
      '<button class="btn ghost" data-action="deny-service" data-id="' + sv.id + '">Deny</button>' +
      '<button class="btn" data-action="approve-service" data-id="' + sv.id + '" data-adj="1">Approve</button>', false, true);
  };
  A["deny-service"] = function (el) {
    var sv = find(db.service, el.dataset.id);
    sv.status = "denied";
    logA(full(member(sv.memberId)) + "'s " + sv.hours + " service hours were denied");
    notify("bell", "Service hours not approved", sv.hours + " hours for " + sv.what + ". See the Keeper of Records.");
    toast("Submission denied", "he was notified");
    closeModal(); render();
  };
  A["approve-all-service"] = function () {
    var pend = pendingService(), n = pend.length, hrs = 0;
    pend.forEach(function (sv) { sv.status = "approved"; hrs += sv.hours; });
    logA(n + " service submissions approved in bulk, " + hrs + " hours");
    notify("bell", "Your service hours were approved", "They now count toward your 20-hour goal.");
    toast(n + " submissions approved", hrs + " hours added to the chapter total");
    render();
  };
  A["deny-all-service"] = function () {
    var pend = pendingService(), n = pend.length;
    pend.forEach(function (sv) { sv.status = "denied"; });
    logA(n + " service submissions denied in bulk");
    toast(n + " submissions denied", "each brother was notified");
    render();
  };

  A["change-photo"] = function () {
    var m = member(ME);
    var labels = ["Current", "Studio", "Outdoor", "Dark"];
    var opts = [0, 1, 2, 3].map(function (v) {
      var src = v === 0 ? "img/p11.jpg" : "img/a" + v + ".jpg";
      return '<button data-action="pick-photo" data-v="' + v + '" class="' + ((m.photoVariant || 0) === v ? "on" : "") + '">' +
        '<span class="av ph" style="background:var(--surface-3)"><img src="' + src + '" alt=""></span><span>' + labels[v] + "</span></button>";
    }).join("");
    openSheet("Update your photo",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:14px">In the live app this opens your camera or camera roll. Pick one here and watch the dashboard roster update on the left — brothers maintain their own record, officers never retype it.</p>' +
      '<div class="photo-pick">' + opts + "</div>" +
      '<div class="banner" style="margin-bottom:0"><b>One record, two surfaces.</b> Photo, phone, email, employer and title are his to maintain. Line name, initiation year and standing belong to the chapter and are read-only to him.</div>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button>');
  };
  A["pick-photo"] = function (el) {
    var m = member(ME);
    m.photo = true; m.photoVariant = Number(el.dataset.v);
    logA(myName() + " updated his photo from the app");
    toast("Photo updated in the app", "the dashboard roster already shows it");
    closeSheet(); render();
  };

  A["ctype"] = function (el) {
    db.chapter.type = el.dataset.t === "undergrad" ? "undergrad" : "grad";
    toast("Chapter type set to " + (db.chapter.type === "undergrad" ? "undergraduate" : "graduate"), "modules and vocabulary updated");
    render();
  };

  A["new-request"] = function () {
    state.reqKind = "chapter";
    renderRequestModal();
  };
  A["req-kind"] = function (el) { state.reqKind = el.dataset.k; renderRequestModal(); };
  function renderRequestModal() {
    var K = [["chapter", "Chapter-wide bill", "Dues, a grand tax, an assessment. Every active brother gets it."],
             ["some", "Selected brothers", "A line jacket order, a trip, a committee cost share."],
             ["event", "Event ticket", "A banquet, a gala, a golf tournament. Guests can buy too."],
             ["open", "Open collection", "Any amount from anyone with the link. Ad book, donations, a sick-and-distress fund."]];
    openModal("New payment request",
      '<div class="field"><label>What kind of payment is this</label><div class="typegrid">' +
      K.map(function (k) {
        return '<button type="button" class="typecard' + (state.reqKind === k[0] ? " on" : "") + '" data-action="req-kind" data-k="' + k[0] + '">' +
          '<div class="tn">' + k[1] + '</div><div class="td">' + k[2] + "</div></button>";
      }).join("") + "</div></div>" +
      '<div class="field"><label>What is it for</label><input type="text" id="rqT" value="' +
      (state.reqKind === "open" ? "Founders Day Ad Book" : state.reqKind === "event" ? "Scholarship Gala" : state.reqKind === "some" ? "Line Jacket Order" : "Founders Day Assessment") + '"></div>' +
      '<div class="row3"><div class="field"><label>' + (state.reqKind === "open" ? "Suggested amount" : "Amount each") + '</label>' +
      '<input type="number" id="rqA" value="' + (state.reqKind === "open" ? 0 : state.reqKind === "event" ? 125 : state.reqKind === "some" ? 165 : 60) + '"></div>' +
      '<div class="field"><label>Due by</label><input type="date" id="rqD" value="2026-11-20"></div>' +
      '<div class="field"><label>Program area</label><select id="rqC">' +
      Object.keys(db.cats).map(function (c) { return '<option value="' + c + '">' + esc(db.cats[c].label) + "</option>"; }).join("") + "</select></div></div>" +
      (state.reqKind === "some" ? '<div class="field"><label>Who pays</label><select id="rqWho" multiple size="5" style="height:auto">' +
        actives().map(function (m) { return '<option value="' + m.id + '">' + esc(full(m)) + "</option>"; }).join("") +
        '</select><p class="hint">Hold Command or Control to pick several.</p></div>' : "") +
      '<label class="checkline"><input type="checkbox" id="rqPush" checked><span><b>Push the payment link to every phone</b> — it lands in the app under Dues with a tap-to-pay button</span></label>' +
      '<label class="checkline"><input type="checkbox" id="rqSms"><span>Also send it as a text message</span></label>' +
      '<label class="checkline"><input type="checkbox" checked><span>Generate a QR code for the meeting agenda and the flyer</span></label>' +
      (state.reqKind === "open" ? '<div class="banner" style="margin-bottom:0">An open collection has no roster. Anyone with the link can pay any amount, which is how ad books, donations and sick-and-distress funds actually work.</div>' : ""),
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-request">Create and send</button>', false, true);
  }
  A["save-request"] = function () {
    var kind = state.reqKind || "chapter";
    var title = $("#rqT").value.trim() || "Chapter payment";
    var amt = Math.max(0, Number($("#rqA").value) || 0);
    var due = $("#rqD").value || "2026-12-01";
    var push = $("#rqPush").checked;
    var sel = $("#rqWho") ? Array.prototype.filter.call($("#rqWho").options, function (o) { return o.selected; }).length : 0;
    var r = { id: uid("r"), kind: kind, title: title, billId: null, amount: amt, due: due, pushed: push,
      created: isoToday(), code: rcode(), collected: 0, payers: 0,
      audience: kind === "chapter" ? "All " + actives().length + " active brothers" : kind === "some" ? (sel || 6) + " selected brothers"
        : kind === "event" ? "Public ticket page" : "Public link — any amount" };
    if (kind === "chapter") {
      var b = { id: uid("b"), code: r.code, title: title, amount: amt, cadence: "one-time", due: due, created: isoToday(), plan: false, cat: $("#rqC").value };
      db.bills.push(b); r.billId = b.id;
    }
    db.requests.unshift(r);
    if (push) {
      notify("money", title + " — payment requested", (amt ? money(amt) : "Any amount") + " due " + dLabel(due) + ". Tap to pay by bank or card.");
      toast("Pushed to " + actives().length + " phones", "link, QR and a tap-to-pay button");
    } else toast("Request created", "not pushed yet");
    logA(title + " payment request created · " + (amt ? money(amt) : "open amount"));
    closeModal(); state.view = "requests"; render();
    setTimeout(function () { A["request-qr"]({ dataset: { id: r.id } }); }, 160);
  };
  A["push-request"] = function (el) {
    var r = find(db.requests, el.dataset.id);
    r.pushed = true;
    notify("money", r.title + " — payment requested", (r.amount ? money(r.amount) : "Any amount") + " due " + dLabel(r.due) + ". Tap to pay.");
    logA(r.title + " pushed to the app");
    toast("Pushed to " + actives().length + " phones", "it is in his Dues tab now");
    render();
  };
  A["request-qr"] = function (el) {
    var r = find(db.requests, el.dataset.id);
    var url = "https://quorum.app/p/" + r.code;
    openModal("Payment link · " + r.title,
      linkBlock(url, "Share this anywhere") + qrBlock(url, url.replace("https://", "")) +
      '<div class="banner"><b>Three ways to collect with one request.</b> Text or email the link, print the QR on the agenda or the flyer, or let it sit in the app where ' +
      actives().length + " brothers can tap to pay. The chapter receives the full amount either way.</div>" +
      '<div class="kv"><span class="k">Goes to</span><span class="v">' + esc(r.audience) + "</span></div>" +
      '<div class="kv"><span class="k">Pushed to the app</span><span class="v">' + (r.pushed ? "Yes" : "Not yet") + "</span></div>" +
      '<div class="kv"><span class="k">Collected so far</span><span class="v num">' + money(reqCollected(r)) + "</span></div>",
      '<button class="btn ghost" data-action="close-modal">Done</button>' +
      (r.pushed ? "" : '<button class="btn" data-action="push-request" data-id="' + r.id + '">Push to app</button>'));
  };

  A["switch-profile"] = function () { if (window.QUORUM_SHELL) window.QUORUM_SHELL.openPicker(); };
  A["new-cat"] = function () {
    openModal("Add a program area",
      '<div class="field"><label>Name</label><input type="text" id="caN" value="Veterans Affairs"></div>' +
      '<div class="field"><label>Colour</label><div style="display:flex;gap:7px;flex-wrap:wrap" id="caC">' +
      ["#2F4B8F", "#14656B", "#8A5A12", "#2B6B45", "#5A3A86", "#9A4A1E", "#8C3250", "#7A5C12", "#1F2937", "#3C4654"].map(function (c, i) {
        return '<button type="button" class="catpick' + (i === 0 ? " on" : "") + '" data-c="' + c +
          '" style="width:46px;justify-content:center"><i style="background:' + c + '"></i></button>';
      }).join("") + "</div></div>" +
      '<div class="banner" style="margin-bottom:0">New areas appear everywhere a program area is chosen: events, committees, bills and the program report.</div>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-cat">Add area</button>');
    segWire("caC");
  };
  A["save-cat"] = function () {
    var name = $("#caN").value.trim() || "New area";
    var col = $("#caC").querySelector(".on").dataset.c;
    var key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) + "_" + Math.random().toString(36).slice(2, 5);
    db.cats[key] = { label: name, color: col };
    logA("Program area added: " + name);
    toast("Program area added", "it is now selectable everywhere");
    closeModal(); render();
  };
  A["edit-cat"] = function (el) {
    var ck = el.dataset.c, c = db.cats[ck];
    openModal("Rename " + c.label,
      '<div class="field"><label>Name</label><input type="text" id="caR" value="' + esc(c.label) + '"></div>' +
      '<p class="hint">Everything already tagged with it follows the new name.</p>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-cat-name" data-c="' + ck + '">Save</button>');
  };
  A["save-cat-name"] = function (el) {
    db.cats[el.dataset.c].label = $("#caR").value.trim() || db.cats[el.dataset.c].label;
    toast("Program area renamed", "updated everywhere it is used");
    closeModal(); render();
  };

  A["upload-minutes"] = function () {
    openModal("Upload minutes",
      '<div class="row2"><div class="field"><label>Meeting</label><input type="text" id="umT" value="November Chapter Meeting"></div>' +
      '<div class="field"><label>Date</label><input type="date" id="umD" value="2026-11-01"></div></div>' +
      '<div class="row3"><div class="field"><label>Present</label><input type="number" id="umP" value="21"></div>' +
      '<div class="field"><label>Excused</label><input type="number" id="umE" value="2"></div>' +
      '<div class="field"><label>Absent</label><input type="number" id="umA" value="3"></div></div>' +
      '<div class="field"><label>Minutes &mdash; paste or type them</label>' +
      '<textarea id="umM" rows="9">Called to order at 4:00 PM by the Polemarch.\n\nRoll called by the Keeper of Records.\n\nReading of the minutes:\n\nOfficer reports:\n\nCommittee reports:\n\nOld business:\n\nNew business:\n\nAdjourned at 5:40 PM.</textarea></div>' +
      '<label class="checkline"><input type="checkbox" id="umV" checked><span>File a copy in the Vault under Minutes</span></label>' +
      '<label class="checkline"><input type="checkbox" checked><span>Notify the chapter that minutes are posted for approval</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-upload-minutes">File the minutes</button>');
  };
  A["save-upload-minutes"] = function () {
    var t = $("#umT").value.trim() || "Chapter Meeting";
    var d = $("#umD").value || "2026-11-01";
    var mn = { id: uid("mn"), title: t, date: d,
      present: Number($("#umP").value) || 0, excused: Number($("#umE").value) || 0,
      absent: Number($("#umA").value) || 0, status: "Awaiting approval",
      by: full(member(ROLE_MEMBER[state.role])), motions: [], text: $("#umM").value.trim() };
    db.minutes.unshift(mn);
    if ($("#umV").checked) {
      db.docs.unshift({ id: uid("d"), name: "Minutes \u2014 " + t + ".pdf", folder: "Minutes", vis: "all",
        size: "128 KB", updated: "Oct 2026", by: mn.by, opens: 0 });
    }
    notify("doc", "Minutes posted: " + t, "Read them before the next meeting; they go to the floor for approval.");
    logA(mn.by + " filed minutes for " + t);
    toast("Minutes filed", "posted to the chapter and the Vault");
    closeModal(); state.view = "minutes"; render();
  };
  A["attach-minutes"] = function (el) {
    var mn = find(db.minutes, el.dataset.id);
    openModal("Attach minutes to " + mn.title,
      '<div class="field"><label>Minutes</label><textarea id="amM" rows="10" placeholder="Paste the minutes here\u2026"></textarea></div>' +
      '<label class="checkline"><input type="checkbox" checked><span>File a copy in the Vault</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-attach-minutes" data-id="' + mn.id + '">Attach</button>');
  };
  A["save-attach-minutes"] = function (el) {
    var mn = find(db.minutes, el.dataset.id);
    mn.text = $("#amM").value.trim();
    db.docs.unshift({ id: uid("d"), name: "Minutes \u2014 " + mn.title + ".pdf", folder: "Minutes", vis: "all",
      size: "128 KB", updated: "Oct 2026", by: mn.by, opens: 0 });
    logA("Minutes attached to " + mn.title);
    toast("Minutes attached", "a copy went to the Vault");
    closeModal(); render();
  };

  A["request-detail"] = function (el) {
    var r = find(db.requests, el.dataset.id);
    var b = r.billId ? bill(r.billId) : null;
    var got = reqCollected(r), tgt = reqTarget(r);
    var unpaid = b ? actives().filter(function (m) { return paidBy(m.id, b.id) < b.amount; }) : [];
    var payers = b ? db.payments.filter(function (p) { return p.billId === b.id; }) : [];
    openModal(r.title,
      '<div class="statrow" style="margin-bottom:14px">' +
      '<div><div class="sl">Collected</div><div class="sv" style="color:var(--paid)">' + money0(got) + "</div></div>" +
      (tgt ? '<div><div class="sl">Target</div><div class="sv">' + money0(tgt) + "</div></div>" : "") +
      '<div><div class="sl">Paid</div><div class="sv">' + (b ? actives().length - unpaid.length : (r.payers || 0)) + "</div></div>" +
      '<div><div class="sl">Unpaid</div><div class="sv" style="color:var(--late)">' + (b ? unpaid.length : "\u2014") + "</div></div></div>" +
      '<div class="kv"><span class="k">Goes to</span><span class="v">' + esc(r.audience) + "</span></div>" +
      '<div class="kv"><span class="k">Amount</span><span class="v num">' + (r.amount ? money(r.amount) : "Any amount") + "</span></div>" +
      '<div class="kv"><span class="k">Due</span><span class="v">' + dLabel(r.due) + "</span></div>" +
      '<div class="kv"><span class="k">Created</span><span class="v">' + dLabel(r.created) + "</span></div>" +
      '<div class="kv"><span class="k">Pushed to the app</span><span class="v">' + (r.pushed ? "Yes" : "Not yet") + "</span></div>" +
      '<div class="kv"><span class="k">Link</span><span class="v num" style="font-size:11px">quorum.app/p/' + r.code + "</span></div>" +
      (b ? '<div class="asec" style="margin-top:14px">Still owing \u00b7 ' + unpaid.length + "</div>" +
        '<div class="card"><div class="card-b flush" style="max-height:260px;overflow-y:auto">' +
        (unpaid.length ? unpaid.map(function (m) {
          return '<div class="rowbtn" style="cursor:default">' + av(m, 28) +
            '<div class="rb-x"><div class="rb-t">' + esc(full(m)) + "</div></div>" +
            '<span class="chip late">' + money(b.amount - paidBy(m.id, b.id)) + "</span>" +
            '<button class="btn ghost sm" data-action="share-bill" data-id="' + b.id + '" data-member="' + m.id + '">Link</button></div>';
        }).join("") : '<div class="empty">Everyone has paid.</div>') + "</div></div>" +
        '<div class="asec" style="margin-top:12px">Paid \u00b7 ' + payers.length + "</div>" +
        '<div class="card"><div class="card-b flush" style="max-height:200px;overflow-y:auto">' +
        (payers.length ? payers.map(function (p) {
          var m = member(p.memberId);
          return '<div class="docrow"><div><div class="dn">' + esc(full(m)) + '</div><div class="dm">' + dLabel(p.date) +
            " &middot; " + p.method + "</div></div><span class=\"sp\"></span><span class=\"num\" style=\"font-weight:600\">" +
            money(p.amount) + "</span></div>";
        }).join("") : '<div class="empty">No payments yet.</div>') + "</div></div>"
        : '<div class="banner" style="margin-top:14px">An open collection has no roster, so there is no unpaid list \u2014 anyone with the link can pay any amount.</div>'),
      '<button class="btn ghost" data-action="close-modal">Close</button>' +
      '<button class="btn ghost" data-action="request-qr" data-id="' + r.id + '">Link &amp; QR</button>' +
      (b && unpaid.length ? '<button class="btn" data-action="chase" data-id="' + b.id + '">Remind ' + unpaid.length + " unpaid</button>" : ""),
      true, true);
  };

  A["goal-edit"] = function (el) { state.goalEdit = (state.goalEdit === el.dataset.k || !el.dataset.k) ? null : el.dataset.k; renderDash(); };
  A["goal-add"] = function (el) {
    var k = kom(el.dataset.k);
    k.goals.push({ t: "New goal", now: 0, target: 10 });
    renderDash();
  };
  A["goal-del"] = function (el) {
    var k = kom(el.dataset.k);
    k.goals.splice(Number(el.dataset.i), 1);
    logA("A goal was removed from " + k.name);
    renderDash();
  };
  A["ctee-meeting-add"] = function (el) {
    var k = kom(el.dataset.k);
    openModal("Log a " + k.name + " meeting",
      '<div class="row2"><div class="field"><label>Date</label><input type="date" id="cmD" value="2026-10-26"></div>' +
      '<div class="field"><label>Present</label><input type="number" id="cmP" value="' + (k.members.length + 1) + '"></div></div>' +
      '<div class="field"><label>One-line summary</label><input type="text" id="cmN" value="Reviewed progress against the year\u2019s goals."></div>' +
      '<div class="field"><label>Minutes</label><textarea id="cmM" rows="7" placeholder="Called to order, present, business, motions, adjourned\u2026">Called to order at 6:30 PM by the chair.\n\nPresent: see roster.\n\nBusiness:\n1. \n2. \n\nAdjourned at 7:30 PM.</textarea></div>' +
      '<label class="checkline"><input type="checkbox" checked><span>Also file a copy in the Vault under Minutes</span></label>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="ctee-meeting-save" data-k="' + k.id + '">Save meeting</button>');
  };
  A["ctee-meeting-save"] = function (el) {
    var k = kom(el.dataset.k);
    var mt = { date: $("#cmD").value || "2026-10-26", present: Number($("#cmP").value) || 0,
      note: $("#cmN").value.trim(), minutes: $("#cmM").value.trim() };
    k.meetings.unshift(mt);
    db.docs.unshift({ id: uid("d"), name: k.name + " \u2014 Minutes " + dShort(mt.date) + ".pdf", folder: "Minutes",
      vis: "all", size: "96 KB", updated: "Oct 2026", by: full(member(ROLE_MEMBER[state.role])), opens: 0 });
    logA(k.name + " meeting minutes filed for " + dLabel(mt.date));
    notify("doc", k.name + " minutes posted", mt.note);
    toast("Meeting logged", "minutes filed in the Vault");
    closeModal(); render();
  };
  A["ctee-minutes"] = function (el) {
    var k = kom(el.dataset.k), i = Number(el.dataset.i), mt = k.meetings[i];
    openModal(k.name + " \u00b7 " + dLabel(mt.date),
      '<div class="kv"><span class="k">Present</span><span class="v num">' + mt.present + "</span></div>" +
      '<div class="kv"><span class="k">Summary</span><span class="v" style="text-align:right;max-width:60%">' + esc(mt.note) + "</span></div>" +
      '<div class="asec" style="margin-top:14px">Minutes</div>' +
      (mt.minutes ? '<div class="minutesbox">' + esc(mt.minutes) + "</div>"
        : '<div class="field"><textarea id="cmEdit" rows="9" placeholder="Type or paste the minutes here\u2026"></textarea></div>'),
      '<button class="btn ghost" data-action="close-modal">Close</button>' +
      (mt.minutes ? "" : '<button class="btn" data-action="ctee-minutes-save" data-k="' + k.id + '" data-i="' + i + '">File the minutes</button>'),
      false, true);
  };
  A["ctee-minutes-save"] = function (el) {
    var k = kom(el.dataset.k), mt = k.meetings[Number(el.dataset.i)];
    mt.minutes = $("#cmEdit").value.trim();
    db.docs.unshift({ id: uid("d"), name: k.name + " \u2014 Minutes " + dShort(mt.date) + ".pdf", folder: "Minutes",
      vis: "all", size: "96 KB", updated: "Oct 2026", by: full(member(ROLE_MEMBER[state.role])), opens: 0 });
    logA(k.name + " minutes filed for " + dLabel(mt.date));
    toast("Minutes filed", "a copy went to the Vault");
    closeModal(); render();
  };

  A["cal-prev"] = function () { state.calYM = ymShift(state.calYM, -1); renderDash(); };
  A["cal-next"] = function () { state.calYM = ymShift(state.calYM, 1); renderDash(); };
  A["cal-today"] = function () { state.calYM = "2026-10"; renderDash(); };
  A["open-event"] = function (el) { state.view = "events"; state.evId = el.dataset.id; state.komId = null; render(); window.scrollTo(0, 0); };
  A["event-back"] = function () { state.evId = null; renderDash(); };
  A["push-rsvp"] = function (el) {
    var e = ev(el.dataset.id);
    var notYet = actives().filter(function (m) { return e.rsvps.indexOf(m.id) < 0; });
    openModal("Push an RSVP request",
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:13px">' + esc(e.title) + " &middot; " + dLabel(e.date) + "</p>" +
      '<div class="field"><label>Message</label><textarea id="rsvpMsg" rows="3">Brothers, we need a head count for ' +
      esc(e.title) + ". Tap to RSVP so we can set the room.</textarea></div>" +
      '<label class="checkline"><input type="checkbox" checked><span>Push to the ' + notYet.length +
      " brothers who have not answered</span></label>" +
      '<label class="checkline"><input type="checkbox"><span>Also remind the ' + e.rsvps.length + " already going</span></label>" +
      '<label class="checkline"><input type="checkbox"><span>Send as a text message too</span></label>' +
      '<div class="banner" style="margin-bottom:0">The push lands in his app with <b>Going</b> and <b>Request excuse</b> buttons, so he answers without typing anything.</div>',
      '<button class="btn ghost" data-action="close-modal">Cancel</button>' +
      '<button class="btn" data-action="send-rsvp-push" data-id="' + e.id + '">Push to ' + notYet.length + " phones</button>");
  };
  A["send-rsvp-push"] = function (el) {
    var e = ev(el.dataset.id);
    var notYet = actives().filter(function (m) { return e.rsvps.indexOf(m.id) < 0; });
    notify("cal", "RSVP needed: " + e.title, ($("#rsvpMsg") ? $("#rsvpMsg").value.trim() : "") +
      " \u00b7 " + dLabel(e.date) + " at " + e.place);
    logA("RSVP push sent to " + notYet.length + " brothers for " + e.title);
    toast(notYet.length + " RSVP requests pushed", "Going / Request excuse right in the app");
    closeModal(); render();
  };
  A["nudge-one"] = function (el) {
    var e = ev(el.dataset.id), m = member(el.dataset.m);
    notify("cal", "RSVP needed: " + e.title, dLabel(e.date) + " at " + e.place + ". Tap to answer.");
    logA(full(m) + " was nudged about " + e.title);
    toast(full(m) + " nudged", "push sent to his phone");
    render();
  };
  A["edit-event"] = function (el) {
    var e = ev(el.dataset.id);
    openModal("Edit " + e.title,
      '<div class="field"><label>Event</label><input type="text" id="eeT" value="' + esc(e.title) + '"></div>' +
      '<div class="row3"><div class="field"><label>Date</label><input type="date" id="eeD" value="' + e.date + '"></div>' +
      '<div class="field"><label>Ticket price</label><input type="number" id="eeP" value="' + e.price + '"></div>' +
      '<div class="field"><label>Service hours</label><input type="number" id="eeH" value="' + (e.hours || 0) + '"></div></div>' +
      '<div class="field"><label>Location</label><input type="text" id="eeL" value="' + esc(e.place) + '"></div>' +
      '<label class="checkline"><input type="checkbox" id="eeM"' + (e.mandatory ? " checked" : "") + "><span>Mandatory</span></label>",
      '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-event" data-id="' + e.id + '">Save</button>');
  };
  A["save-event"] = function (el) {
    var e = ev(el.dataset.id);
    e.title = $("#eeT").value.trim() || e.title; e.date = $("#eeD").value || e.date;
    e.place = $("#eeL").value.trim() || e.place; e.price = Math.max(0, Number($("#eeP").value) || 0);
    e.hours = Math.max(0, Number($("#eeH").value) || 0); e.mandatory = $("#eeM").checked;
    logA(e.title + " was updated");
    notify("cal", e.title + " \u2014 details changed", dLabel(e.date) + " at " + e.place + ".");
    toast("Event updated", "everyone going was notified");
    closeModal(); render();
  };

  /* ---------------- service: one brother's record ---------------- */
  A["service-member"] = function (el) {
    var m = member(el.dataset.id);
    var mine = db.service.filter(function (x) { return x.memberId === m.id; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var fromEv = mine.filter(function (x) { return x.eventId; });
    var own = mine.filter(function (x) { return !x.eventId; });
    var tot = totalHours(m.id);
    function block(list, label) {
      return '<div class="asec">' + label + '</div><div class="card" style="margin-bottom:12px"><div class="card-b flush">' +
        (list.length ? list.map(function (x) {
          return '<div class="docrow"><div><div class="dn">' + esc(x.what) + '</div><div class="dm">' + dLabel(x.date) +
            (x.auto ? " &middot; credited at check-in" : " &middot; logged by him") + "</div></div>" +
            '<span class="sp"></span><span class="chip ' + (x.status === "approved" ? "paid" : x.status === "denied" ? "late" : "due") + '">' +
            x.hours + " hrs</span></div>";
        }).join("") : '<div class="empty">None.</div>') + "</div></div>";
    }
    openModal(full(m) + " \u2014 service hours",
      '<div class="prof-h">' + av(m, 52) + '<div><div class="pn">' + esc(full(m)) + '</div><div class="pm">' +
      esc(m.jobTitle) + ", " + esc(m.employer) + "</div></div></div>" +
      '<div class="statrow" style="margin-bottom:14px">' +
      '<div><div class="sl">Approved hours</div><div class="sv">' + tot + "</div></div>" +
      '<div><div class="sl">Toward goal</div><div class="sv">' + Math.min(100, Math.round(tot / 20 * 100)) + "%</div></div>" +
      '<div><div class="sl">Events</div><div class="sv">' + eventsAttended(m.id).length + "</div></div>" +
      '<div><div class="sl">Pending</div><div class="sv">' + mine.filter(function (x) { return x.status === "pending"; }).length + "</div></div></div>" +
      block(fromEv, "Credited from chapter events") + block(own, "Logged on his own"),
      '<button class="btn ghost" data-action="close-modal">Close</button>' +
      '<button class="btn ghost" data-action="profile" data-id="' + m.id + '">Full record</button>' +
      '<button class="btn" data-action="log-service" data-id="">Log hours for him</button>', true, true);
  };

  /* ---------------- budget editing ---------------- */
  A["budget-edit"] = function (el) { state.budgetEdit = el.dataset.v === "1"; renderDash(); };
  A["bline"] = function () {};
  A["bdel"] = function (el) {
    db.budget.splice(Number(el.dataset.i), 1);
    logA("A budget line was removed");
    toast("Line removed", "");
    renderDash();
  };
  A["badd"] = function () {
    db.budget.push({ line: "New line", cat: "Expense", planned: 0, actual: 0 });
    toast("Line added", "name it and set the amounts");
    renderDash();
  };
  A["unpaid-list"] = function (el) {
    var b = bill(el.dataset.id);
    var unpaid = actives().filter(function (m) { return paidBy(m.id, b.id) < b.amount; })
      .sort(function (a, b2) { return (full(a) < full(b2) ? -1 : 1); });
    openModal("Unpaid \u00b7 " + b.title,
      '<p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">' + unpaid.length + " of " + actives().length +
      " brothers have not paid " + money(b.amount) + ", due " + dLabel(b.due) + ".</p>" +
      '<div class="card"><div class="card-b flush" style="max-height:380px;overflow-y:auto">' +
      (unpaid.length ? unpaid.map(function (m) {
        var owed = b.amount - paidBy(m.id, b.id);
        return '<div class="rowbtn" style="cursor:default">' + av(m, 30) +
          '<div class="rb-x"><div class="rb-t">' + esc(full(m)) + '</div><div class="rb-m">' + esc(m.roles[0]) +
          (paidBy(m.id, b.id) > 0 ? " &middot; part paid " + money(paidBy(m.id, b.id)) : "") + "</div></div>" +
          '<span class="chip late">' + money(owed) + "</span>" +
          '<button class="btn ghost sm" data-action="share-bill" data-id="' + b.id + '" data-member="' + m.id + '">Link</button>' +
          '<button class="btn ghost sm" data-action="record-payment" data-id="' + m.id + '">Record</button></div>';
      }).join("") : '<div class="empty">Everybody has paid this one.</div>') + "</div></div>",
      '<button class="btn ghost" data-action="close-modal">Close</button>' +
      '<button class="btn ghost" data-action="export">Export list</button>' +
      (unpaid.length ? '<button class="btn" data-action="chase" data-id="' + b.id + '">Remind all ' + unpaid.length + "</button>" : ""),
      true, true);
  };

  A["reset"] = function () {
    db = window.QUORUM_SEED();
    state.role = myProfile().role; state.view = "home"; state.tab = "home"; state.search = ""; state.filter = "all";
    state.selected = {}; state.channel = "c1"; state.appChannel = "c1"; state.moreView = null; state.komId = null;
    var pz = document.querySelector(".printzone"); if (pz) pz.remove();
    document.documentElement.style.removeProperty("--brand");
    var _t = $("#ticker"); if (_t) _t.innerHTML = "";
    if (window.QUORUM_SHELL) window.QUORUM_SHELL.clearLive();
    closeModal(); closeSheet(); render();
  };


  /* ================= committee detail page ================= */
  function komMembers(k) {
    return k.members.map(function (nm) { return db.members.filter(function (m) { return full(m) === nm; })[0]; }).filter(Boolean);
  }
  function viewCommitteeDetail() {
    var k = kom(state.komId);
    if (!k) { state.komId = null; return viewCommittees(); }
    var ch = member(k.chair), mem = komMembers(k), c = catOf(k.cat);
    var done = k.tasks.filter(function (t) { return t.done; }).length;
    var pct = k.budget ? Math.round((k.spent / k.budget) * 100) : 0;

    var goals;
    if (state.goalEdit === k.id) {
      goals = '<div style="padding:12px 14px">' +
        '<div class="goaledit" style="font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em">' +
        "<span>Goal</span><span>Now</span><span>Target</span><span></span></div>" +
        k.goals.map(function (g, i) {
          return '<div class="goaledit">' +
            '<input value="' + esc(g.t) + '" data-action="goalfield" data-k="' + k.id + '" data-i="' + i + '" data-f="t">' +
            '<input type="number" value="' + g.now + '" data-action="goalfield" data-k="' + k.id + '" data-i="' + i + '" data-f="now">' +
            '<input type="number" value="' + g.target + '" data-action="goalfield" data-k="' + k.id + '" data-i="' + i + '" data-f="target">' +
            '<button class="delbtn" data-action="goal-del" data-k="' + k.id + '" data-i="' + i + '">&times;</button></div>';
        }).join("") +
        '<div style="display:flex;gap:7px;margin-top:10px"><button class="btn ghost sm" data-action="goal-add" data-k="' + k.id + '">Add a goal</button>' +
        '<button class="btn sm" data-action="goal-edit" data-k="" >Done</button></div></div>';
    } else {
      goals = k.goals.length ? k.goals.map(function (g) {
        var gp = Math.min(100, Math.round((g.now / g.target) * 100));
        return '<div class="goal"><div class="gt"><span>' + esc(g.t) + '</span><span class="gn">' + g.now + " / " + g.target + "</span></div>" +
          '<div class="meter"><i class="' + (gp >= 75 ? "hi" : gp < 30 ? "lo" : "") + '" style="width:' + gp + '%"></i></div></div>';
      }).join("") : '<div class="empty">No goals set yet. Use Set goals to add the first one.</div>';
    }

    var tasks = k.tasks.length ? k.tasks.map(function (t) {
      var late = !t.done && daysLate(t.due) > 0;
      return '<div class="taskrow"><button class="tbox' + (t.done ? " done" : "") + '" data-action="toggle-task" data-k="' + k.id + '" data-t="' + t.id +
        '" aria-label="Toggle">' + (t.done ? "&#10003;" : "") + "</button>" +
        '<div class="tk"><div class="tkn" style="' + (t.done ? "text-decoration:line-through;color:var(--muted)" : "") + '">' + esc(t.t) + "</div>" +
        '<div class="tkm">' + esc(t.who) + " &middot; due " + dShort(t.due) + "</div></div>" +
        (late ? '<span class="chip late">' + daysLate(t.due) + "d late</span>" : t.done ? '<span class="chip paid">Done</span>' : '<span class="chip neutral">Open</span>') + "</div>";
    }).join("") : '<div class="empty">No tasks assigned.</div>';

    var meets = k.meetings.length ? k.meetings.map(function (mt, mi) {
      return '<div class="docrow"><div style="min-width:40px;text-align:center"><div class="num" style="font-weight:700;font-size:14px">' + dShort(mt.date).split(" ")[1] + "</div>" +
        '<div style="font-size:9px;color:var(--muted);text-transform:uppercase">' + dShort(mt.date).split(" ")[0] + "</div></div>" +
        '<div style="flex:1"><div class="dn">' + mt.present + " present" +
        (mt.minutes ? ' <span class="chip paid">Minutes filed</span>' : ' <span class="chip due">No minutes</span>') + "</div>" +
        '<div class="dm">' + esc(mt.note) + "</div></div>" +
        '<button class="btn ghost sm" data-action="ctee-minutes" data-k="' + k.id + '" data-i="' + mi + '">' +
        (mt.minutes ? "Read" : "Add minutes") + "</button></div>";
    }).join("") : '<div class="empty">No meetings logged.</div>';

    var lines = k.lines.length ? ('<div class="tw"><table><thead><tr><th>Line</th><th class="r">Budgeted</th><th class="r">Spent</th><th class="r">Left</th></tr></thead><tbody>' +
      k.lines.map(function (l) {
        return "<tr><td>" + esc(l.l) + '</td><td class="money-c r">' + money0(l.planned) + '</td><td class="money-c r">' + money0(l.spent) +
          '</td><td class="money-c r" style="color:' + (l.spent > l.planned ? "var(--late)" : "var(--muted)") + '">' + money0(l.planned - l.spent) + "</td></tr>";
      }).join("") + "</tbody></table></div>") : '<div class="empty">No budget lines.</div>';

    return '<button class="backlink" data-action="back-committees">&lsaquo; All committees</button>' +
      '<div class="dhead"><div><div style="display:flex;gap:6px;margin-bottom:5px">' + catChip(k.cat) + '<span class="chip neutral">Meets ' + esc(k.meets) + "</span></div>" +
      "<h1>" + esc(k.name) + '</h1><p class="sub">' + esc(k.charge) + "</p></div>" +
      '<div class="dactions"><button class="btn ghost" data-action="committee-report" data-id="' + k.id + '">Print report</button>' +
      '<button class="btn ghost" data-action="bulk-message">Message committee</button>' +
      '<button class="btn" data-action="assign" data-committee="' + k.id + '">Add a brother</button></div></div>' +
      '<div class="statrow">' +
      '<div><div class="sl">Members</div><div class="sv">' + (mem.length + 1) + "</div></div>" +
      '<div><div class="sl">Tasks done</div><div class="sv">' + done + " / " + k.tasks.length + "</div></div>" +
      '<div><div class="sl">Budget used</div><div class="sv">' + pct + "%</div></div>" +
      '<div><div class="sl">Spent</div><div class="sv">' + money0(k.spent) + "</div></div>" +
      '<div><div class="sl">Meetings held</div><div class="sv">' + k.meetings.length + "</div></div>" +
      '<div><div class="sl">Next meeting</div><div class="sv" style="font-size:15px;padding-top:4px">' + dShort(k.next) + "</div></div></div>" +
      (k.outcomes.length ? '<div class="sec"><h2>Impact this year</h2><div class="statrow" style="margin-bottom:0">' +
        k.outcomes.map(function (o) { return '<div><div class="sl">' + esc(o.l) + '</div><div class="sv">' + esc(o.v) + "</div></div>"; }).join("") + "</div></div>" : "") +
      '<div class="two"><div>' +
      '<div class="sec"><h2>Goals</h2><div class="card"><div class="card-h"><h3>' + k.goals.length +
      ' this year</h3><button class="btn ghost sm" data-action="goal-edit" data-k="' + k.id + '">' +
      (state.goalEdit === k.id ? "Done" : "Set goals") + '</button></div><div class="card-b flush">' + goals + "</div></div></div>" +
      '<div class="sec"><h2>Tasks</h2><div class="card"><div class="card-h"><h3>' + done + " of " + k.tasks.length +
      ' complete</h3><button class="btn ghost sm" data-action="new-task" data-k="' + k.id + '">Add task</button></div>' +
      '<div class="card-b flush">' + tasks + "</div></div></div></div><div>" +
      '<div class="sec"><h2>Roster</h2><div class="card"><div class="card-b flush">' +
      '<div class="docrow">' + av(ch) + '<div><div class="dn">' + esc(full(ch)) + '</div><div class="dm">' + esc(ch.jobTitle) + " &middot; " + esc(ch.employer) +
      '</div></div><span class="sp"></span><span class="chip brand">Chair</span></div>' +
      mem.map(function (m) {
        return '<div class="docrow">' + av(m) + '<div><div class="dn">' + esc(full(m)) + '</div><div class="dm">' + esc(m.jobTitle) + " &middot; " + esc(m.industry) +
          '</div></div><span class="sp"></span><button class="btn ghost sm" data-action="profile" data-id="' + m.id + '">Open</button></div>';
      }).join("") + "</div></div></div>" +
      '<div class="sec"><h2>Budget lines</h2><div class="card"><div class="card-b flush">' + lines + "</div></div></div>" +
      '<div class="sec"><h2>Meeting log</h2><div class="card"><div class="card-h"><h3>' + k.meetings.length +
      ' meetings</h3><button class="btn ghost sm" data-action="ctee-meeting-add" data-k="' + k.id + '">Log a meeting</button></div>' +
      '<div class="card-b flush">' + meets + "</div></div></div>" +
      attachedDocs("Committee documents", "komId", k.id, "Programs") + "</div></div>";
  }

  /* ================= printable report ================= */
  function openReportWindow(title, docHTML) {
    var css = "";
    try {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        try {
          var rl = sheets[i].cssRules;
          for (var j = 0; j < rl.length; j++) css += rl[j].cssText + "\n";
        } catch (e) {}
      }
    } catch (e) {}
    var doc = "<!doctype html><html><head><meta charset=utf-8><title>" + esc(title) + "</title>" +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100,600;100,700;110,700;110,800&family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">' +
      "<style>" + css + "body{margin:0;background:#EFF1F3;font-family:var(--ui)}" +
      ".pz-body{padding:26px 18px 60px}" +
      ".printbar{position:sticky;top:0;z-index:2;display:flex;gap:9px;align-items:center;padding:11px 18px;background:#12161B;color:#fff}" +
      ".printbar button{background:#fff;color:#12161B;border:0;border-radius:8px;padding:7px 14px;font-weight:700;font-size:13px;cursor:pointer}" +
      ".printbar .sp{flex:1}@media print{.printbar{display:none}.pz-body{padding:0}.reportdoc{border:0;padding:0;max-width:none}" +
      "@page{margin:.6in;size:letter portrait}}</style></head><body>" +
      '<div class="printbar"><b>' + esc(title) + '</b><span class="sp"></span>' +
      '<span style="font-size:11.5px;opacity:.75">Print &rarr; Destination: Save as PDF</span>' +
      '<button onclick="window.print()">Print / Save as PDF</button></div>' +
      '<div class="pz-body">' + docHTML + "</div></body></html>";
    var w = null;
    try { w = window.open("", "_blank", "width=1000,height=860"); } catch (e) {}
    if (w && w.document) {
      w.document.open(); w.document.write(doc); w.document.close();
      try { w.focus(); } catch (e) {}
      toast("Report opened in a new window", "use Print and choose Save as PDF");
      return true;
    }
    return false;
  }
  function openPrintZone(title, docHTML) {
    var old = document.querySelector(".printzone"); if (old) old.remove();
    var z = document.createElement("div");
    z.className = "printzone";
    z.innerHTML = '<div class="pz-bar"><span class="pzt">' + esc(title) + '</span><span class="sp"></span>' +
      '<span style="font-size:11.5px;opacity:.75;margin-right:6px">Print &rarr; Destination: Save as PDF</span>' +
      '<button class="btn ghost" data-action="close-print">Close</button>' +
      '<button class="btn" data-action="do-print">Print / Save as PDF</button></div>' +
      '<div class="pz-body">' + docHTML + "</div>";
    document.body.appendChild(z);
    z.scrollTop = 0;
  }
  function repHead(title, period) {
    return '<div class="rep-head"><div><div class="rh-org">' + esc(db.chapter.name) + '</div>' +
      '<div class="rh-sub">' + esc(db.chapter.org) + " &middot; " + esc(db.chapter.district) + " &middot; chartered " + db.chapter.founded + "</div></div>" +
      '<div class="rh-r">Prepared ' + dLabel(isoToday()) + "<br>by " + esc(full(member(ROLE_MEMBER[state.role]))) + "<br>" + esc(member(ROLE_MEMBER[state.role]).roles[0]) + "</div></div>" +
      '<div class="rep-title">' + esc(title) + '</div><div class="rep-period">' + esc(period) + "</div>";
  }
  function repFoot(n) {
    return '<div class="rep-sig"><div>Chair signature &middot; date</div><div>Polemarch signature &middot; date</div></div>' +
      '<div class="rep-foot"><span>' + esc(db.chapter.name) + " &middot; confidential chapter record</span><span>Generated by Quorum &middot; page 1 of " + (n || 1) + "</span></div>";
  }
  function committeeReportDoc(only) {
    var list = only ? [kom(only)] : db.committees;
    var totB = list.reduce(function (a, k) { return a + k.budget; }, 0);
    var totS = list.reduce(function (a, k) { return a + k.spent; }, 0);
    var totM = list.reduce(function (a, k) { return a + komMembers(k).length + 1; }, 0);
    var totT = list.reduce(function (a, k) { return a + k.tasks.filter(function (t) { return t.done; }).length; }, 0);
    var allT = list.reduce(function (a, k) { return a + k.tasks.length; }, 0);
    var body = '<div class="reportdoc">' + repHead(only ? kom(only).name + " Committee Report" : "Standing Committee Report", "Fiscal year 2026–27 · July 1, 2026 through June 30, 2027") +
      '<div class="rep-sum"><div><div class="l">Committees</div><div class="v">' + list.length + "</div></div>" +
      '<div><div class="l">Brothers serving</div><div class="v">' + totM + "</div></div>" +
      '<div><div class="l">Budgeted</div><div class="v">' + money0(totB) + "</div></div>" +
      '<div><div class="l">Expended</div><div class="v">' + money0(totS) + "</div></div></div>" +
      '<div class="rep-h2">Summary</div><table class="rep-table"><thead><tr><th>Committee</th><th>Program area</th><th>Chair</th>' +
      '<th class="n">Members</th><th class="n">Budget</th><th class="n">Spent</th><th class="n">Used</th><th class="n">Tasks</th></tr></thead><tbody>' +
      list.map(function (k) {
        var mm = komMembers(k).length + 1, used = k.budget ? Math.round(k.spent / k.budget * 100) + "%" : "—";
        return "<tr><td><b>" + esc(k.name) + "</b></td><td>" + esc(catOf(k.cat).label) + "</td><td>" + esc(full(member(k.chair))) + "</td>" +
          '<td class="n">' + mm + '</td><td class="n">' + (k.budget ? money0(k.budget) : "—") + '</td><td class="n">' + money0(k.spent) +
          '</td><td class="n">' + used + '</td><td class="n">' + k.tasks.filter(function (t) { return t.done; }).length + "/" + k.tasks.length + "</td></tr>";
      }).join("") +
      '<tr style="background:#F0F2F4;font-weight:700"><td colspan="3">Total</td><td class="n">' + totM + '</td><td class="n">' + money0(totB) +
      '</td><td class="n">' + money0(totS) + '</td><td class="n">' + (totB ? Math.round(totS / totB * 100) + "%" : "—") + '</td><td class="n">' + totT + "/" + allT + "</td></tr>" +
      "</tbody></table>" +
      '<div class="rep-h2">Committee detail</div>' +
      list.map(function (k) {
        var mm = komMembers(k);
        return '<div class="rep-com" style="border-left-color:' + catOf(k.cat).color + '"><h4>' + esc(k.name) + "</h4>" +
          '<div class="rc-meta">' + esc(catOf(k.cat).label) + " &middot; Chair: " + esc(full(member(k.chair))) + " &middot; Meets " + esc(k.meets) +
          " &middot; Next: " + dLabel(k.next) + "</div>" +
          '<div class="rc-charge"><b>Charge.</b> ' + esc(k.charge) + "</div>" +
          '<div class="rc-grid">' + k.outcomes.map(function (o) { return "<div><b>" + esc(o.v) + "</b>" + esc(o.l) + "</div>"; }).join("") +
          "<div><b>" + money0(k.spent) + " / " + money0(k.budget) + "</b>Budget</div>" +
          "<div><b>" + (mm.length + 1) + "</b>Members</div></div>" +
          (k.goals.length ? "<div><b style=\"font-size:11px\">Goals.</b><ul>" + k.goals.map(function (g) {
            return "<li>" + esc(g.t) + " — <b>" + g.now + " of " + g.target + "</b> (" + Math.round(g.now / g.target * 100) + "%)</li>";
          }).join("") + "</ul></div>" : "") +
          (k.tasks.length ? "<div style=\"margin-top:7px\"><b style=\"font-size:11px\">Open items.</b><ul>" +
            (k.tasks.filter(function (t) { return !t.done; }).map(function (t) { return "<li>" + esc(t.t) + " — " + esc(t.who) + ", due " + dLabel(t.due) + "</li>"; }).join("") ||
             "<li>None. All tasks complete.</li>") + "</ul></div>" : "") +
          (k.meetings.length ? "<div style=\"margin-top:7px\"><b style=\"font-size:11px\">Meetings held.</b><ul>" +
            k.meetings.map(function (mt) { return "<li>" + dLabel(mt.date) + " — " + mt.present + " present. " + esc(mt.note) + "</li>"; }).join("") + "</ul></div>" : "") +
          "<div style=\"margin-top:7px;font-size:11px;color:#5A626C\"><b>Roster.</b> " +
          esc(full(member(k.chair))) + " (chair)" + (mm.length ? ", " + mm.map(function (x) { return esc(full(x)); }).join(", ") : "") + "</div></div>";
      }).join("") + repFoot(1) + "</div>";
    return body;
  }

  /* ================= payment requests ================= */
  function reqCollected(r) {
    if (r.billId) { var b = bill(r.billId); return db.payments.reduce(function (s2, p) { return s2 + (p.billId === r.billId ? p.amount : 0); }, 0); }
    return r.collected || 0;
  }
  function reqTarget(r) {
    if (r.billId) { var b = bill(r.billId); return b ? b.amount * actives().length : 0; }
    if (r.kind === "some") return r.amount * 6;
    return 0;
  }
  function viewRequests() {
    var cards = db.requests.map(function (r) {
      var got = reqCollected(r), tgt = reqTarget(r), pct = tgt ? Math.min(100, Math.round(got / tgt * 100)) : 0;
      var url = "https://quorum.app/p/" + r.code;
      var KIND = { chapter: ["Chapter-wide bill", "brand"], some: ["Selected brothers", "neutral"], open: ["Open collection", "due"], event: ["Event ticket", "neutral"] };
      var kk = KIND[r.kind] || KIND.chapter;
      return '<div class="reqcard"><div class="rq-h"><div style="flex:1;cursor:pointer" data-action="request-detail" data-id="' + r.id + '"><div class="rq-n">' + esc(r.title) + "</div>" +
        '<div class="rq-m">' + esc(r.audience) + " &middot; created " + dShort(r.created) + " &middot; due " + dLabel(r.due) + "</div></div>" +
        '<span class="chip ' + kk[1] + '">' + kk[0] + "</span>" +
        (r.pushed ? '<span class="pushpill">&#10003; Pushed to app</span>' : '<button class="btn sm" data-action="push-request" data-id="' + r.id + '">Push to app</button>') +
        "</div><div class=\"rq-b\">" +
        '<div class="f">Amount<b>' + (r.amount ? money0(r.amount) : "Any amount") + "</b></div>" +
        '<div class="f">Collected<b style="color:var(--paid)">' + money0(got) + "</b></div>" +
        (tgt ? '<div class="f">Target<b>' + money0(tgt) + "</b></div>" : "") +
        (r.payers ? '<div class="f">Payers<b>' + r.payers + "</b></div>" : "") +
        '<div style="flex:1;min-width:120px">' + (tgt ? '<div class="meter"><i class="hi" style="width:' + pct + '%"></i></div>' : "") + "</div>" +
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" data-action="copy" data-v="' + esc(url) + '">Copy link</button>' +
        '<button class="btn ghost sm" data-action="request-qr" data-id="' + r.id + '">Link &amp; QR</button>' +
        '<button class="btn sm ghost" data-action="request-detail" data-id="' + r.id + '">Open</button>' +
        (r.billId ? '<button class="btn sm" data-action="unpaid-list" data-id="' + r.billId + '">See unpaid</button>' : "") +
        "</div></div></div>";
    }).join("");
    var totalOpen = db.requests.reduce(function (a, r) { return a + reqCollected(r); }, 0);
    return '<div class="dhead"><div><h1>Payment Requests</h1><p class="sub">Anything the chapter needs money for starts here &mdash; dues, assessments, line jackets, an ad book, a trip. Every request becomes a link, a QR code and a push notification on every phone.</p></div>' +
      '<div class="dactions"><button class="btn" data-action="new-request">New payment request</button></div></div>' +
      '<div class="statrow"><div><div class="sl">Open requests</div><div class="sv">' + db.requests.length + "</div></div>" +
      '<div><div class="sl">Collected through links</div><div class="sv">' + money0(totalOpen) + "</div></div>" +
      '<div><div class="sl">Not yet pushed</div><div class="sv">' + db.requests.filter(function (r) { return !r.pushed; }).length + "</div></div>" +
      '<div><div class="sl">Brothers reached</div><div class="sv">' + actives().length + "</div></div></div>" + cards;
  }

  /* ---------------------------------------------------- delegation */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var a = el.dataset.action;
    if (A[a]) {
      e.preventDefault();
      if (!mayDo(a)) { refuse(a); return; }
      var before = navSig();
      A[a](el);
      if (navSig() !== before && window.QUORUM_SHELL && window.QUORUM_SHELL.pushNav) window.QUORUM_SHELL.pushNav();
    }
  });
  document.addEventListener("change", function (e) {
    var el = e.target.closest("[data-action]");
    if (el && el.dataset.action === "select") A["select"](el);
    if (el && el.dataset.action === "bill-event") A["bill-event"](el);
    if (el && (el.dataset.action === "bplanned" || el.dataset.action === "bactual" || el.dataset.action === "bline")) {
      var row = db.budget[Number(el.dataset.i)];
      if (row) {
        if (el.dataset.action === "bline") row.line = el.value.trim() || row.line;
        else row[el.dataset.action === "bplanned" ? "planned" : "actual"] = Math.max(0, Number(el.value) || 0);
        logA("Budget updated: " + row.line);
        render();
      }
    }
    if (el && el.dataset.action === "goalfield") {
      var k = kom(el.dataset.k), g = k && k.goals[Number(el.dataset.i)];
      if (g) {
        if (el.dataset.f === "t") g.t = el.value.trim() || g.t;
        else g[el.dataset.f] = Math.max(0, Number(el.value) || 0);
        renderDash();
      }
    }
    if (e.target.id === "roleSelect") { state.role = e.target.value; state.view = "home"; state.komId = null; render(); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "memberSearch") { state.search = e.target.value; state.focusSearch = true; renderDash(); }
  });
  document.addEventListener("submit", function (e) {
    var f = e.target.closest("[data-action]"); if (!f) return;
    e.preventDefault();
    if (f.dataset.action === "send-dash") {
      var i = $("#dashInput"), t = i.value.trim(); if (!t) return;
      var c = chan(state.channel);
      c.msgs.push({ who: ROLE_MEMBER[state.role], text: t, at: "Just now", views: 0, reacts: {} });
      if (c.vis === "all") notify("chat", "New message in " + c.name, t);
      toast("Sent to " + c.name, c.vis === "officers" ? "officers only" : "");
      i.value = ""; render();
    }
    if (f.dataset.action === "send-app") {
      var ai = $("#appInput"), at = ai.value.trim(); if (!at) return;
      var c2 = chan(state.appChannel);
      c2.msgs.push({ who: ME, text: at, at: "Just now", views: 0, reacts: {} });
      toast("Andre replied in " + c2.name, "officers see it on the dashboard");
      ai.value = ""; render();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (!$("#modalRoot").hidden) closeModal(); if (!$("#appSheet").hidden) closeSheet(); return; }
    if (e.key === "Enter" || e.key === " ") {
      var r = e.target.closest && e.target.closest('[role="button"][data-action]');
      if (r) {
        e.preventDefault();
        var a = r.dataset.action;
        if (A[a]) {
          if (!mayDo(a)) { refuse(a); return; }
          var b4 = navSig();
          A[a](r);
          if (navSig() !== b4 && window.QUORUM_SHELL && window.QUORUM_SHELL.pushNav) window.QUORUM_SHELL.pushNav();
        }
      }
    }
  });
  // the old two-up surface switcher was replaced by the shell's mode bar
  var _sw = document.querySelector(".switcher");
  if (_sw) _sw.addEventListener("click", function (e) {
    var b = e.target.closest("[data-surface]"); if (!b) return;
    document.body.classList.toggle("show-app", b.dataset.surface === "app");
    Array.prototype.forEach.call(this.children, function (c) {
      var on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-selected", on ? "true" : "false");
    });
  });

  function render() { renderSide(); renderDash(); renderApp(); }

  /* ----------------------------- browser Back -----------------------------
     Back is the main gesture on a phone, so it has to move inside the app
     rather than leave it. These are the fields that count as "where you are";
     anything else (a search box, an edit toggle) is not worth a history entry. */
  var NAV_KEYS = ["role", "view", "tab", "komId", "evId", "attEvent", "moreView",
    "channel", "appChannel", "filter", "reqKind", "profileTab", "calYM"];
  function navState() {
    var o = {};
    NAV_KEYS.forEach(function (k) { o[k] = state[k]; });
    return o;
  }
  function navSig() { return JSON.stringify(navState()); }
  function applyNav(o) {
    if (!o) return;
    NAV_KEYS.forEach(function (k) { if (k in o) state[k] = o[k]; });
    closeModal(); closeSheet();
    render();
    window.scrollTo(0, 0);
  }
  function overlayOpen() {
    var m = $("#modalRoot"), s = $("#appSheet");
    return !!((m && !m.hidden) || (s && !s.hidden));
  }
  function closeOverlays() { closeModal(); closeSheet(); }

  /* ---------------- bridge for the shell (modes, identity, live sync) --------------- */
  window.QUORUM = {
    render: render,
    profiles: function () { return PROFILES; },
    member: member,
    full: full,
    av: av,
    me: function () { return ME; },
    committeeChairedBy: function (id) {
      for (var i = 0; i < db.committees.length; i++) if (db.committees[i].chair === id) return db.committees[i].name;
      return null;
    },
    myProfile: myProfile,
    setIdentity: function (id) {
      ME = id;
      var p = myProfile();
      state.role = p.role;
      ROLE_MEMBER.member = id;
      state.view = "home"; state.tab = "home"; state.komId = null; state.moreView = null;
      closeModal(); closeSheet();
      render();
    },
    navState: navState,
    applyNav: applyNav,
    overlayOpen: overlayOpen,
    closeOverlays: closeOverlays,
    snapshot: function () { return db; },
    restore: function (obj) { if (obj && obj.members) { db = obj; render(); } },
    onChange: null
  };

  // every mutating action already calls render(); hang persistence off it
  var _render = render;
  render = function () { _render(); if (window.QUORUM && window.QUORUM.onChange) window.QUORUM.onChange(db); };
  window.QUORUM.render = render;

  // boot with whatever identity the shell picked
  if (window.QUORUM_ME) window.QUORUM.setIdentity(window.QUORUM_ME);
  else render();

  // the shell may have loaded before or after this file; tell it either way
  if (window.QUORUM_SHELL && window.QUORUM_SHELL.bridgeReady) window.QUORUM_SHELL.bridgeReady();
})();
