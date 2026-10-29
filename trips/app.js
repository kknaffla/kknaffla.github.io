/* Family Trips: weekend events, spring break and summer vacations. Each trip has a
   day-by-day plan, bookings (hotel, tickets, reservations), to-dos, packing and cost.
   Same Supabase project and sign-in as the family page. Vanilla JS, no build. */
(() => {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const TZ = CFG.TIME_ZONE || 'America/Detroit';
  const app = document.getElementById('app'), sheet = document.getElementById('sheet');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const daysUntil = (iso) => { const [y, m, d] = iso.split('-').map(Number); const [ty, tm, td] = todayISO().split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5); };
  const fmtDay = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  const fmtLong = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
  const money = (n) => n == null ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const toast = (t) => { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2400); };

  const KINDS = ['Weekend', 'Spring break', 'Summer', 'Holiday', 'Other'];
  const STATUSES = ['Idea', 'Planning', 'Booked', 'Done', 'Cancelled'];
  const ITEM_KINDS = ['Plan', 'Option', 'Booking', 'To-do', 'Packing'];

  let sb, D = { trips: [], items: [] };

  /* ---------- data ---------- */
  const TABLE = { trips: 'trips', items: 'trip_items' };
  async function loadAll() {
    const [t, i] = await Promise.all([sb.from('trips').select('*').order('start_date', { nullsFirst: false }), sb.from('trip_items').select('*').order('sort')]);
    if (t.error) throw t.error; if (i.error) throw i.error;
    D.trips = t.data || []; D.items = i.data || [];
  }
  async function save(kind, row) {
    const body = { ...row }; delete body.updated_at; delete body.updated_by;
    const q = body.id ? sb.from(TABLE[kind]).update(body).eq('id', body.id).select() : sb.from(TABLE[kind]).insert(body).select();
    const { data, error } = await q;
    if (error) { toast('Couldn\'t save: ' + error.message); return null; }
    const r = data[0]; const i = D[kind].findIndex((x) => x.id === r.id);
    if (i >= 0) D[kind][i] = r; else D[kind].push(r);
    return r;
  }
  async function remove(kind, id) {
    const { error } = await sb.from(TABLE[kind]).delete().eq('id', id);
    if (error) { toast('Couldn\'t delete: ' + error.message); return false; }
    D[kind] = D[kind].filter((x) => x.id !== id);
    if (kind === 'trips') D.items = D.items.filter((x) => x.trip_id !== id);
    return true;
  }

  /* ---------- helpers ---------- */
  const itemsOf = (id, kind) => D.items.filter((x) => x.trip_id === id && (!kind || x.kind === kind));
  const openBookings = (id) => itemsOf(id, 'Booking').filter((x) => !x.done);
  const isPast = (t) => t.status === 'Done' || t.status === 'Cancelled' || (t.end_date || t.start_date || '9999') < todayISO();
  // "7:30 PM", "Noon", "Morning" → minutes after midnight, for ordering a day's plan.
  function timeKey(s) {
    const v = String(s || '').trim().toLowerCase(); if (!v) return -1;
    const m = v.match(/(\d{1,2})(?::(\d{2}))?\s*(a|p)?/);
    if (m) { let h = Number(m[1]) % 12; if (m[3] === 'p' || (!m[3] && h < 7)) h += 12; return h * 60 + Number(m[2] || 0); }
    return { morning: 480, breakfast: 480, noon: 720, lunch: 720, afternoon: 780, dinner: 1050, evening: 1080, night: 1260 }[v.split(/\W/)[0]] ?? 1;
  }
  const byTime = (a, b) => (a.day || '9999').localeCompare(b.day || '9999') || timeKey(a.time_text) - timeKey(b.time_text) || a.sort - b.sort;
  function when(t) {
    if (!t.start_date) return 'Dates not set';
    if (!t.end_date || t.end_date === t.start_date) return fmtDay(t.start_date);
    return `${fmtDay(t.start_date)} to ${fmtDay(t.end_date)}`;
  }
  function countdown(t) {
    if (!t.start_date) return '';
    const n = daysUntil(t.start_date);
    if (n > 1) return `in ${n} days`; if (n === 1) return 'tomorrow'; if (n === 0) return 'today';
    return (t.end_date || t.start_date) >= todayISO() ? 'now' : '';
  }
  const link = (u) => safeUrl(u) ? ` · <a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">Link</a>` : '';
  // Each kind of trip gets its own colors and picture.
  const THEME = { Weekend: ['k-weekend', '🎭', 'Weekend events'], 'Spring break': ['k-spring', '🌴', 'Spring break'], Summer: ['k-summer', '☀️', 'Summer vacations'], Holiday: ['k-holiday', '🎄', 'Holidays'], Other: ['k-other', '🧭', 'Other trips'] };
  const theme = (t) => THEME[t.kind] || THEME.Other;
  // Scene art for a trip, picked from its name and place. Original drawings, not copied artwork.
  const ART = [[/sound of music|alps|austria|mountain|ski\b/i, 'alps']];
  const artOf = (t) => (ART.find(([re]) => re.test(`${t.name} ${t.destination || ''}`)) || [])[1] || '';
  const SCENE = {
    alps: `<svg class="scene" viewBox="0 0 400 140" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <circle cx="338" cy="34" r="14" fill="#ffd86b" opacity=".9"/>
      <path d="M0 110 L60 50 L95 80 L150 20 L200 85 L250 40 L300 90 L340 58 L400 96 V140 H0Z" fill="#6c5a9c"/>
      <path d="M60 50 L68 57 L63 55 L58 60 L55 56 L52 58Z M150 20 L162 35 L156 32 L150 38 L144 31 L140 31Z M250 40 L258 48 L253 46 L248 51 L244 46 L242 47Z M340 58 L348 63 L343 62 L338 66 L334 63Z" fill="#fff"/>
      <path d="M0 118 Q100 92 200 112 T400 106 V140 H0Z" fill="#5fae6a"/>
      <path d="M0 130 Q120 110 240 126 T400 120 V140 H0Z" fill="#3b8a4f"/>
      <g fill="#fff"><circle cx="40" cy="128" r="2.2"/><circle cx="92" cy="122" r="2"/><circle cx="150" cy="131" r="2.4"/><circle cx="214" cy="124" r="2"/><circle cx="276" cy="132" r="2.2"/><circle cx="330" cy="125" r="2"/><circle cx="372" cy="131" r="2.3"/></g>
      <g fill="#ffd86b"><circle cx="40" cy="128" r=".9"/><circle cx="150" cy="131" r="1"/><circle cx="276" cy="132" r=".9"/><circle cx="372" cy="131" r="1"/></g>
      <g fill="#ffe7a3" font-size="18" font-family="serif"><text x="70" y="40">♪</text><text x="205" y="30">♫</text><text x="290" y="62" font-size="14">♪</text><text x="118" y="70" font-size="13">♫</text></g></svg>`,
  };
  // A picture for each stop, picked from its words.
  const PICS = [[/drive|leave|head home|road trip/i, '🚗'], [/fly|flight|airport/i, '✈️'], [/shop|mall|store/i, '🛍️'], [/dinner|lunch|breakfast|brunch|restaurant|eat/i, '🍽️'],
    [/show|music|theat|concert|musical|play\b|game|movie/i, '🎭'], [/hotel|check.?in|check.?out|motel|inn\b|resort|lodge/i, '🏨'], [/beach|swim|pool|water ?park/i, '🏖️'],
    [/hike|trail|park\b/i, '🥾'], [/coffee/i, '☕'], [/ticket/i, '🎟️'], [/pack|bag|charger|clothes/i, '🧳'], [/home/i, '🏠']];
  const pic = (x) => (PICS.find(([re]) => re.test(x.title)) || [0, '📍'])[1];
  const countLabel = (n) => n === 0 ? '<b>Today</b>' : `<b>${n}</b>${n === 1 ? 'day' : 'days'}`;
  function progress(t) {
    const all = itemsOf(t.id, 'Booking'); if (!all.length) return '';
    const b = all.filter((x) => x.done).length;
    return `<div class="prog"><div class="tr"><i style="width:${Math.round(100 * b / all.length)}%"></i></div><span>${b} of ${all.length} booked</span></div>`;
  }

  /* ---------- views ---------- */
  function tripCard(t) {
    const [cls, p] = theme(t), n = t.start_date && !isPast(t) ? daysUntil(t.start_date) : null, art = artOf(t);
    return `<a class="post ${cls} ${art ? 'art-' + art : ''} ${isPast(t) ? 'past' : ''}" href="#/trip/${esc(t.id)}">
      <div class="post-top">${art ? SCENE[art] : ''}${art ? '<span></span>' : `<span class="pic" aria-hidden="true">${p}</span>`}${n !== null && n >= 0 ? `<span class="count">${countLabel(n)}</span>` : `<span class="stamp">${esc(t.status)}</span>`}</div>
      <div class="post-body"><b>${esc(t.name)}</b><div class="when">${esc(when(t))}</div>
        ${t.destination ? `<div class="small muted">📍 ${esc(t.destination)}</div>` : ''}${isPast(t) ? '' : progress(t)}</div></a>`;
  }
  function viewList() {
    const live = D.trips.filter((t) => !isPast(t)), past = D.trips.filter(isPast).sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    const groups = KINDS.map((k) => [k, live.filter((t) => t.kind === k)]).filter(([k, ts]) => ts.length || ['Weekend', 'Spring break', 'Summer'].includes(k));
    const next = live.find((t) => t.start_date);
    return `<section class="hero k-other list-hero"><div><span class="eyebrow">Knaffla Family</span><h1>Trips &amp; vacations</h1>
        <p>${next ? `Next up: <b>${esc(next.name)}</b>, ${esc(countdown(next))}.` : 'Weekend events, spring break and summer, all in one place.'}</p></div>
        <span class="hero-pics" aria-hidden="true">🧳🗺️</span><button class="btn light" data-add-trip>+ Add a trip</button></section>
      ${groups.map(([k, ts]) => `<section class="group"><h2 class="ghead"><span aria-hidden="true">${THEME[k][1]}</span> ${esc(THEME[k][2])}</h2>
        ${ts.length ? `<div class="trips">${ts.map(tripCard).join('')}</div>` : `<button class="post empty-post ${THEME[k][0]}" data-add-trip="${esc(k)}"><span aria-hidden="true">${THEME[k][1]}</span> Nothing yet. Add an idea, even without dates.</button>`}</section>`).join('')}
      ${past.length ? `<details class="past"><summary>Past trips (${past.length})</summary><div class="trips">${past.map(tripCard).join('')}</div></details>` : ''}`;
  }

  function itemRow(x) {
    const sub = [x.place && esc(x.place), x.notes && esc(x.notes)].filter(Boolean).join(' · ') + link(x.url);
    return `<div class="item check ${x.done ? 'done' : ''}">
      <button class="box ${x.done ? 'on' : ''}" data-toggle="${esc(x.id)}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}: ${esc(x.title)}"></button>
      <div><div class="t">${esc(x.title)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <button class="edit" data-edit="${esc(x.id)}">Edit</button></div>`;
  }
  function option(x) {
    const sub = [x.place && esc(x.place), x.notes && esc(x.notes)].filter(Boolean).join(' · ');
    return `<div class="opt"><span class="tpic" aria-hidden="true">${pic(x)}</span><div class="tbody"><div class="t">${esc(x.title)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}
      <div class="row">${safeUrl(x.url) ? `<a class="small" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">Website</a>` : ''}<button class="edit" data-edit="${esc(x.id)}">Edit</button></div></div></div>`;
  }
  function ticket(x) {
    const sub = [[x.day && fmtDay(x.day), x.time_text].filter(Boolean).map(esc).join(' '), x.place && esc(x.place), x.confirmation && 'Conf. ' + esc(x.confirmation), x.notes && esc(x.notes)].filter(Boolean).join(' · ') + link(x.url);
    return `<div class="ticket ${x.done ? 'ok' : 'need'}"><span class="tpic" aria-hidden="true">${pic(x)}</span>
      <div class="tbody"><div class="t">${esc(x.title)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}<button class="edit" data-edit="${esc(x.id)}">Edit</button></div>
      <button class="stampbtn" data-toggle="${esc(x.id)}" aria-label="${x.done ? 'Mark not booked' : 'Mark booked'}: ${esc(x.title)}">${x.done ? 'Booked ✓' : 'Not booked'}</button></div>`;
  }
  function planPanel(t) {
    const xs = itemsOf(t.id, 'Plan').sort(byTime);
    const days = [...new Set(xs.map((x) => x.day || ''))];
    const dayHead = (d) => d ? `<b>${esc(new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' }))}</b><span>${esc(new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }))}</span>` : '<b>Any day</b>';
    return `<section class="plan"><h2 class="ghead"><span aria-hidden="true">🗓️</span> The plan</h2>
      ${xs.length ? `<div class="days">${days.map((d, i) => `<section class="dayc d${i % 5}"><div class="dayh">${dayHead(d)}</div><ol class="tl">
        ${xs.filter((x) => (x.day || '') === d).map((x) => `<li><span class="dot" aria-hidden="true">${pic(x)}</span><div class="tl-b">
          ${x.time_text ? `<div class="tm">${esc(x.time_text)}</div>` : ''}<div class="t">${esc(x.title)}</div>
          ${x.place || x.notes || safeUrl(x.url) ? `<div class="sub">${[x.place && esc(x.place), x.notes && esc(x.notes)].filter(Boolean).join(' · ')}${link(x.url)}</div>` : ''}
          <button class="edit" data-edit="${esc(x.id)}">Edit</button></div></li>`).join('')}</ol></section>`).join('')}</div>` : '<p class="empty">No plans yet. Add the first stop.</p>'}
      <button class="addbtn" data-add-item="Plan">+ Add a stop</button></section>`;
  }
  function listPanel(t, kind) {
    const xs = itemsOf(t.id, kind).sort(kind === 'Booking' ? (a, b) => a.done - b.done || byTime(a, b) : (a, b) => a.done - b.done || a.sort - b.sort);
    const head = { Option: ['💡', 'Options', '+ Add an option'], Booking: ['🎟️', 'Bookings', '+ Add a booking'], 'To-do': ['✅', 'To-dos', '+ Add a to-do'], Packing: ['🧳', 'Packing list', '+ Add to packing'] }[kind];
    return `<section class="panel p-${kind === 'To-do' ? 'todo' : kind.toLowerCase()}"><h2 class="ghead"><span aria-hidden="true">${head[0]}</span> ${head[1]}</h2>
      ${kind === 'Option' && xs.length ? '<p class="empty">Hotels, restaurants and ideas we\'re weighing. When you pick one, add it under Bookings.</p>' : ''}
      ${xs.length ? `<div class="${kind === 'Option' ? 'opts' : ''}">${xs.map(kind === 'Booking' ? ticket : kind === 'Option' ? option : itemRow).join('')}</div>` : '<p class="empty">None yet.</p>'}
      <button class="addbtn" data-add-item="${esc(kind)}">${head[2]}</button></section>`;
  }
  function costPanel(t) {
    const xs = itemsOf(t.id).filter((x) => x.cost_est != null || x.cost_actual != null).sort(byTime);
    const sum = (k) => xs.reduce((s, x) => s + Number(x[k] || 0), 0);
    return `<section class="panel p-cost"><h2 class="ghead"><span aria-hidden="true">💵</span> Cost</h2>${xs.length ? `<table class="cost"><thead><tr><th>Item</th><th class="n">Estimate</th><th class="n">Actual</th></tr></thead><tbody>
      ${xs.map((x) => `<tr><td>${esc(x.title)}</td><td class="n">${money(x.cost_est)}</td><td class="n">${money(x.cost_actual)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${money(sum('cost_est'))}</td><td class="n">${money(sum('cost_actual'))}</td></tr></tbody></table>`
      : '<p class="empty">Add an estimate or actual cost to any stop, booking or to-do and it totals here.</p>'}</section>`;
  }
  function viewTrip(id) {
    const t = D.trips.find((x) => x.id === id);
    if (!t) return '<p class="pad">That trip isn\'t here. <a href="#/">Back to trips</a></p>';
    const [cls, p] = theme(t), need = openBookings(t.id), n = t.start_date && !isPast(t) ? daysUntil(t.start_date) : null, art = artOf(t);
    const drive = itemsOf(t.id, 'Plan').some((x) => pic(x) === '✈️') ? '✈️' : '🚗';
    return `<a href="#/" class="back">&larr; All trips</a>
      <section class="hero ${cls} ${art ? 'art-' + art : ''}">${art ? SCENE[art] : ''}<div class="hero-main"><span class="eyebrow">${esc(t.kind)} · ${esc(t.status)}</span><h1>${esc(t.name)}</h1>
          <p class="hero-when">${esc(when(t))}</p>${t.who ? `<p>Going: ${esc(t.who)}</p>` : ''}</div>
        <div class="hero-side">${n !== null && n >= 0 ? `<span class="ring">${countLabel(n)}</span>` : `<span class="hero-pic" aria-hidden="true">${p}</span>`}
          <button class="btn light" data-edit-trip="${esc(t.id)}">Edit trip</button></div>
        ${t.destination ? `<div class="route" aria-label="Route: home to ${esc(t.destination)}"><span class="stop">🏠 Home</span><i></i><span class="car" aria-hidden="true">${drive}</span><i></i><span class="stop">📍 ${esc(t.destination)}</span></div>` : ''}
      </section>
      ${t.notes ? `<p class="tnote">💡 ${esc(t.notes)}</p>` : ''}
      ${isPast(t) ? '' : need.length ? `<div class="callout">⚠️ <b>Still to book:</b> ${need.map((x) => esc(x.title)).join(', ')}</div>` : itemsOf(t.id, 'Booking').length ? '<div class="callout ok">🎉 Everything is booked.</div>' : ''}
      <div class="stack">${planPanel(t)}${listPanel(t, 'Option')}<div class="cols">${listPanel(t, 'Booking')}${listPanel(t, 'To-do')}</div><div class="cols">${listPanel(t, 'Packing')}${costPanel(t)}</div></div>`;
  }

  /* ---------- forms ---------- */
  const FORMS = {
    trips: { title: 'trip', fields: [['name', 'Trip name', 'text', true], ['kind', 'Type', KINDS], ['status', 'Status', STATUSES], ['start_date', 'Start', 'date'], ['end_date', 'End', 'date'], ['destination', 'Where', 'text'], ['who', 'Who\'s going', 'text'], ['notes', 'Notes', 'textarea']] },
    items: { title: 'item', fields: [['kind', 'Kind', ITEM_KINDS], ['title', 'What', 'text', true], ['day', 'Day', 'date'], ['time_text', 'Time (e.g. 7:30 PM, Morning)', 'text'], ['place', 'Place or address', 'text'], ['done', 'Booked / done', 'checkbox'], ['confirmation', 'Confirmation number (never card numbers)', 'text'], ['cost_est', 'Estimated cost', 'number'], ['cost_actual', 'Actual cost', 'number'], ['url', 'Link', 'url'], ['notes', 'Notes', 'textarea']] },
  };
  function openForm(kind, row) {
    const F = FORMS[kind]; const isNew = !row.id;
    const field = ([k, l, t, req]) => {
      const v = row[k] ?? '';
      if (Array.isArray(t)) return `<label>${l}<select name="${k}">${t.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
      if (t === 'textarea') return `<label>${l}<textarea name="${k}">${esc(v)}</textarea></label>`;
      if (t === 'checkbox') return `<label class="cb"><input type="checkbox" name="${k}" ${row[k] ? 'checked' : ''}> ${l}</label>`;
      return `<label>${l}<input name="${k}" type="${t}" value="${esc(v)}" ${req ? 'required' : ''} ${t === 'number' ? 'step="0.01" min="0" inputmode="decimal"' : ''}></label>`;
    };
    sheet.innerHTML = `<form class="f" id="ff"><h2>${isNew ? 'Add' : 'Edit'} ${F.title}</h2>
      ${F.fields.map(field).join('')}
      <div class="row between"><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" id="cancel">Cancel</button></div>
        ${isNew ? '' : `<button type="button" class="linkbtn danger" id="del">Delete${kind === 'trips' ? ' trip' : ''}</button>`}</div></form>`;
    sheet.showModal();
    sheet.querySelector('#cancel').onclick = () => sheet.close();
    const del = sheet.querySelector('#del');
    if (del) del.onclick = async () => {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = kind === 'trips' ? 'Tap again to delete the trip and everything in it' : 'Tap again to delete'; return; }
      if (await remove(kind, row.id)) { sheet.close(); if (kind === 'trips') location.hash = '#/'; render(); toast('Deleted'); }
    };
    sheet.querySelector('#ff').onsubmit = async (e) => {
      e.preventDefault();
      const out = { ...row }; const fd = new FormData(e.target);
      F.fields.forEach(([k, , t]) => { if (t === 'checkbox') { out[k] = fd.get(k) === 'on'; return; } let v = fd.get(k); v = v === '' || v === null ? null : t === 'number' ? Number(v) : v; out[k] = v; });
      if (kind === 'trips' && out.start_date && out.end_date && out.end_date < out.start_date) { toast('The end date is before the start date.'); return; }
      if (kind === 'items' && out.url && !safeUrl(out.url)) { toast('Links need to start with https://'); return; }
      const r = await save(kind, out);
      if (r) { sheet.close(); if (kind === 'trips' && isNew) location.hash = '#/trip/' + r.id; else render(); toast('Saved'); }
    };
  }

  /* ---------- routing ---------- */
  function render() {
    const m = location.hash.match(/^#\/trip\/([0-9a-f-]{36})$/i);
    const t = m && D.trips.find((x) => x.id === m[1]);
    document.title = t ? `${t.name} · Trips` : 'Family Trips';
    app.innerHTML = m ? viewTrip(m[1]) : viewList();
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || !app.contains(b)) return;
    const tripId = (location.hash.match(/^#\/trip\/([0-9a-f-]{36})$/i) || [])[1];
    if (b.hasAttribute('data-add-trip')) openForm('trips', { kind: b.dataset.addTrip || 'Weekend', status: b.dataset.addTrip ? 'Idea' : 'Planning' });
    else if (b.dataset.editTrip) openForm('trips', D.trips.find((x) => x.id === b.dataset.editTrip));
    else if (b.dataset.addItem) {
      const t = D.trips.find((x) => x.id === tripId), k = b.dataset.addItem;
      const last = itemsOf(tripId, k).reduce((s, x) => Math.max(s, x.sort), 0);
      openForm('items', { trip_id: tripId, kind: k, done: false, sort: last + 1, day: k === 'Plan' || k === 'Booking' ? t?.start_date || null : null });
    }
    else if (b.dataset.edit) openForm('items', D.items.find((x) => x.id === b.dataset.edit));
    else if (b.dataset.toggle) { const x = D.items.find((i) => i.id === b.dataset.toggle); if (await save('items', { id: x.id, done: !x.done })) render(); }
  });

  /* ---------- start ---------- */
  (async () => {
    if (!window.supabase || !CFG.SUPABASE_URL) { app.innerHTML = '<p class="pad">Setup needed.</p>'; return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { app.innerHTML = '<div class="signin"><h1>Family Trips</h1><p>Sign in on the family page first.</p><a class="btn" href="/" style="text-align:center;text-decoration:none">Go to the family page</a></div>'; return; }
    try { await loadAll(); } catch (err) { app.innerHTML = `<div class="signin"><h1>Almost there</h1><p>Trips couldn't load. If you're new, ask Kevin to add you to the family list.</p><p class="small muted">${esc(err.message || err)}</p></div>`; return; }
    render();
  })();
})();
