/* Knaffla Family dashboard: the front door to every family section.
   One Supabase project (shared with Lily's college plan), so one sign-in works
   on every page at kknaffla.github.io. Vanilla JS, no build step. */
(() => {
  'use strict';
  const APP_VERSION = '2026.10.29-12'; // keep in sync with the ?v= tags in index.html
  const CFG = window.APP_CONFIG || {};
  const TZ = CFG.TIME_ZONE || 'America/Detroit';
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^(https?:\/\/|\/)/i.test(String(u || '')) ? String(u) : '#');
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const daysUntil = (iso) => { const [y, m, d] = iso.split('-').map(Number); const [ty, tm, td] = todayISO().split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5); };
  const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  const hour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const greet = () => { const h = hour(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  const toast = (t) => { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); };

  const ICON = {
    college: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/></svg>',
    ballot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5v5M17 9.5v5"/></svg>',
    moneybag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-1.5 3h-3z"/><path d="M10.5 6C6 8 4 12 4 15a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5c0-3-2-7-6.5-9"/><path d="M14 11.5c-.5-.7-1.2-1-2-1-1.1 0-2 .6-2 1.5s.9 1.3 2 1.5 2 .6 2 1.5-.9 1.5-2 1.5c-.8 0-1.5-.3-2-1M12 9.5v1M12 16.5v1"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    suitcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M8 7v13M16 7v13"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    mark: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#24465c"/><path d="M14 46h36" stroke="#f4f5f2" stroke-width="3" stroke-linecap="round"/><path d="M20 46V30l12-10 12 10v16" fill="none" stroke="#f4f5f2" stroke-width="3" stroke-linejoin="round"/><circle cx="46" cy="18" r="5" fill="#e8b062"/></svg>',
  };

  let sb = null, session = null, me = null, started = false, family = [];

  /* ---------- sign-in ---------- */
  function viewSignIn(msg) {
    app.innerHTML = `<form class="signin" id="signin" autocomplete="on">
      <div>${ICON.mark.replace('<svg', '<svg class="mark"')}</div>
      <h1>Knaffla Family</h1>
      <p class="muted" style="margin:0">Sign in once here and you're signed in to every family page, including Lily's college plan.</p>
      <label>Email<input id="email" type="email" autocomplete="username" required></label>
      <label>Password<input id="pw" type="password" autocomplete="current-password" required></label>
      <button class="btn" id="go">Sign in</button>
      <button type="button" class="linkbtn" id="forgot">Forgot password?</button>
      <div class="err" id="err">${esc(msg || '')}</div>
    </form>`;
    document.getElementById('signin').onsubmit = async (e) => {
      e.preventDefault();
      const b = document.getElementById('go'); b.disabled = true; b.textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email: document.getElementById('email').value.trim(), password: document.getElementById('pw').value });
      if (error) { document.getElementById('err').textContent = 'That email and password didn\'t match. Try again, or ask Kevin to reset it.'; b.disabled = false; b.textContent = 'Sign in'; return; }
      session = (await sb.auth.getSession()).data.session; load();
    };
    document.getElementById('forgot').onclick = async () => {
      const email = document.getElementById('email').value.trim();
      if (!email) { document.getElementById('err').textContent = 'Type your email above first.'; return; }
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
      document.getElementById('err').textContent = 'If that email has an account, a reset link is on its way. If nothing arrives in a few minutes, ask Kevin.';
    };
  }

  function viewNewPassword() {
    app.innerHTML = `<form class="signin" id="np"><h1>Set a new password</h1>
      <label>New password<input id="p1" type="password" autocomplete="new-password" minlength="8" required></label>
      <label>Type it again<input id="p2" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn">Save password</button><div class="err" id="err"></div></form>`;
    document.getElementById('np').onsubmit = async (e) => {
      e.preventDefault();
      const a = document.getElementById('p1').value, b = document.getElementById('p2').value;
      if (a !== b) { document.getElementById('err').textContent = 'The two passwords don\'t match.'; return; }
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) { document.getElementById('err').textContent = error.message; return; }
      toast('Password saved'); history.replaceState(null, '', '/'); load();
    };
  }

  /* ---------- dashboard ---------- */
  async function load() {
    session = (await sb.auth.getSession()).data.session;
    if (!session) return viewSignIn();
    const { data: members, error } = await sb.from('members').select('user_id, display_name, role');
    family = members || [];
    me = family.find((m) => m.user_id === session.user.id) || null;
    if (error || !me) {
      app.innerHTML = `<div class="signin"><h1>Almost there</h1><p>You're signed in as ${esc(session.user.email)}, but your account isn't on the family list yet. Ask Kevin to add you.</p><button class="btn ghost" id="out">Sign out</button></div>`;
      document.getElementById('out').onclick = signOut; return;
    }
    const t = todayISO(), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const [cols, tasks, trips] = await Promise.all([
      sb.from('colleges').select('name, deadline, plan, status').gte('deadline', t).not('status', 'in', '("Submitted","Complete","Admitted","Waitlisted","Denied","Not applying")').order('deadline').limit(3),
      sb.from('tasks').select('id, title, due_date, status, is_event').gte('due_date', t).lte('due_date', week).not('status', 'in', '("Done","Submitted","Not needed")').order('due_date').limit(50),
      sb.from('trips').select('id, name, kind, destination, start_date, end_date, trip_items(title, kind, done)').gte('end_date', t).not('status', 'in', '("Done","Cancelled")').order('start_date').limit(1),
    ]);
    render({ cols: cols.data || [], tasks: (tasks.data || []).filter((x) => !x.is_event), trip: (trips.data || [])[0] || null, money: await loadMoney() });
  }

  /* ---------- money (only what this person may see; the database decides) ---------- */
  async function loadMoney() {
    const ym = todayISO().slice(0, 7), lm = (() => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 15)).toISOString().slice(0, 7); })();
    const [acc, tx, st, cats, rules, budgets, goals] = await Promise.all([
      sb.from('accounts').select('id, name, type, owner, balance, visible_to'),
      sb.from('transactions').select('account_id, date, amount, type, excluded, purchased_by, category, parent_category, merchant, name').gte('date', lm + '-01').order('date', { ascending: false }).range(0, 1999),
      sb.from('money_settings').select('admins, managers').eq('id', 1).maybeSingle(),
      sb.from('budget_categories').select('id, name, sort').order('sort'),
      sb.from('category_rules').select('kind, pattern, category_id, sort').order('sort'),
      sb.from('budgets').select('person, category_id, amount'),
      sb.from('savings_goals').select('account_id, target, target_date'),
    ]);
    if (acc.error) return null; // money tables not set up yet
    const A = acc.data || [], S = st.data || { admins: [], managers: [] }, CATS = cats.data || [], GOALS = goals.data || [];
    const RULES = (rules.data || []).sort((x, y) => (x.kind === y.kind ? x.sort - y.sort : x.kind === 'merchant' ? -1 : 1));
    const acct = (id) => A.find((a) => a.id === id);
    const personOf = (t) => t.purchased_by || ((a) => !a || !a.owner.length ? null : a.owner.length === 1 ? a.owner[0] : 'shared')(acct(t.account_id));
    const categoryOf = (t) => { const text = String(t.merchant || t.name || '').toLowerCase(); for (const r of RULES) { if (r.kind === 'merchant' && text.includes(r.pattern.toLowerCase())) return r.category_id; if (r.kind === 'category' && (t.category === r.pattern || t.parent_category === r.pattern)) return r.category_id; } return (CATS.find((c) => c.name === 'Other') || {}).id; };
    const counts = (t) => t.type === 'spending' && !t.excluded;
    const T = tx.data || [];
    const spend = (m, pred) => T.filter((t) => t.date.slice(0, 7) === m && counts(t) && (!pred || pred(t))).reduce((s, t) => s + Number(t.amount), 0);
    const isManager = S.managers.includes(me.user_id) || S.admins.includes(me.user_id);
    const savings = A.filter((a) => a.type === 'savings' && a.owner.length === 1).map((a) => ({ ...a, goal: GOALS.find((g) => g.account_id === a.id) }));
    // My budget: categories closest to or over budget this month.
    const myKey = me.user_id, shared = A.some((a) => a.owner.length === 2 && a.owner.includes(me.user_id));
    const mine = (b) => b.person === myKey || (shared && b.person === 'shared');
    const budget = (budgets.data || []).filter((b) => mine(b) && b.amount != null).map((b) => {
      const sp = spend(ym, (t) => (personOf(t) === b.person) && categoryOf(t) === b.category_id);
      return { name: (CATS.find((c) => c.id === b.category_id) || { name: '?' }).name, person: b.person, spent: sp, amount: Number(b.amount), pct: Math.round(100 * sp / Number(b.amount)) };
    }).sort((x, y) => y.pct - x.pct);
    const mySpend = spend(ym, (t) => personOf(t) === myKey || (shared && personOf(t) === 'shared'));
    return { family: A.length > savings.filter((a) => a.owner[0] === me.user_id).length, isManager, ym, lm, thisMonth: spend(ym), lastMonth: spend(lm), cash: A.filter((a) => ['checking', 'savings', 'cash'].includes(a.type)).reduce((s, a) => s + Number(a.balance || 0), 0), savings, budget, mySpend, myCharges: T.filter((t) => t.date.slice(0, 7) === ym && t.purchased_by === me.user_id && counts(t)).reduce((s, t) => s + Number(t.amount), 0) };
  }
  const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const fmtMonth = (ym) => new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long' });
  function moneyCards(d) {
    const m = d.money; if (!m) return '';
    let html = '';
    for (const a of m.savings) {
      const own = a.owner[0] === me.user_id;
      if (!own && !m.family) continue;
      html += savingsCard(a, own);
    }
    return html + moneyRest(m);
  }
  // One savings account card. "My savings" when it's the viewer's own (or the person Kevin is viewing as).
  function savingsCard(a, own) {
      const pct = a.goal ? Math.min(100, Math.round(100 * Number(a.balance || 0) / Number(a.goal.target))) : null;
      return `<a class="card tc t-save" href="/money/#/account/${esc(a.id)}"><span class="cpic" aria-hidden="true">💰</span><div class="k">${esc(own ? 'My savings' : a.name)}</div><div class="big">${usd0.format(a.balance || 0)}</div>
        ${pct !== null ? `<div class="small">${pct}% of ${usd0.format(a.goal.target)} goal</div><div class="bar"><i style="width:${pct}%"></i></div>` : '<div class="small muted">No goal set yet</div>'}<div class="go">Open savings</div></a>`;
  }
  // View as Lily or Amy: her own savings card, as she sees it (Kevin can see every savings account).
  function previewMoneyCards(d, first) {
    const m = d.money; if (!m) return '';
    const who = family.find((p) => (p.display_name || '').split(' ')[0].toLowerCase() === first.toLowerCase());
    return who ? m.savings.filter((a) => a.owner[0] === who.user_id).map((a) => savingsCard(a, true)).join('') : '';
  }
  function moneyRest(m) {
    let html = '';
    if (m.family && m.isManager) {
      const diff = m.lastMonth ? Math.round(100 * (m.thisMonth - m.lastMonth) / m.lastMonth) : null;
      html += `<a class="card tc t-money" href="/money/"><span class="cpic" aria-hidden="true">📊</span><div class="k">Family money</div><div class="big">${usd0.format(m.thisMonth)} <small>spent this month</small></div>
        <div class="small">${diff === null ? 'No data for last month yet' : `${diff >= 0 ? '+' : ''}${diff}% vs ${usd0.format(m.lastMonth)} last month`} · cash ${usd0.format(m.cash)}</div><div class="go">Open money</div></a>`;
    } else if (m.myCharges) {
      html += `<a class="card tc t-money" href="/money/#/transactions?person=me"><span class="cpic" aria-hidden="true">💳</span><div class="k">My Apple Card</div><div class="big">${usd0.format(m.myCharges)} <small>this month</small></div><div class="go">See my charges</div></a>`;
    }
    if (m.budget.length) {
      const top = m.budget.slice(0, 3);
      html += `<a class="card tc t-budget ${top[0].pct >= 100 ? 'hot' : ''}" href="/money/#/budgets"><span class="cpic" aria-hidden="true">🎯</span><div class="k">My budget · ${esc(fmtMonth(m.ym))}</div>
        ${top.map((b) => `<div class="small"><b>${esc(b.name)}</b>${b.person === 'shared' ? ' (Kevin & Janet)' : ''}: ${usd0.format(b.spent)} of ${usd0.format(b.amount)}${b.pct >= 100 ? ' · over' : ''}</div><div class="bar ${b.pct >= 100 ? 'over' : b.pct >= 85 ? 'warn' : ''}"><i style="width:${Math.min(100, b.pct)}%"></i></div>`).join('')}<div class="go">Open budgets</div></a>`;
    } else if (m.family || m.myCharges) {
      html += `<a class="card tc t-budget" href="/money/#/budgets"><span class="cpic" aria-hidden="true">🎯</span><div class="k">My budget · ${esc(fmtMonth(m.ym))}</div><div class="big">${usd0.format(m.mySpend)} <small>spent</small></div><div class="small muted">No budget set yet${m.isManager ? '. Kevin sets amounts on the Budgets page.' : '.'}</div><div class="go">Open budgets</div></a>`;
    }
    return html;
  }

  function collegeCard(d) {
    const c = d.cols[0];
    const n = d.tasks.length;
    if (!c && !n) return `<a class="card tc t-lily" href="/college-plan/"><span class="cpic" aria-hidden="true">🎓</span><div class="k">Lily's college plan</div><div class="big">All caught up</div><div class="go">Open college plan</div></a>`;
    const days = c ? daysUntil(c.deadline) : null;
    return `<a class="card tc t-lily ${days !== null && days <= 5 ? 'hot' : ''}" href="/college-plan/"><span class="cpic" aria-hidden="true">🎓</span>
      <div class="k">Lily's college plan</div>
      ${c ? `<div class="big">${days === 0 ? 'Today' : days === 1 ? '1 day' : days + ' days'} <small>to ${esc(c.name)} ${esc(c.plan === 'Undecided' ? '' : c.plan)}</small></div><div class="small muted">Deadline ${fmtDate(c.deadline)}${d.cols[1] ? ` · then ${esc(d.cols[1].name)} ${fmtDate(d.cols[1].deadline)}` : ''}</div>` : ''}
      <div class="small">${n ? `${n} open task${n > 1 ? 's' : ''} due this week` : 'No tasks due this week'}</div>
      <div class="go">Open college plan</div></a>`;
  }
  function electionCard() {
    const E = CFG.ELECTION; if (!E) return '';
    const days = daysUntil(E.date);
    if (days < 0) return `<div class="card tc t-vote"><span class="cpic" aria-hidden="true">🗳️</span><div class="k">Voter guide</div><div class="big">Next ballot <small>arrives in September</small></div><div class="small muted">The guide rebuilds itself each fall for the coming election.</div></div>`;
    return `<a class="card tc t-vote ${days <= 7 ? 'hot' : ''}" href="/voter/"><span class="cpic" aria-hidden="true">🗳️</span>
      <div class="k">${esc(E.name)}</div>
      <div class="big">${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days + ' days'} <small>${fmtDate(E.date)}</small></div>
      <div class="small">Polls open 7 a.m. to 8 p.m. Build your convictions and mark your picks before you go.</div>
      <div class="go">Open voter guide</div></a>`;
  }
  // Trips: a full-width, colorful "coming up" banner for everyone, themed by the kind of trip
  // (same colors as /trips/). Trips like The Sound of Music get the Alpine scene (an original drawing).
  const TRIP_THEME = { Weekend: ['k-weekend', '🎭'], 'Spring break': ['k-spring', '🌴'], Summer: ['k-summer', '☀️'], Holiday: ['k-holiday', '🎄'], Other: ['k-other', '🧭'] };
  const tripArt = (t) => (/sound of music|alps|austria|mountain|ski\b/i.test(`${t.name} ${t.destination || ''}`) ? 'alps' : '');
  const ALPS = `<svg class="scene" viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">
    <circle cx="338" cy="34" r="14" fill="#ffd86b" opacity=".9"/>
    <path d="M0 110 L60 50 L95 80 L150 20 L200 85 L250 40 L300 90 L340 58 L400 96 V140 H0Z" fill="#6c5a9c"/>
    <path d="M60 50 L68 57 L63 55 L58 60 L55 56 L52 58Z M150 20 L162 35 L156 32 L150 38 L144 31 L140 31Z M250 40 L258 48 L253 46 L248 51 L244 46 L242 47Z M340 58 L348 63 L343 62 L338 66 L334 63Z" fill="#fff"/>
    <path d="M0 118 Q100 92 200 112 T400 106 V140 H0Z" fill="#5fae6a"/><path d="M0 130 Q120 110 240 126 T400 120 V140 H0Z" fill="#3b8a4f"/>
    <g fill="#fff"><circle cx="40" cy="128" r="2.2"/><circle cx="92" cy="122" r="2"/><circle cx="150" cy="131" r="2.4"/><circle cx="214" cy="124" r="2"/><circle cx="276" cy="132" r="2.2"/><circle cx="330" cy="125" r="2"/><circle cx="372" cy="131" r="2.3"/></g>
    <g fill="#ffe7a3" font-size="18" font-family="serif"><text x="70" y="40">♪</text><text x="205" y="30">♫</text><text x="290" y="62" font-size="14">♪</text><text x="118" y="70" font-size="13">♫</text></g></svg>`;
  // "Appleton: The Sound of Music" → headline "The Sound of Music", place "Appleton".
  const tripHeadline = (t) => { const i = t.name.indexOf(':'); return i > 0 ? [t.name.slice(i + 1).trim(), t.name.slice(0, i).trim()] : [t.name, t.destination || '']; };
  function tripCard(d) {
    const t = d.trip;
    if (!t) return `<a class="card tripc wide k-summer" href="/trips/"><div class="tripc-top"><span class="k">Trips &amp; vacations</span><span class="pic" aria-hidden="true">🧳🗺️</span></div>
      <div class="tripc-title">Where to next?</div><div class="small">Weekend events, spring break, summer. Add an idea any time.</div><div class="go">Plan a trip</div></a>`;
    const [cls, pic] = TRIP_THEME[t.kind] || TRIP_THEME.Other, art = tripArt(t), [head, place] = tripHeadline(t);
    const days = daysUntil(t.start_date);
    const books = (t.trip_items || []).filter((x) => x.kind === 'Booking'), need = books.filter((x) => !x.done);
    const pct = books.length ? Math.round(100 * (books.length - need.length) / books.length) : 0;
    return `<a class="card tripc wide ${cls} ${art ? 'art-' + art : ''}" href="/trips/#/trip/${esc(t.id)}">${art ? ALPS : ''}
      <div class="tripc-top"><span class="k">Coming up${place ? ' · ' + esc(place) : ''}</span>
        <span class="cd">${days <= 0 ? '<b>Now</b>' : days === 1 ? '<b>1</b>day' : `<b>${days}</b>days`}</span></div>
      <div class="tripc-title">${art ? '' : `<span aria-hidden="true">${pic}</span> `}${esc(head)}</div>
      <div class="small">${fmtDate(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ' to ' + fmtDate(t.end_date) : ''}${t.destination ? ' · 📍 ' + esc(t.destination) : ''}</div>
      ${books.length ? `<div class="tripc-prog"><div class="tr"><i style="width:${pct}%"></i></div><span>${books.length - need.length} of ${books.length} booked</span></div>
        <div class="small">${need.length ? '⚠️ Still to book: ' + need.map((x) => esc(x.title)).join(', ') : '🎉 Everything is booked'}</div>` : ''}
      <div class="go">Open the trip</div></a>`;
  }
  function tile(t) {
    // Each tile wears its own colors and a picture of what it's for; the big faded copy sits in the corner.
    const pic = t.pic ? `<span class="ico pic" aria-hidden="true">${t.pic}</span>` : `<span class="ico">${ICON[t.icon]}</span>`;
    const inner = `${pic}<span><b>${esc(t.name)}${t.soon ? '<span class="chip">Coming soon</span>' : ''}</b><span>${esc(t.desc)}</span></span>${t.pic ? `<span class="wm" aria-hidden="true">${t.pic}</span>` : ''}`;
    const cls = ['tile', t.theme ? 'themed ' + t.theme : '', t.cls || ''].join(' ').trim();
    return t.soon ? `<div class="${cls} soon">${inner}</div>` : `<a class="${cls}" href="${esc(safeUrl(t.href))}"${t.ext ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`;
  }
  // Kevin only: "View as" previews another person's dashboard layout. The data stays Kevin's.
  let viewAs = '', lastData = null;
  const PEOPLE = ['Kevin', 'Janet', 'Lily', 'Amy'];
  const realFirst = () => (me.display_name || '').split(' ')[0];
  const canViewAs = () => realFirst().toLowerCase() === 'kevin';
  function render(d) {
    lastData = d;
    const first = (canViewAs() && viewAs) || realFirst();
    const previewing = first !== realFirst();
    const areas = [
      { name: 'College', note: 'Each girl has her own plan', tiles: [
        { name: 'Lily\'s college plan', desc: 'Class of 2027: applications, deadlines, scholarships', icon: 'college', href: '/college-plan/', theme: 't-lily', pic: '🎓' },
        { name: 'Amy\'s college plan', desc: 'Class of 2029: AP, dual enrollment, grades 10 to 12', icon: 'college', href: '/amy/', theme: 't-amy', pic: '📚' } ] },
      { name: 'Voting', note: 'Your own convictions and picks', tiles: [
        { name: 'Voter guide', desc: 'Every item on our ballot, with family alignment', icon: 'ballot', href: '/voter/', theme: 't-vote', pic: '🗳️' } ] },
      { name: 'Money', note: d.money && d.money.family ? 'Accounts, charges and budgets' : 'Your savings and your Apple Card', tiles: [
        { name: 'Savings', desc: d.money && d.money.family ? 'Lily\'s and Amy\'s savings and goals' : 'Your savings and goal', icon: 'moneybag', href: '/money/', theme: 't-save', pic: '💰' },
        { name: d.money && d.money.family ? 'Family money' : 'My Apple Card', desc: d.money && d.money.family ? 'Accounts, every charge, budgets' : 'Your own charges and budget', icon: 'money', href: d.money && d.money.family ? '/money/' : '/money/#/transactions?person=me', theme: 't-money', pic: d.money && d.money.family ? '💰' : '💳' } ] },
      { name: 'Home', note: 'Trips now; calendar and iPhone later', tiles: [
        { name: 'Trips', desc: d.trip ? `Next: ${tripHeadline(d.trip)[0]}, ${daysUntil(d.trip.start_date) <= 0 ? 'now' : daysUntil(d.trip.start_date) === 1 ? 'tomorrow' : 'in ' + daysUntil(d.trip.start_date) + ' days'}` : 'Weekend events, spring break, summer vacations', icon: 'suitcase', href: '/trips/', theme: 't-trip', pic: '🧳' },
        { name: 'Family calendar', desc: 'Everyone\'s events on every iPhone', icon: 'calendar', soon: true, theme: 't-cal', pic: '📅' },
        { name: 'iPhone & Apple', desc: 'Home Screen, calendars, reminders', icon: 'phone', soon: true, theme: 't-phone', pic: '📱' } ] },
    ];
    // "Your area": the signed-in person's own pages first; the shared areas follow without repeats.
    const all = areas.flatMap((a) => a.tiles);
    const pick = (...names) => names.map((n) => all.find((t) => t.name === n)).filter(Boolean);
    const money = previewing ? (first === 'Kevin' ? 'Family money' : 'My Apple Card') : d.money && d.money.family ? 'Family money' : 'My Apple Card';
    const MINE = {
      lily: { note: 'Your plan, Amy\'s plan, trips, savings and ballot', tiles: pick('Lily\'s college plan', 'Amy\'s college plan', 'Trips', 'Savings', money, 'Voter guide') },
      amy: { note: 'Your plan, Lily\'s plan, trips and savings', tiles: pick('Amy\'s college plan', 'Lily\'s college plan', 'Trips', 'Savings', money) },
      kevin: { note: 'Both girls\' plans and the family money', tiles: pick('Lily\'s college plan', 'Amy\'s college plan', money, 'Trips') },
      janet: { note: 'Both girls\' plans, trips and your money', tiles: pick('Lily\'s college plan', 'Amy\'s college plan', money, 'Trips') },
    }[first.toLowerCase()];
    if (MINE && MINE.tiles.length) {
      for (const a of areas) a.tiles = a.tiles.filter((t) => !MINE.tiles.includes(t));
      areas.splice(0, areas.length, { name: 'Your area', note: MINE.note, cls: 'mine', tiles: MINE.tiles }, ...areas.filter((a) => a.tiles.length));
    }
    app.innerHTML = `
      ${previewing ? `<div class="viewas-bar"><span>Viewing as <b>${esc(first)}</b>. Layout only${/^(lily|amy)$/i.test(first) ? '; her savings card shows her real balance' : ': the numbers are still yours'}.</span><button class="linkbtn" id="backme">Back to me</button></div>` : ''}
      <header class="head"><div class="who"><span class="eyebrow">Knaffla Family</span><h1>${greet()}, ${esc(first)}</h1></div>
        <div class="headbtns">${canViewAs() ? `<label class="viewas-top"><span>View as</span><select id="viewastop">${PEOPLE.map((n) => `<option value="${n === 'Kevin' ? '' : n}"${(viewAs || '') === (n === 'Kevin' ? '' : n) ? ' selected' : ''}>${n === 'Kevin' ? 'Me' : n}</option>`).join('')}</select></label>` : ''}
        <button class="acct" id="acct">${esc(realFirst())} · Account</button></div></header>
      <section class="today" aria-label="Today">${collegeCard(d)}${electionCard()}${previewing ? previewMoneyCards(d, first) : moneyCards(d)}${tripCard(d)}</section>
      ${areas.map((a) => `<section class="area ${a.cls || ''}" aria-label="${esc(a.name)}"><div class="area-head"><h2>${esc(a.name)}</h2><span>${esc(a.note)}</span></div>
        <div class="sections">${a.tiles.map(tile).join('')}</div></section>`).join('')}
      <p class="foot">Add this page to your iPhone Home Screen: tap Share, then Add to Home Screen. Version ${APP_VERSION}.</p>
      <dialog id="sheet"></dialog>`;
    document.getElementById('acct').onclick = openAccount;
    const vt = document.getElementById('viewastop'); if (vt) vt.onchange = () => { viewAs = vt.value; render(lastData); };
    const back = document.getElementById('backme'); if (back) back.onclick = () => { viewAs = ''; render(lastData); };
  }

  function currentTheme() { try { return localStorage.getItem('theme') || 'auto'; } catch (e) { return 'auto'; } }
  function openAccount() {
    const dlg = document.getElementById('sheet');
    dlg.innerHTML = `<form method="dialog" class="sheetgrid" id="acctform">
      <h2>${esc(me.display_name)}</h2><div class="small muted">Signed in as ${esc(session.user.email)}</div>
      <label>New password<input id="np1" type="password" autocomplete="new-password" minlength="8"></label>
      <label>Type it again<input id="np2" type="password" autocomplete="new-password" minlength="8"></label>
      <button type="button" class="btn" id="savepw">Change password</button><div class="err" id="pwerr"></div>
      <div><div class="small muted" style="margin-bottom:6px">Appearance on this device</div>
        <div class="seg">${[['auto', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-theme-pick="${k}" class="${currentTheme() === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${canViewAs() ? `<label>View as<select id="viewas">${PEOPLE.map((n) => `<option value="${n === 'Kevin' ? '' : n}"${(viewAs || '') === (n === 'Kevin' ? '' : n) ? ' selected' : ''}>${n === 'Kevin' ? 'Me (Kevin)' : n}</option>`).join('')}</select></label>` : ''}
      <button type="button" class="btn ghost" id="signout">Sign out of every family page</button>
      <button class="linkbtn" value="close">Close</button></form>`;
    dlg.showModal();
    dlg.querySelector('#savepw').onclick = async () => {
      const a = dlg.querySelector('#np1').value, b = dlg.querySelector('#np2').value, err = dlg.querySelector('#pwerr');
      if (a.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
      if (a !== b) { err.textContent = 'The two passwords don\'t match.'; return; }
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) { err.textContent = error.message; return; }
      dlg.close(); toast('Password changed');
    };
    dlg.querySelectorAll('[data-theme-pick]').forEach((b) => b.onclick = () => {
      const k = b.dataset.themePick;
      try { if (k === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', k); } catch (e) {}
      if (k === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', k);
      dlg.querySelectorAll('[data-theme-pick]').forEach((x) => x.classList.toggle('on', x === b));
    });
    dlg.querySelector('#signout').onclick = signOut;
    const va = dlg.querySelector('#viewas');
    if (va) va.onchange = () => { viewAs = va.value; dlg.close(); render(lastData); window.scrollTo(0, 0); };
  }
  async function signOut() { await sb.auth.signOut(); session = null; me = null; viewSignIn(); }

  /* ---------- start ---------- */
  if (!CFG.SUPABASE_URL || !window.supabase) { app.innerHTML = '<p class="pad">Setup needed: config.js is missing.</p>'; return; }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { started = true; viewNewPassword(); return; }
    if (event === 'SIGNED_OUT') { viewSignIn(); return; }
  });
  // Start once (supabase-js can fire SIGNED_IN and INITIAL_SESSION together on restore).
  setTimeout(() => { if (!started) { started = true; load(); } }, 0);
})();
