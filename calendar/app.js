/* Family calendar: a read-only look that combines every family date in one place.
   Sources: the iCloud Family calendar (copied in by a sweep on Kevin's Mac, table calendar_events),
   Lily's college deadlines and events, Amy's dated tasks, trips, family birthdays and the election.
   Adding or deleting family events happens in the Family calendar on the iPhone, not here. */
(() => {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const TZ = CFG.TIME_ZONE || 'America/Detroit';
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const timeOf = (ts) => new Date(ts).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  const SHORT = { 'University of Michigan': 'U-M', 'Michigan State University': 'MSU', 'Michigan Technological University': 'Michigan Tech', 'Northern Michigan University': 'NMU' };

  const SOURCES = {
    family: { label: 'Family (iPhone)', pic: '🏠' },
    lily: { label: 'Lily', pic: '🎓' },
    amy: { label: 'Amy', pic: '📚' },
    trip: { label: 'Trips', pic: '🧳' },
    bday: { label: 'Birthdays', pic: '🎂' },
    vote: { label: 'Election', pic: '🗳️' },
  };
  let off = new Set(); try { off = new Set(JSON.parse(localStorage.getItem('cal-off') || '[]')); } catch (e) {}
  let span = 60, events = [], sweptAt = null;

  async function load(sb) {
    const t = todayISO(), end = addDays(t, 120);
    const q = await Promise.all([
      sb.from('calendar_events').select('uid,title,day,starts_at,ends_at,all_day,location,swept_at').gte('day', t).lte('day', end).order('starts_at'),
      sb.from('colleges').select('id,name,deadline,deadline_time,plan,status').gte('deadline', t).lte('deadline', end),
      sb.from('scholarships').select('name,deadline,status').gte('deadline', t).lte('deadline', end),
      sb.from('tasks').select('id,title,due_date,due_time,is_event,status').eq('is_event', true).gte('due_date', t).lte('due_date', end),
      sb.from('amy_tasks').select('title,due_date,status,category').gte('due_date', t).lte('due_date', end),
      sb.from('trips').select('id,name,start_date,end_date,destination,status').gte('end_date', t).lte('start_date', end),
      sb.from('family_dates').select('title,kind,month,day,on_date'),
    ]);
    const [ic, col, sch, lt, amy, trips, fd] = q.map((r) => r.data || []);
    const out = [];
    for (const e of ic) {
      out.push({ src: 'family', day: e.day, sort: e.all_day ? '00:00' : e.starts_at.slice(11, 16), time: e.all_day ? 'All day' : timeOf(e.starts_at) + (e.ends_at && e.ends_at !== e.starts_at ? ' to ' + timeOf(e.ends_at) : ''), title: e.title, note: e.location || '' });
      if (!sweptAt || e.swept_at > sweptAt) sweptAt = e.swept_at;
    }
    const DONE = ['Submitted', 'Complete', 'Admitted', 'Waitlisted', 'Denied', 'Not applying'];
    for (const c of col) if (!DONE.includes(c.status)) out.push({ src: 'lily', day: c.deadline, sort: '23:59', time: c.deadline_time || 'Deadline', title: `${SHORT[c.name] || c.name} application due${c.plan && c.plan !== 'Undecided' ? ' (' + c.plan + ')' : ''}`, link: '/college-plan/#/college/' + c.id });
    for (const s of sch) if (['Planning', 'In progress'].includes(s.status)) out.push({ src: 'lily', day: s.deadline, sort: '23:58', time: 'Deadline', title: s.name + ' scholarship due', link: '/college-plan/#/scholarships' });
    for (const x of lt) if (!['Done', 'Not needed'].includes(x.status)) out.push({ src: 'lily', day: x.due_date, sort: x.due_time || '12:00', time: x.due_time || '', title: x.title, link: '/college-plan/#/task/' + x.id });
    for (const a of amy) if (!['Done', 'Not needed'].includes(a.status)) out.push({ src: 'amy', day: a.due_date, sort: '12:00', time: a.category || '', title: a.title, link: '/amy/#/timeline' });
    for (const tr of trips) if (!['Cancelled', 'Idea', 'Done'].includes(tr.status)) {
      const first = tr.start_date < t ? t : tr.start_date;
      for (let d = first; d <= (tr.end_date || tr.start_date); d = addDays(d, 1))
        out.push({ src: 'trip', day: d, sort: '00:01', time: d === tr.start_date ? 'Trip starts' : d === tr.end_date ? 'Last day' : 'Trip', title: tr.name + (tr.destination && d === tr.start_date ? ' · ' + tr.destination : ''), link: '/trips/#/trip/' + tr.id });
    }
    const y = Number(t.slice(0, 4)), pad = (n) => String(n).padStart(2, '0');
    for (const f of fd) {
      const days = f.on_date ? [f.on_date] : [y, y + 1].map((yy) => `${yy}-${pad(f.month)}-${pad(f.day)}`);
      for (const d of days) if (d >= t && d <= end) out.push({ src: f.kind === 'Birthday' ? 'bday' : 'family', day: d, sort: '00:00', time: 'All day', title: f.title });
    }
    const E = CFG.ELECTION; if (E && E.date >= t && E.date <= end) out.push({ src: 'vote', day: E.date, sort: '07:00', time: '7 AM to 8 PM', title: E.name || 'Election Day', link: E.guide || '/voter/' });
    // The same thing can sit in two places (a Glee show in Lily's plan and on the iPhone): keep one, the iPhone's first.
    const seen = new Set(), norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    events = out.sort((a, b) => a.day.localeCompare(b.day) || (a.src === 'family' ? -1 : 0) - (b.src === 'family' ? -1 : 0)).filter((e) => { const k = e.day + norm(e.title); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.day.localeCompare(b.day) || a.sort.localeCompare(b.sort));
  }

  function render() {
    const t = todayISO(), end = addDays(t, span);
    const counts = {}; events.forEach((e) => { if (e.day <= end) counts[e.src] = (counts[e.src] || 0) + 1; });
    const shown = events.filter((e) => e.day <= end && !off.has(e.src));
    const byDay = new Map(); shown.forEach((e) => { if (!byDay.has(e.day)) byDay.set(e.day, []); byDay.get(e.day).push(e); });
    let html = `<section class="calhero"><h1>📅 Family calendar</h1>
      <p>Everything coming up in one place: the iPhone Family calendar, Lily's and Amy's plans, trips and birthdays.</p>
      <div class="swept">${sweptAt ? 'iPhone events copied ' + new Date(sweptAt).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'iPhone events appear after the first copy from Kevin\'s Mac.'}</div></section>
      <div class="chips" role="group" aria-label="Show">${Object.entries(SOURCES).map(([k, s]) => `<button class="chip-btn s-${k} ${off.has(k) ? '' : 'on'}" data-src="${k}" aria-pressed="${!off.has(k)}">${s.pic} ${esc(s.label)} <span class="n">${counts[k] || 0}</span></button>`).join('')}</div>`;
    if (!byDay.size) html += '<p class="empty">Nothing in the next ' + span + ' days for what\'s turned on.</p>';
    let month = '';
    for (const [d, list] of byDay) {
      const dt = new Date(d + 'T12:00:00Z'), m = dt.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
      if (m !== month) { html += `<h2 class="month">${esc(m)}</h2>`; month = m; }
      html += `<div class="day ${d === t ? 'today' : ''}"><div class="dnum"><div class="dw">${d === t ? 'Today' : dt.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })}</div><div class="dd">${dt.getUTCDate()}</div></div><div class="evs">${list.map((e) => {
        const inner = `<span class="pic" aria-hidden="true">${SOURCES[e.src].pic}</span><span><b>${esc(e.title)}</b><span class="meta"><span class="src">${esc(SOURCES[e.src].label)}</span>${e.time ? ' · ' + esc(e.time) : ''}${e.note ? ' · ' + esc(e.note) : ''}</span></span>`;
        return e.link ? `<a class="ev s-${e.src}" href="${esc(e.link)}">${inner}</a>` : `<div class="ev s-${e.src}">${inner}</div>`;
      }).join('')}</div></div>`;
    }
    html += `<div class="more">${span < 120 ? '<button class="btn ghost" id="moreb">Show 4 months</button>' : '<button class="btn ghost" id="lessb">Show 2 months</button>'}</div>
      <div class="howto"><div><b>Add or delete family events</b> in the Family calendar on your iPhone. They show up here after the next copy, a few times a day.</div>
      <div><b>Want a plan's dates on your phone?</b> Lily's plan has its own subscription: College plan › Calendar › Subscribe.</div></div>`;
    app.innerHTML = html;
    app.querySelectorAll('.chip-btn').forEach((b) => b.onclick = () => { const k = b.dataset.src; off.has(k) ? off.delete(k) : off.add(k); try { localStorage.setItem('cal-off', JSON.stringify([...off])); } catch (e) {} render(); });
    const mb = document.getElementById('moreb'), lb = document.getElementById('lessb');
    if (mb) mb.onclick = () => { span = 120; render(); }; if (lb) lb.onclick = () => { span = 60; render(); };
  }

  (async () => {
    if (!CFG.SUPABASE_URL || !window.supabase) { app.innerHTML = '<p class="pad">Setup needed: config.js is missing.</p>'; return; }
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { app.innerHTML = '<div class="signin"><h1>Family calendar</h1><p>Sign in on the family page first.</p><a class="btn" href="/" style="text-align:center;text-decoration:none">Go to the family page</a></div>'; return; }
    // The Knaffla Brief's quiz "reveal" link lands here with the answer in the hash.
    const ans = (location.hash.match(/^#answer=(.+)$/) || [])[1];
    if (ans) { const box = document.createElement('div'); box.className = 'calhero'; box.style.background = 'linear-gradient(135deg,#0b5f73,#138a6c)'; box.innerHTML = `<h1>🧠 Quiz answer</h1><p style="font-size:22px;font-weight:700">${esc(decodeURIComponent(ans))}</p><p>Back to the brief for the next one tomorrow.</p>`; app.replaceChildren(box); history.replaceState(null, '', location.pathname); const rest = document.createElement('div'); app.appendChild(rest); }
    try { await load(sb); } catch (err) { app.innerHTML = `<p class="pad">The calendar couldn't load. ${esc(err.message || err)}</p>`; return; }
    const keep = app.firstElementChild && app.firstElementChild.textContent.includes('Quiz answer') ? app.firstElementChild : null;
    render();
    if (keep) app.prepend(keep);
  })();
})();
