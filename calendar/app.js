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
    school: { label: 'School', pic: '🏫' },
    holiday: { label: 'Holidays', pic: '🎉' },
    vote: { label: 'Election', pic: '🗳️' },
  };
  let off = new Set(); try { off = new Set(JSON.parse(localStorage.getItem('cal-off') || '[]')); } catch (e) {}
  let span = 60, events = [], sweptAt = null, SB = null, addOpen = false, schoolRows = [], themes = [], themeOpen = false;
  // Monday of the week that holds a date, for weekly themes.
  const mondayOf = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return addDays(iso, -((d.getUTCDay() + 6) % 7)); };

  async function load(sb) {
    const t = todayISO(), end = addDays(t, 120);
    const q = await Promise.all([
      sb.from('calendar_events').select('uid,title,day,starts_at,ends_at,all_day,location,swept_at').gte('day', t).lte('day', end).order('starts_at'),
      sb.from('colleges').select('id,name,deadline,deadline_time,plan,status').gte('deadline', t).lte('deadline', end),
      sb.from('scholarships').select('name,deadline,status').gte('deadline', t).lte('deadline', end),
      sb.from('tasks').select('id,title,due_date,due_time,is_event,status').eq('is_event', true).gte('due_date', t).lte('due_date', end),
      sb.from('amy_tasks').select('title,due_date,status,category').gte('due_date', t).lte('due_date', end),
      sb.from('trips').select('id,name,start_date,end_date,destination,status').gte('end_date', t).lte('start_date', end),
      sb.from('family_dates').select('id,title,kind,month,day,on_date,end_date,note,source'),
      sb.from('brief_themes').select('id,start_date,end_date,theme_name,notes,set_by,filled_at,emoji').gte('end_date', addDays(t, -7)).order('start_date'),
    ]);
    const [ic, col, sch, lt, amy, trips, fd, th] = q.map((r) => r.data || []);
    themes = th;
    schoolRows = fd.filter((f) => f.on_date && f.kind !== 'Birthday').sort((a, b) => b.on_date.localeCompare(a.on_date)).slice(0, 40);
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
    // Family dates: birthdays, school days off and half days (ranges cover every day), holidays and events.
    const SRC_OF = { Birthday: 'bday', 'No school': 'school', 'Half day': 'school', Holiday: 'holiday' };
    for (const f of fd) {
      const starts = f.on_date ? [f.on_date] : [y, y + 1].map((yy) => `${yy}-${pad(f.month)}-${pad(f.day)}`);
      for (const st of starts) for (let d = st; d <= (f.end_date || st); d = addDays(d, 1)) if (d >= t && d <= end)
        out.push({ src: SRC_OF[f.kind] || 'family', day: d, sort: '00:00', time: f.kind === 'Half day' ? 'Early dismissal' : f.kind === 'No school' ? 'No school' : 'All day', title: f.title, note: f.note || '' });
    }
    // Holidays, worked out each year (Thanksgiving is the 4th Thursday of November).
    const thanks = (yy) => { const d = new Date(Date.UTC(yy, 10, 1)); return `${yy}-11-${pad((4 - d.getUTCDay() + 7) % 7 + 22)}`; };
    const HOL = [['🎆 New Year', 1, 1], ['💝 Valentine\'s Day', 2, 14], ['☘️ St. Patrick\'s Day', 3, 17], ['🇺🇸 Fourth of July', 7, 4], ['🎃 Halloween', 10, 31], ['🦃 Thanksgiving', 0, 0], ['🎄 Christmas', 12, 25]];
    for (const yy of [y, y + 1]) for (const [title, m, dd] of HOL) { const d = m ? `${yy}-${pad(m)}-${pad(dd)}` : thanks(yy); if (d >= t && d <= end) out.push({ src: 'holiday', day: d, sort: '00:00', time: 'Holiday', title }); }
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
      <div><b>Want a plan's dates on your phone?</b> Lily's plan has its own subscription: College plan › Calendar › Subscribe.</div></div>
      <details class="adddates" ${themeOpen ? 'open' : ''}><summary>🎨 Brief themes: set a theme for a week or a day</summary>
        <p class="small muted" style="margin:8px 0 0">Give a theme and Claude fills in a quote or fun fact for each day on Sunday evening. No theme set? Claude picks one from the season and what's coming up.</p>
        <form id="themef" class="addgrid">
          <label class="wide">Theme<input name="theme_name" required maxlength="80" placeholder="Patrick Stewart / Captain Picard"></label>
          <label>For<select name="span"><option value="week">The week of</option><option value="day">Just one day</option></select></label>
          <label>Date<input name="date" type="date" required value="${esc(addDays(mondayOf(todayISO()), 7))}"></label>
          <label class="wide">Notes for Claude (optional)<input name="notes" maxlength="300" placeholder="Lily's pick. Famous lines, a few fun facts, nothing scary."></label>
          <button class="btn">Save theme</button><span class="small muted" id="thememsg"></span>
        </form>
        <div class="added">${themes.length ? themes.map((r) => `<div class="arow"><span>${esc(r.emoji || '🎨')} <b>${esc(r.theme_name)}</b> <span class="small muted">${esc(r.start_date)}${r.end_date !== r.start_date ? ' to ' + esc(r.end_date) : ''} · ${r.set_by === 'Claude' ? 'picked by Claude' : 'family pick'}${r.filled_at ? ' · ready' : ' · Claude fills it Sunday'}</span></span>${r.set_by === 'Claude' && r.filled_at ? '' : `<button class="linkbtn" data-rmt="${esc(r.id)}">Remove</button>`}</div>`).join('') : '<div class="small muted">No themes yet.</div>'}</div>
      </details>
      <details class="adddates" ${addOpen ? 'open' : ''}><summary>➕ Add dates: no school, half days, holidays, family events</summary>
        <form id="addf" class="addgrid">
          <label>What<input name="title" required maxlength="80" placeholder="Snow day, no school"></label>
          <label>Type<select name="kind"><option>No school</option><option>Half day</option><option>Holiday</option><option>Event</option></select></label>
          <label>Date<input name="on_date" type="date" required></label>
          <label>Through (optional)<input name="end_date" type="date"></label>
          <label class="wide">Note (optional)<input name="note" maxlength="120" placeholder="Make-up day added in June"></label>
          <button class="btn">Add to the calendar</button><span class="small muted" id="addmsg"></span>
        </form>
        <div class="added">${schoolRows.length ? '<div class="small muted">Added dates (newest first). Remove any that are wrong.</div>' + schoolRows.map((r) => `<div class="arow"><span>${r.kind === 'No school' ? '🏫' : r.kind === 'Half day' ? '🕐' : r.kind === 'Holiday' ? '🎉' : '📌'} <b>${esc(r.title)}</b> <span class="small muted">${esc(r.on_date)}${r.end_date ? ' to ' + esc(r.end_date) : ''}${r.source ? ' · ' + esc(r.source) : ''}</span></span><button class="linkbtn" data-rm="${esc(r.id)}">Remove</button></div>`).join('') : ''}</div>
      </details>`;
    app.innerHTML = html;
    app.querySelectorAll('.chip-btn').forEach((b) => b.onclick = () => { const k = b.dataset.src; off.has(k) ? off.delete(k) : off.add(k); try { localStorage.setItem('cal-off', JSON.stringify([...off])); } catch (e) {} render(); });
    const tf = document.getElementById('themef');
    tf.onsubmit = async (e) => { e.preventDefault(); const f = new FormData(tf), msg = document.getElementById('thememsg');
      const d = String(f.get('date')), week = f.get('span') === 'week', start = week ? mondayOf(d) : d;
      const row = { theme_name: String(f.get('theme_name')).trim(), notes: String(f.get('notes') || '').trim() || null, start_date: start, end_date: week ? addDays(start, 6) : start, set_by: 'Family' };
      const clash = themes.find((x) => x.start_date <= row.end_date && x.end_date >= row.start_date && x.set_by !== 'Claude');
      if (clash) { msg.textContent = `"${clash.theme_name}" already covers some of those days. Remove it first.`; return; }
      const { error } = await SB.from('brief_themes').insert(row);
      if (error) { msg.textContent = 'Could not save: ' + error.message; return; }
      themeOpen = true; await load(SB); render(); };
    app.querySelectorAll('[data-rmt]').forEach((b) => b.onclick = async () => { const { error } = await SB.from('brief_themes').delete().eq('id', b.dataset.rmt); if (!error) { themeOpen = true; await load(SB); render(); } });
    const af = document.getElementById('addf');
    af.onsubmit = async (e) => { e.preventDefault(); const f = new FormData(af), msg = document.getElementById('addmsg');
      const row = { title: String(f.get('title')).trim(), kind: f.get('kind'), on_date: f.get('on_date'), end_date: f.get('end_date') || null, note: String(f.get('note') || '').trim() || null, source: 'Family page' };
      if (row.end_date && row.end_date < row.on_date) { msg.textContent = 'The end date is before the start date.'; return; }
      const { error } = await SB.from('family_dates').insert(row);
      if (error) { msg.textContent = error.code === '23505' ? 'That date is already on the calendar.' : 'Could not save: ' + error.message; return; }
      addOpen = true; await load(SB); render(); };
    app.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => { const { error } = await SB.from('family_dates').delete().eq('id', b.dataset.rm); if (!error) { addOpen = true; await load(SB); render(); } });
    const mb = document.getElementById('moreb'), lb = document.getElementById('lessb');
    if (mb) mb.onclick = () => { span = 120; render(); }; if (lb) lb.onclick = () => { span = 60; render(); };
  }

  (async () => {
    if (!CFG.SUPABASE_URL || !window.supabase) { app.innerHTML = '<p class="pad">Setup needed: config.js is missing.</p>'; return; }
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    SB = sb;
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
