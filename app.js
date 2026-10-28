/* Knaffla Family dashboard: the front door to every family section.
   One Supabase project (shared with Lily's college plan), so one sign-in works
   on every page at kknaffla.github.io. Vanilla JS, no build step. */
(() => {
  'use strict';
  const APP_VERSION = '2026.10.28-2'; // keep in sync with the ?v= tags in index.html
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
    piggy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11a7 6 0 0 1 13-2h2v4l-2 1v3h-3v-2H9v2H6v-3a6 6 0 0 1-1-3z"/><path d="M10 7.5a2 2 0 0 1 3 0"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    mark: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#24465c"/><path d="M14 46h36" stroke="#f4f5f2" stroke-width="3" stroke-linecap="round"/><path d="M20 46V30l12-10 12 10v16" fill="none" stroke="#f4f5f2" stroke-width="3" stroke-linejoin="round"/><circle cx="46" cy="18" r="5" fill="#e8b062"/></svg>',
  };

  let sb = null, session = null, me = null, started = false;

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
    me = (members || []).find((m) => m.user_id === session.user.id) || null;
    if (error || !me) {
      app.innerHTML = `<div class="signin"><h1>Almost there</h1><p>You're signed in as ${esc(session.user.email)}, but your account isn't on the family list yet. Ask Kevin to add you.</p><button class="btn ghost" id="out">Sign out</button></div>`;
      document.getElementById('out').onclick = signOut; return;
    }
    const t = todayISO(), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const [cols, tasks] = await Promise.all([
      sb.from('colleges').select('name, deadline, plan, status').gte('deadline', t).not('status', 'in', '("Submitted","Complete","Admitted","Waitlisted","Denied","Not applying")').order('deadline').limit(3),
      sb.from('tasks').select('id, title, due_date, status, is_event').gte('due_date', t).lte('due_date', week).not('status', 'in', '("Done","Submitted","Not needed")').order('due_date').limit(50),
    ]);
    render({ cols: cols.data || [], tasks: (tasks.data || []).filter((x) => !x.is_event) });
  }

  function collegeCard(d) {
    const c = d.cols[0];
    const n = d.tasks.length;
    if (!c && !n) return `<a class="card" href="/college-plan/"><div class="k">Lily's college plan</div><div class="big">All caught up</div><div class="go">Open college plan</div></a>`;
    const days = c ? daysUntil(c.deadline) : null;
    return `<a class="card ${days !== null && days <= 5 ? 'hot' : ''}" href="/college-plan/">
      <div class="k">Lily's college plan</div>
      ${c ? `<div class="big">${days === 0 ? 'Today' : days === 1 ? '1 day' : days + ' days'} <small>to ${esc(c.name)} ${esc(c.plan === 'Undecided' ? '' : c.plan)}</small></div><div class="small muted">Deadline ${fmtDate(c.deadline)}${d.cols[1] ? ` · then ${esc(d.cols[1].name)} ${fmtDate(d.cols[1].deadline)}` : ''}</div>` : ''}
      <div class="small">${n ? `${n} open task${n > 1 ? 's' : ''} due this week` : 'No tasks due this week'}</div>
      <div class="go">Open college plan</div></a>`;
  }
  function electionCard() {
    const E = CFG.ELECTION; if (!E) return '';
    const days = daysUntil(E.date);
    if (days < 0) return `<div class="card"><div class="k">Voter guide</div><div class="big">Next ballot <small>arrives in September</small></div><div class="small muted">The guide rebuilds itself each fall for the coming election.</div></div>`;
    return `<a class="card ${days <= 7 ? 'hot' : ''}" href="/voter/">
      <div class="k">${esc(E.name)}</div>
      <div class="big">${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days + ' days'} <small>${fmtDate(E.date)}</small></div>
      <div class="small">Polls open 7 a.m. to 8 p.m. Build your convictions and mark your picks before you go.</div>
      <div class="go">Open voter guide</div></a>`;
  }
  function tile(t) {
    const inner = `<span class="ico">${ICON[t.icon]}</span><span><b>${esc(t.name)}${t.soon ? '<span class="chip">Coming soon</span>' : ''}</b><span>${esc(t.desc)}</span></span>`;
    return t.soon ? `<div class="tile soon">${inner}</div>` : `<a class="tile" href="${esc(safeUrl(t.href))}"${t.ext ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`;
  }
  function render(d) {
    const first = (me.display_name || '').split(' ')[0];
    const tiles = [
      { name: 'Lily\'s college plan', desc: 'Applications, deadlines, scholarships', icon: 'college', href: '/college-plan/' },
      { name: 'Amy\'s college plan', desc: 'AP, dual enrollment, grades 10 to 12', icon: 'college', soon: true },
      { name: 'Voter guide', desc: 'Every ballot item, with your own convictions and picks', icon: 'ballot', href: '/voter/' },
      { name: 'Savings', desc: 'Lily\'s and Amy\'s savings and goals', icon: 'piggy', soon: true },
      { name: 'Money', desc: 'Family accounts and spending', icon: 'money', soon: true },
      { name: 'Family calendar', desc: 'Everyone\'s events on every iPhone', icon: 'calendar', soon: true },
      { name: 'iPhone & Apple', desc: 'Home Screen, calendars, reminders', icon: 'phone', soon: true },
    ];
    app.innerHTML = `
      <header class="head"><div class="who"><span class="eyebrow">Knaffla Family</span><h1>${greet()}, ${esc(first)}</h1></div>
        <button class="acct" id="acct">${esc(first)} · Account</button></header>
      <section class="today" aria-label="Today">${collegeCard(d)}${electionCard()}</section>
      <h2>Family pages</h2>
      <section class="sections">${tiles.map(tile).join('')}</section>
      <p class="foot">Add this page to your iPhone Home Screen: tap Share, then Add to Home Screen. Version ${APP_VERSION}.</p>
      <dialog id="sheet"></dialog>`;
    document.getElementById('acct').onclick = openAccount;
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
