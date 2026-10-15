/* Mission Control by Tapwise. Vanilla JS, no external calls. Data: status.json (see references/schema.md). */
(function () {
  'use strict';

  var REFRESH_MS = 60000;
  var state = { data: null, feed: 'loading', fetchedAt: null, logKey: '', view: 'ops' };
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var WD = ['sun','mon','tue','wed','thu','fri','sat'];
  var WD_LONG = { sun:'Sundays', mon:'Mondays', tue:'Tuesdays', wed:'Wednesdays', thu:'Thursdays', fri:'Fridays', sat:'Saturdays' };
  var STATUS_COLOUR = { active:'var(--a3)', standby:'var(--warn)', paused:'var(--a2)', offline:'var(--dim)', unknown:'var(--dim)', online:'var(--a)' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  var BROWSER_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
  function tzName() { return (state.data && state.data.team && state.data.team.timezone) || BROWSER_TZ; }

  /* ---------- Time zone helpers (no libraries) ---------- */
  var fmtCache = {};
  function partsIn(ms, tz) {
    var f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
    var o = {};
    f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour % 24, mm: +o.minute, ss: +o.second, wd: WD.indexOf(String(o.weekday).slice(0, 3).toLowerCase()) };
  }
  function offsetMs(ms, tz) {
    var p = partsIn(ms, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
  }
  function zonedToUtc(y, m, d, hh, mm, tz) {
    var t = Date.UTC(y, m - 1, d, hh, mm);
    var o1 = offsetMs(t, tz), r = t - o1, o2 = offsetMs(r, tz);
    return o2 === o1 ? r : t - o2;
  }
  function addDays(y, m, d, n) { var x = new Date(Date.UTC(y, m - 1, d + n)); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), wd: x.getUTCDay() }; }
  function parseHM(s) { if (!s) return null; var a = /^(\d{2}):(\d{2})$/.exec(s); return a ? { h: +a[1], m: +a[2] } : null; }
  function tzAbbr(ms, tz) {
    try { var p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)); for (var i = 0; i < p.length; i++) if (p[i].type === 'timeZoneName') return p[i].value; } catch (e) {}
    return '';
  }
  function parseDateish(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { var a = s.split('-'); return { y: +a[0], m: +a[1], d: +a[2], dateOnly: true }; }
    var t = Date.parse(s); return isNaN(t) ? null : { ms: t };
  }
  function fmtDate(s) {
    var p = parseDateish(s); if (!p) return null;
    if (p.dateOnly) return pad(p.d) + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
    var q = partsIn(p.ms, tzName()); return pad(q.d) + ' ' + MONTHS[q.m - 1] + ' ' + q.y + ' ' + pad(q.hh) + ':' + pad(q.mm);
  }

  /* ---------- Schedules ---------- */
  function fireAt(r, day, tz) { var hm = parseHM(r.schedule.time) || { h: 0, m: 0 }; return zonedToUtc(day.y, day.m, day.d, hm.h, hm.m, tz); }
  function schedule(r, now) {
    var tz = r.timezone || tzName(), s = r.schedule || {}, p = partsIn(now, tz), i, day, t;
    var out = { next: null, prev: null, upcoming: [], timeKnown: !!parseHM(s.time) };
    if (s.kind === 'daily' || s.kind === 'weekly') {
      var days = s.kind === 'daily' ? [0,1,2,3,4,5,6] : (s.weekdays || []).map(function (w) { return WD.indexOf(String(w).toLowerCase()); });
      for (i = -8; i <= 21; i++) {
        day = addDays(p.y, p.m, p.d, i);
        if (days.indexOf(day.wd) < 0) continue;
        t = fireAt(r, day, tz);
        if (t <= now) out.prev = t; else { if (!out.next) out.next = t; out.upcoming.push(t); }
      }
    } else if (s.kind === 'once') {
      var dd = parseDateish(s.date);
      if (dd && dd.dateOnly) { t = fireAt(r, dd, tz); if (t > now) { out.next = t; out.upcoming.push(t); } else out.prev = t; }
    } else if (s.kind === 'yearly') {
      var md = /^(\d{2})-(\d{2})$/.exec(s.month_day || '');
      if (md) for (i = -1; i <= 2; i++) { t = fireAt(r, { y: p.y + i, m: +md[1], d: +md[2] }, tz); if (t <= now) out.prev = t; else { if (!out.next) out.next = t; out.upcoming.push(t); } }
    }
    return out;
  }
  function schedText(r) {
    var s = r.schedule || {}, tm = s.time || null, tz = r.timezone || tzName();
    var tail = tm ? ' ' + tm : ', time not reported';
    if (s.kind === 'daily') return 'Daily' + tail;
    if (s.kind === 'weekly') {
      var wk = (s.weekdays || []).slice().sort(function (x, y) { return WD.indexOf(x) - WD.indexOf(y); }).join(',');
      var label = wk === 'mon,tue,wed,thu,fri' ? 'Weekdays' : wk === 'sun,sat' ? 'Weekends' : wk === 'sun,mon,tue,wed,thu,fri,sat' ? 'Every day' : (s.weekdays || []).map(function (w) { return WD_LONG[w] || w; }).join(', ');
      return label + tail;
    }
    if (s.kind === 'once') return (fmtDate(s.date) || '-') + (tm ? ' ' + tm : ' · time not reported');
    if (s.kind === 'yearly') { var md = (s.month_day || '').split('-'); return 'Yearly, ' + (+md[1]) + ' ' + (MONTHS[+md[0] - 1] || '') + tail; }
    return 'Schedule not reported';
  }
  function splitDur(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
  }
  function durText(ms) { var x = splitDur(ms); return (x.d ? x.d + 'd ' : '') + pad(x.h) + 'h ' + pad(x.m) + 'm ' + pad(x.s) + 's'; }
  function whenText(ms, tz) { var q = partsIn(ms, tz); return WD[q.wd].toUpperCase() + ' ' + pad(q.d) + ' ' + MONTHS[q.m - 1] + ' ' + q.y + ' ' + pad(q.hh) + ':' + pad(q.mm) + ' ' + tzAbbr(ms, tz); }
  function nameOf(id) { var r = (state.data.roster || []).filter(function (x) { return x.id === id; })[0]; return r ? r.name : id; }

  /* ---------- Badges ---------- */
  function badgeHTML(panelId) {
    var p = state.data && state.data.panels && state.data.panels[panelId];
    var src = p && p.source, cls = { LIVE: 'b-live', SNAPSHOT: 'b-snap', DEMO: 'b-demo' }[src] || 'b-none';
    var label = cls === 'b-none' ? 'Unlabelled' : src;
    var html = '<span class="badge ' + cls + '"' + (p && p.note ? ' title="' + esc(p.note) + '"' : '') + '>' + (cls === 'b-live' ? '<i></i>' : '') + esc(label) + '</span>';
    if (p && p.as_of) html = '<span class="asof">As of ' + esc(fmtDate(p.as_of) || p.as_of) + '</span>' + html;
    return html;
  }
  function renderBadges() {
    var slots = document.querySelectorAll('.badge-slot');
    for (var i = 0; i < slots.length; i++) slots[i].innerHTML = badgeHTML(slots[i].getAttribute('data-panel'));
  }

  /* ---------- Static renders (on data load) ---------- */
  function initials(n) { var w = String(n).replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); }

  function renderRoster() {
    var R = state.data.roster || [], html = '';
    var counts = {}, reported = 0;
    R.forEach(function (b) {
      var st = b.status || 'unknown'; counts[st] = (counts[st] || 0) + 1;
      var hasM = b.mission && b.mission !== '-'; if (hasM) reported++;
      html += '<div class="mate s-' + esc(st) + (b.hub ? ' hub' : '') + '" style="--sc:' + (STATUS_COLOUR[st] || 'var(--dim)') + '">' +
        '<div class="mate-hd"><div class="av">' + esc(initials(b.name)) + '</div><div style="min-width:0"><div class="mate-n">' + esc(b.name) + '</div><div class="mate-r">' + esc(b.role || '-') + '</div></div></div>' +
        (b.hub ? '<span class="hubtag">HUB</span>' : '') + '<div class="st">' + esc(st) + '</div>' +
        '<div class="ms-l">Current mission</div>' +
        (hasM ? '<div class="ms-v">' + esc(b.mission) + '</div>' : '<div class="ms-v none">- not yet reported</div>') + '</div>';
    });
    var total = R.length, rows = '';
    ['active','standby','paused','offline'].forEach(function (k) {
      var c = counts[k] || 0;
      rows += '<div class="sm-row"><div class="sm-k"><span>' + k + '</span><b>' + c + '</b></div><div class="bar"><i style="width:' + (total ? c / total * 100 : 0) + '%;' + (k === 'standby' ? 'background:var(--warn);box-shadow:0 0 6px var(--warn)' : k === 'active' ? 'background:var(--a3);box-shadow:0 0 6px var(--a3)' : '') + '"></i></div></div>';
    });
    rows += '<div class="sm-row" style="grid-column:1/-1"><div class="sm-k"><span>Missions reported</span><b>' + reported + ' / ' + total + '</b></div><div class="bar"><i style="width:' + (total ? reported / total * 100 : 0) + '%"></i></div></div>';
    html += '<div class="summary"><div class="sm-h">Crew status, from roster</div>' + rows + '</div>';
    $('crew').innerHTML = html;

    $('m-roster').textContent = total;
    var online = counts.online || 0;
    $('m-roster-sub').textContent = (counts.active || 0) + ' active · ' + (counts.standby || 0) + ' standby' + (online ? ' · ' + online + ' online' : '');
    $('m-roster-bar').style.width = (total ? (counts.active || 0) / total * 100 : 0) + '%';
  }

  function renderDeploys(now) {
    var D = state.data.deploys || [], html = '', dep = 0, pend = 0, latest = null;
    D.forEach(function (d) {
      if (d.status === 'deployed') dep++; if (d.status === 'pending') pend++;
      var dd = parseDateish(d.last_deploy), ago = '';
      if (dd) {
        var ms = dd.dateOnly ? zonedToUtc(dd.y, dd.m, dd.d, 0, 0, tzName()) : dd.ms;
        if (!latest || ms > latest.ms) latest = { ms: ms, name: d.name };
        var p = partsIn(now, tzName()), today = Date.UTC(p.y, p.m - 1, p.d), q = dd.dateOnly ? dd : partsIn(dd.ms, tzName());
        var days = Math.round((today - Date.UTC(q.y, q.m - 1, q.d)) / 86400000);
        ago = days <= 0 ? 'today' : days === 1 ? '1 day ago' : days + ' days ago';
      }
      var host = d.url ? d.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;
      html += '<div class="dr"><div style="min-width:0"><div class="dr-n">' + (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.name) + '</a>' : esc(d.name)) + '</div>' +
        '<div class="dr-u' + (host ? '' : ' none') + '">' + (host ? esc(host) : (d.status === 'pending' ? 'URL after first deploy' : 'URL not listed')) + '</div></div>' +
        '<span class="plat">' + esc(d.platform || '-') + '</span>' +
        '<div class="dr-d' + (dd ? '' : ' none') + '">' + (dd ? esc(fmtDate(d.last_deploy)) + '<small>' + ago + '</small>' : '-<small>not yet reported</small>') + '</div>' +
        '<span class="pill p-' + esc(d.status || 'unknown') + '">' + esc(d.status || 'unknown') + '</span></div>';
    });
    $('dlist').innerHTML = html;
    $('dstats').innerHTML =
      '<div class="ds"><div class="ds-l">Projects known</div><div class="ds-v">' + D.length + '</div></div>' +
      '<div class="ds"><div class="ds-l">Deployed / pending</div><div class="ds-v"><span class="lime">' + dep + '</span> <small>/</small> <span class="amber">' + pend + '</span></div></div>' +
      '<div class="ds"><div class="ds-l">Latest known deploy</div><div class="ds-v" style="font-size:1rem;margin-top:.45rem">' + (latest ? esc(latest.name) : '-') + '</div></div>';
  }

  function renderOrg() {
    var O = state.data.org;
    if (!O) { $('org-top').innerHTML = '<div class="onode"><div class="on-remit">No org section in status.json yet.</div></div>'; $('org-groups').innerHTML = ''; return; }
    var byId = {}; (O.nodes || []).forEach(function (n) { byId[n.id] = n; });
    var rost = {}; (state.data.roster || []).forEach(function (r) { rost[r.id] = r; });
    function anti(list, root) {
      if (root && (!list || !list.length)) return '';
      return '<div class="on-anti"><div class="on-anti-l">Does not</div>' + (list && list.length ? '<ul>' + list.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '<div class="none">- not yet reported</div>') + '</div>';
    }
    function node(id, cls) {
      var n = byId[id] || {}, r = rost[id] || {};
      return '<div class="onode ' + (cls || '') + '" data-node="' + esc(id) + '"><div class="on-n">' + esc(r.name || n.name || id) + '</div><div class="on-r">' + esc(r.role || n.title || '-') + '</div>' +
        '<div class="on-remit">' + (n.remit ? esc(n.remit) : '<span class="ms-v none">- remit not yet reported</span>') + '</div>' + anti(n.anti_jobs) + '</div>';
    }
    var root = O.root || { name: 'Owner' };
    var top = '<div class="onode root" data-node="root"><div class="on-n">' + esc(root.name || 'Owner') + '</div>' + (String(root.title || 'Owner').toLowerCase() !== String(root.name || 'Owner').toLowerCase() ? '<div class="on-r">' + esc(root.title || 'Owner') + '</div>' : '') + (root.remit ? '<div class="on-remit">' + esc(root.remit) + '</div>' : '') + anti(root.anti_jobs, true) + '</div>';
    if (O.hub && rost[O.hub]) top += node(O.hub, 'hubn');
    $('org-top').innerHTML = top;
    $('org-groups').innerHTML = (O.groups || []).map(function (g) {
      return '<div class="ogroup" data-group="' + esc(g.id) + '"><div class="og-h">' + esc(g.name) + '</div>' + (g.members || []).map(function (m) { return node(m); }).join('') + '</div>';
    }).join('');
    $('org-groups').style.gridTemplateColumns = 'repeat(' + Math.max(1, (O.groups || []).length) + ',1fr)';
    var nb = 0; (O.groups || []).forEach(function (g) { nb += (g.members || []).length; });
    $('org-note').textContent = (O.groups || []).length + ' groups · ' + (nb + (O.hub && rost[O.hub] ? 1 : 0)) + ' bots';
    drawOrgLines();
  }

  function drawOrgLines() {
    var svg = $('org-lines'), body = $('org-body');
    if (!svg || $('view-org').hidden) return;
    var B = body.getBoundingClientRect();
    function box(el) { var r = el.getBoundingClientRect(); return { l: r.left - B.left, r: r.right - B.left, t: r.top - B.top, b: r.bottom - B.top, cx: (r.left + r.right) / 2 - B.left, cy: (r.top + r.bottom) / 2 - B.top }; }
    var paths = [], dots = [];
    var rootEl = body.querySelector('.onode.root'), hubEl = body.querySelector('.onode.hubn');
    if (rootEl && hubEl) { var a = box(rootEl), h = box(hubEl); paths.push('M' + a.cx + ' ' + a.b + 'V' + h.t); }
    var heads = body.querySelectorAll('.og-h');
    hubEl = hubEl || rootEl;
    if (hubEl && heads.length) {
      var hb = box(hubEl), first = box(heads[0]), last = box(heads[heads.length - 1]);
      var busY = (hb.b + first.t) / 2;
      paths.push('M' + hb.cx + ' ' + hb.b + 'V' + busY);
      paths.push('M' + first.cx + ' ' + busY + 'H' + last.cx);
      dots.push([hb.cx, busY]);
      for (var i = 0; i < heads.length; i++) { var g = box(heads[i]); paths.push('M' + g.cx + ' ' + busY + 'V' + g.t); }
    }
    var groups = body.querySelectorAll('.ogroup');
    for (var j = 0; j < groups.length; j++) {
      var head = groups[j].querySelector('.og-h'), nodes = groups[j].querySelectorAll('.onode');
      if (!head || !nodes.length) continue;
      var hd = box(head), spineX = box(nodes[0]).l - box(nodes[0]).l * 0 - (parseFloat(getComputedStyle(nodes[0]).marginLeft) / 2);
      var lastY = box(nodes[nodes.length - 1]).t + 18;
      paths.push('M' + hd.cx + ' ' + hd.b + 'V' + (hd.b + 6) + 'H' + spineX + 'V' + lastY);
      for (var k = 0; k < nodes.length; k++) { var nb = box(nodes[k]), y = nb.t + 18; paths.push('M' + spineX + ' ' + y + 'H' + nb.l); dots.push([nb.l, y]); }
    }
    svg.setAttribute('viewBox', '0 0 ' + B.width + ' ' + B.height);
    svg.innerHTML = paths.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + dots.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4"/>'; }).join('');
  }

  /* ---------- Timeline lanes ---------- */
  var WEEK = 7 * 86400000;
  function horizonEnd(now) {
    var far = now + WEEK * 2;
    /* only the next fire of each routine sets the horizon, so a yearly routine does not stretch the axis over several years */
    (state.data.routines || []).forEach(function (r) { var s = schedule(r, now); if (s.next && s.next > far) far = s.next; });
    return far + (far - now) * 0.06;
  }
  function xPos(t, now, end) {
    var d = t - now;
    if (d <= WEEK) return d / WEEK * 74;
    return 76 + (d - WEEK) / (end - now - WEEK) * 24;
  }
  function renderLanes(now) {
    var R = state.data.routines || [], end = horizonEnd(now), html = '';
    var best = nextRoutine(now);
    R.forEach(function (r) {
      var s = schedule(r, now), pips = '';
      s.upcoming.forEach(function (t, i) {
        var once = (r.schedule || {}).kind === 'once' || ((r.schedule || {}).kind === 'yearly' && i === 0);
        if (!once && t - now > WEEK) return;
        var x = xPos(t, now, end); if (x > 100) return;
        pips += '<span class="pip' + (i === 0 ? ' first' : '') + (once ? ' once' : '') + '" style="left:' + x + '%"></span>';
        if (once || i === 0 && (r.schedule || {}).kind === 'weekly') { var q = partsIn(t, r.timezone || tzName()); pips += '<span class="pip-lbl" style="left:' + x + '%">' + pad(q.d) + ' ' + MONTHS[q.m - 1] + (once && q.y !== partsIn(now, tzName()).y ? ' ' + q.y : '') + '</span>'; }
      });
      var prog = (s.prev && s.next) ? (now - s.prev) / (s.next - s.prev) * 100 : null;
      var owner = r.owner ? nameOf(r.owner) : null;
      html += '<div class="lane' + (best && best.r === r ? ' is-next' : '') + '" data-id="' + esc(r.id) + '">' +
        '<div class="ln-info"><div class="ln-name">' + esc(r.name) + '</div><div class="ln-sched">' + esc(schedText(r)) + (owner ? ' · ' + esc(owner) : '') + '</div>' +
        (prog != null ? '<div class="bar" title="Share of the current interval elapsed"><i data-prog style="width:' + prog.toFixed(2) + '%"></i></div>' : '') + '</div>' +
        '<div class="ln-track">' + pips + '</div>' +
        '<div class="ln-cd"><div class="v" data-cd>' + (s.next ? durText(s.next - now) : '-') + '</div><div class="w">' + (s.next ? esc(whenText(s.next, r.timezone || tzName())) : 'No future fire') + '</div></div></div>';
    });
    /* axis */
    var axis = '', p = partsIn(now, tzName());
    for (var i = 1; i <= 7; i++) {
      var day = addDays(p.y, p.m, p.d, i), t = zonedToUtc(day.y, day.m, day.d, 0, 0, tzName()), x = xPos(t, now, end);
      axis += '<span class="tick" style="left:' + x + '%"></span><span class="tick-l' + (day.wd === 1 ? ' wk' : '') + '" style="left:' + x + '%">' + WD[day.wd].toUpperCase() + ' ' + day.d + '</span>';
    }
    axis += '<span class="brk" style="left:75%">//</span>';
    var y = p.y, m = p.m, months = [];
    for (var k = 0; k < 30; k++) {
      m++; if (m > 12) { m = 1; y++; }
      var tm = zonedToUtc(y, m, 1, 0, 0, tzName()); if (tm - now <= WEEK + 86400000 * 4) continue;
      var xm = xPos(tm, now, end); if (xm > 99) break;
      months.push({ x: xm, m: m, y: y });
    }
    var step = Math.max(1, Math.ceil(months.length / 6)), lastX = -10;
    months.forEach(function (o, idx) {
      axis += '<span class="tick" style="left:' + o.x + '%"></span>';
      if (idx % step === 0 && o.x - lastX >= 2.6) { lastX = o.x; axis += '<span class="tick-l" style="left:' + o.x + '%">' + MONTHS[o.m - 1] + (o.m === 1 ? ' ' + String(o.y).slice(2) : '') + '</span>'; }
    });
    html += '<div class="axis-pad"></div><div class="axis">' + axis + '</div><div class="axis-pad"></div>';
    $('lanes').innerHTML = html;
    var tracks = $('lanes').querySelectorAll('.ln-track');
    if (tracks.length) tracks[0].insertAdjacentHTML('beforeend', '<span class="now" style="bottom:auto;height:calc(' + tracks.length + ' * 100% + 1.4rem)"></span>');
    state.lanesAt = now;
  }
  function nextRoutine(now) {
    var best = null;
    (state.data.routines || []).forEach(function (r) { var s = schedule(r, now); if (s.next && (!best || s.next < best.t)) best = { r: r, t: s.next, s: s }; });
    return best;
  }

  /* ---------- Tick (every second) ---------- */
  function tick() {
    var now = Date.now(), tz = tzName();
    var u = new Date(now);
    $('m-utc').textContent = pad(u.getUTCHours()) + ':' + pad(u.getUTCMinutes()) + ':' + pad(u.getUTCSeconds());
    $('m-utc-date').textContent = WD[u.getUTCDay()].toUpperCase() + ' ' + pad(u.getUTCDate()) + ' ' + MONTHS[u.getUTCMonth()] + ' ' + u.getUTCFullYear();
    var p = partsIn(now, tz);
    $('m-local').textContent = pad(p.hh) + ':' + pad(p.mm) + ':' + pad(p.ss);
    $('m-local-date').textContent = tzAbbr(now, tz) + ' · ' + WD[p.wd].toUpperCase() + ' ' + pad(p.d) + ' ' + MONTHS[p.m - 1] + ' · ' + tz;
    if (!state.data) return;

    var tf = Date.parse(state.data.team && state.data.team.team_formed);
    if (!isNaN(tf)) {
      var x = splitDur(now - tf);
      $('m-met').textContent = 'T+ ' + x.d + 'd ' + pad(x.h) + ':' + pad(x.m) + ':' + pad(x.s);
      $('m-met-sub').textContent = 'Since team formed ' + fmtDate(state.data.team.team_formed.slice(0, 10));
    } else { $('m-met').textContent = '-'; $('m-met-sub').textContent = 'team_formed not yet reported'; }

    var best = nextRoutine(now);
    if (best) {
      var btz = best.r.timezone || tz, d = splitDur(best.t - now);
      $('m-next-name').textContent = best.r.name;
      $('m-next-name').classList.toggle('long', best.r.name.length > 26);
      $('nb-name').classList.toggle('long', best.r.name.length > 28);
      $('m-next-cd').textContent = durText(best.t - now);
      $('nb-name').textContent = best.r.name;
      $('nb-when').textContent = whenText(best.t, btz);
      $('d-d').textContent = pad(d.d); $('d-h').textContent = pad(d.h); $('d-m').textContent = pad(d.m); $('d-s').textContent = pad(d.s);
      $('nb-foot').textContent = schedText(best.r) + (best.r.owner ? ' · owner ' + nameOf(best.r.owner) : ' · owner not yet reported');
    } else {
      $('m-next-name').textContent = 'None scheduled'; $('m-next-cd').textContent = '-';
      $('nb-name').textContent = 'None scheduled'; $('nb-when').textContent = '-';
    }

    if (!state.lanesAt || now - state.lanesAt > 15000 || (best && state.lastBest !== best.r.id)) { renderLanes(now); state.lastBest = best && best.r.id; }
    var lanes = $('lanes').querySelectorAll('.lane');
    for (var i = 0; i < lanes.length; i++) {
      var r = (state.data.routines || []).filter(function (z) { return z.id === lanes[i].getAttribute('data-id'); })[0];
      if (!r) continue;
      var s = schedule(r, now), cd = lanes[i].querySelector('[data-cd]'), pr = lanes[i].querySelector('[data-prog]');
      if (cd) cd.textContent = s.next ? durText(s.next - now) : '-';
      if (pr && s.prev && s.next) pr.style.width = ((now - s.prev) / (s.next - s.prev) * 100).toFixed(2) + '%';
    }
    if (state.fetchedAt) {
      var age = Math.floor((now - state.fetchedAt) / 1000);
      var src = state.feed === 'ok' ? 'status.json' : 'inline fallback';
      $('feed-val').textContent = src + ' · checked ' + (age < 60 ? age + 's' : Math.floor(age / 60) + 'm') + ' ago';
    }
  }

  /* ---------- Mission log terminal ---------- */
  var term = { lines: [], i: 0, c: 0, timer: null };
  function logLines() {
    var L = (state.data.log || []).slice().sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
    var out = [{ sys: true, text: '> mission log online. ' + L.length + ' entries from status.json' }];
    L.forEach(function (e) {
      var tag = String(e.tag || 'info').toUpperCase();
      out.push({ date: e.date + (e.time ? ' ' + e.time : ''), tag: tag, cls: 't-' + String(e.tag || 'info').toLowerCase(), text: e.text + (e.bot ? ' (' + nameOf(e.bot) + ')' : '') });
    });
    out.push({ sys: true, text: '> end of log. replay in 60s' });
    return out;
  }
  function lineHTML(l, n) {
    if (l.sys) return '<span class="sys">' + esc(l.text.slice(0, n)) + '</span>';
    var a = ('[' + l.date + ']' + '        ').slice(0, 20), b = (l.tag + '        ').slice(0, 10), full = a + b + l.text, cut = full.slice(0, n);
    var h = '<span class="d">' + esc(cut.slice(0, a.length)) + '</span>';
    if (cut.length > a.length) h += '<span class="' + l.cls + '">' + esc(cut.slice(a.length, a.length + b.length)) + '</span>';
    if (cut.length > a.length + b.length) h += esc(cut.slice(a.length + b.length));
    return h;
  }
  function lineLen(l) { return l.sys ? l.text.length : 20 + 10 + l.text.length; }
  function startTerm() {
    clearTimeout(term.timer);
    term.lines = logLines(); term.i = 0; term.c = 0;
    $('term').innerHTML = '';
    stepTerm();
  }
  function stepTerm() {
    var el = $('term');
    if (term.i >= term.lines.length) {
      el.insertAdjacentHTML('beforeend', '<div class="ln"><span class="cursor"></span></div>');
      el.scrollTop = el.scrollHeight;
      term.timer = setTimeout(startTerm, 60000); return;
    }
    var l = term.lines[term.i];
    var div = el.querySelector('.ln.cur');
    if (!div) { div = document.createElement('div'); div.className = 'ln cur'; el.appendChild(div); }
    term.c += 1 + (Math.random() < 0.3 ? 1 : 0);
    var len = lineLen(l);
    div.innerHTML = lineHTML(l, term.c) + '<span class="cursor"></span>';
    el.scrollTop = el.scrollHeight;
    if (term.c >= len) { div.innerHTML = lineHTML(l, len); div.className = 'ln'; term.i++; term.c = 0; term.timer = setTimeout(stepTerm, 420); }
    else term.timer = setTimeout(stepTerm, 22 + Math.random() * 30);
  }

  /* ---------- Data loading ---------- */
  function apply(data, feed) {
    state.data = data; state.feed = feed; state.fetchedAt = Date.now();
    var f = $('feed'); f.className = 'feed ' + (feed === 'ok' ? 'ok' : 'fallback');
    if (data.team) {
      if (data.team.name) { $('t-name').textContent = String(data.team.name).toUpperCase(); document.title = data.team.name + ' · Mission Control'; }
      if (data.team.subtitle) $('t-sub').textContent = data.team.subtitle;
    }
    var gen = data.generated_at ? fmtDate(data.generated_at) : null;
    $('foot-gen').textContent = 'status.json · schema v' + (data.schema_version || '?') + (gen ? ' · generated ' + gen : '') + (data.generated_by ? ' by ' + data.generated_by : '') + (feed === 'ok' ? '' : ' · inline fallback copy');
    renderBadges(); renderRoster(); renderDeploys(Date.now()); renderOrg(); state.lanesAt = 0; tick();
    var key = JSON.stringify(data.log || []);
    if (key !== state.logKey) { state.logKey = key; startTerm(); }
  }
  function load() {
    var url = 'status.json?t=' + Date.now();
    var useFallback = function () {
      if (state.feed === 'ok' && state.data) { state.fetchedAt = state.fetchedAt; return; }
      if (window.__STATUS_FALLBACK__) apply(window.__STATUS_FALLBACK__, 'fallback');
      else $('feed-val').textContent = 'status.json unavailable';
    };
    if (location.protocol === 'file:' || !window.fetch) return useFallback();
    fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { apply(d, 'ok'); }).catch(useFallback);
  }

  /* ---------- Views ---------- */
  function setView(v) {
    state.view = v;
    $('view-ops').hidden = v !== 'ops'; $('view-org').hidden = v !== 'org';
    var b = document.querySelectorAll('.tabs button');
    for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-selected', b[i].getAttribute('data-view') === v ? 'true' : 'false');
    if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    if (v === 'org') requestAnimationFrame(drawOrgLines);
  }
  document.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setView(b.getAttribute('data-view')); });
  document.addEventListener('keydown', function (e) { if (e.key === '1') setView('ops'); if (e.key === '2') setView('org'); });
  window.addEventListener('resize', function () { drawOrgLines(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawOrgLines);
  setView(location.hash === '#org' ? 'org' : 'ops');
  var rot = +new URLSearchParams(location.search).get('rotate');
  if (rot >= 10) setInterval(function () { setView(state.view === 'ops' ? 'org' : 'ops'); }, rot * 1000);

  /* ---------- Starfield ---------- */
  (function sky() {
    var c = $('sky'), g = c.getContext('2d'), stars = [], dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      c.width = innerWidth * dpr; c.height = innerHeight * dpr; stars = [];
      var n = Math.round(innerWidth * innerHeight / 5200);
      for (var i = 0; i < n; i++) stars.push({ x: Math.random() * c.width, y: Math.random() * c.height, r: (Math.random() < 0.08 ? 1.3 : 0.6 + Math.random() * 0.5) * dpr, o: 0.15 + Math.random() * 0.6, p: Math.random() * 6.28, s: 0.4 + Math.random() * 1.2, b: Math.random() < 0.15 });
    }
    function draw(t) {
      g.clearRect(0, 0, c.width, c.height);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i], a = s.o * (0.55 + 0.45 * Math.sin(t / 1000 * s.s + s.p));
        g.fillStyle = s.b ? 'rgba(150,215,255,' + a + ')' : 'rgba(255,255,255,' + a + ')';
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.fill();
      }
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(draw);
    }
    size(); addEventListener('resize', size); requestAnimationFrame(draw);
  })();

  tick();
  setInterval(tick, 1000);
  load();
  setInterval(load, REFRESH_MS);
})();
