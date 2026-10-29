/* Family money: accounts, charges, savings and budgets. Same Supabase project and
   sign-in as the family page. Access is decided by the database (per-account
   visible_to and editors lists plus purchased_by on Apple Card charges); this page
   only shows what comes back. Vanilla JS, no build step. */
(() => {
  'use strict';
  const APP_VERSION = '2026.10.29-2'; // keep in sync with the ?v= tags in index.html
  const CFG = window.APP_CONFIG || {};
  const TZ = CFG.TIME_ZONE || 'America/Detroit';
  const app = document.getElementById('app'), sheet = document.getElementById('sheet');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fmtDate = (iso) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '';
  const fmtDateY = (iso) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const monthName = (ym) => new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money = (n, whole) => (whole ? usd0 : usd).format(Number(n || 0));
  const signed = (n) => { const v = Number(n || 0); return v < 0 ? '+' + money(-v) : money(v); };
  const toast = (t) => { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); };
  const thisMonth = () => todayISO().slice(0, 7);
  const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 15)); return d.toISOString().slice(0, 7); };
  const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]; };
  const TYPE_LABEL = { checking: 'Checking', savings: 'Savings', credit: 'Credit cards', investment: 'Investments', loan: 'Loans', real_estate: 'Real estate', cash: 'Cash', other: 'Other' };
  const TYPE_ORDER = ['checking', 'savings', 'cash', 'credit', 'investment', 'loan', 'real_estate', 'other'];
  const isDebt = (a) => a.type === 'credit' || a.type === 'loan';

  let sb, session, ME, M = [], S = null, A = [], CARDS = [], CATS = [], RULES = [], GOALS = [];
  const isAdmin = () => !!(S && ME && S.admins.includes(ME.user_id));
  const isManager = () => !!(S && ME && (S.managers.includes(ME.user_id) || S.admins.includes(ME.user_id)));
  const first = (u) => { const m = M.find((x) => x.user_id === u); return m ? m.display_name.split(' ')[0] : '?'; };
  const personLabel = (p) => p === 'shared' ? 'Kevin & Janet' : p === 'family' ? 'Whole family' : p ? first(p) : 'Nobody';
  const acct = (id) => A.find((a) => a.id === id) || CARDS.find((a) => a.id === id) || null;
  const acctName = (id) => { const a = acct(id); return a ? a.name : 'Account'; };

  /* ---------- rules: which person and which budget category a charge counts toward ---------- */
  function personOf(t) {
    if (t.purchased_by) return t.purchased_by;
    const a = acct(t.account_id); if (!a || !a.owner) return null;
    return a.owner.length === 1 ? a.owner[0] : a.owner.length > 1 ? 'shared' : null;
  }
  function categoryOf(t) {
    const text = String(t.merchant || t.name || '').toLowerCase();
    for (const r of RULES) {
      if (r.kind === 'merchant' && text.includes(r.pattern.toLowerCase())) return r.category_id;
      if (r.kind === 'category' && (t.category === r.pattern || t.parent_category === r.pattern)) return r.category_id;
    }
    const other = CATS.find((c) => c.name === 'Other'); return other ? other.id : null;
  }
  const catName = (id) => (CATS.find((c) => c.id === id) || { name: 'Other' }).name;
  const counts = (t) => t.type === 'spending' && !t.excluded;

  /* ---------- data ---------- */
  async function loadBase() {
    const [m, s, a, cards, cats, rules, goals] = await Promise.all([
      sb.from('members').select('user_id, display_name, role'),
      sb.from('money_settings').select('admins, managers').eq('id', 1).maybeSingle(),
      sb.from('accounts').select('*').order('sort').order('name'),
      sb.rpc('money_card_labels'),
      sb.from('budget_categories').select('*').order('sort'),
      sb.from('category_rules').select('*').order('sort'),
      sb.from('savings_goals').select('*'),
    ]);
    M = m.data || []; ME = M.find((x) => x.user_id === session.user.id) || null;
    S = s.data || { admins: [], managers: [] };
    A = a.data || []; CARDS = (cards.data || []).filter((c) => !A.some((x) => x.id === c.id));
    CATS = cats.data || []; RULES = (rules.data || []).slice().sort((x, y) => (x.kind === y.kind ? x.sort - y.sort : x.kind === 'merchant' ? -1 : 1));
    GOALS = goals.data || [];
    if (a.error) throw a.error;
  }
  // Charges matching server-side filters (account, dates, type, recurring, text). Person and category are decided here.
  async function fetchTx(f) {
    const out = []; let page = 0;
    while (page < 25) {
      let q = sb.from('transactions').select('*').order('date', { ascending: false }).order('amount', { ascending: false }).range(page * 1000, page * 1000 + 999);
      if (f.account) q = q.eq('account_id', f.account);
      if (f.from) q = q.gte('date', f.from);
      if (f.to) q = q.lte('date', f.to);
      if (f.type) q = q.eq('type', f.type);
      if (f.recurring === '1') q = q.not('recurring', 'is', null);
      if (f.q) { const s = f.q.replace(/[%,()]/g, ' ').trim(); if (s) q = q.or(`name.ilike.%${s}%,merchant.ilike.%${s}%,note.ilike.%${s}%`); }
      const { data, error } = await q;
      if (error) { toast('Could not load charges: ' + error.message); break; }
      out.push(...(data || [])); if (!data || data.length < 1000) break; page++;
    }
    let rows = out;
    if (f.person) rows = rows.filter((t) => f.person === 'me' ? personOf(t) === ME.user_id : personOf(t) === f.person);
    if (f.cat) rows = rows.filter((t) => categoryOf(t) === f.cat);
    if (f.merchant) rows = rows.filter((t) => (t.merchant || t.name) === f.merchant);
    if (f.month) rows = rows.filter((t) => t.date.slice(0, 7) === f.month);
    return rows;
  }

  /* ---------- routing ---------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?'); const f = {};
    new URLSearchParams(qs || '').forEach((v, k) => { f[k] = v; });
    return { path: path || '', parts: path.split('/'), f };
  }
  const link = (path, f) => { const p = new URLSearchParams(); Object.entries(f || {}).forEach(([k, v]) => { if (v) p.set(k, v); }); const s = p.toString(); return `#/${path}${s ? '?' + s : ''}`; };
  const txLink = (f) => link('transactions', f);

  async function render() {
    const r = route();
    document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + (r.parts[0] || '')));
    document.getElementById('setuptab').hidden = !isAdmin();
    try {
      if (r.parts[0] === 'transactions') await viewTransactions(r.f);
      else if (r.parts[0] === 'budgets') await viewBudgets(r.f);
      else if (r.parts[0] === 'account' && r.parts[1]) await viewAccount(r.parts[1], r.f);
      else if (r.parts[0] === 'setup') await viewSetup();
      else await viewHome();
    } catch (e) { app.innerHTML = `<p class="pad err">Something went wrong: ${esc(e.message || e)}</p>`; }
    window.scrollTo(0, 0);
  }

  /* ---------- home ---------- */
  function sparkline(points) {
    if (!points || points.length < 2) return '';
    const vals = points.map((p) => Number(p.balance)); const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const W = 300, H = 72, x = (i) => (i / (points.length - 1)) * W, y = (v) => H - 6 - ((v - min) / span) * (H - 12);
    const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${d} L${W},${H} L0,${H} Z"/><path d="${d}"/></svg>`;
  }
  function goalMeter(a) {
    const g = GOALS.find((x) => x.account_id === a.id); if (!g) return '';
    const pct = Math.min(100, Math.round(100 * Number(a.balance || 0) / Number(g.target)));
    return `<div class="meter"><div class="lbl"><span>Goal ${money(g.target, true)}${g.target_date ? ' by ' + fmtDateY(g.target_date) : ''}</span><b>${pct}%</b></div><div class="tr"><i style="width:${pct}%"></i></div>${g.note ? `<div class="note">${esc(g.note)}</div>` : ''}</div>`;
  }
  function accountRow(a) {
    const hidden = isAdmin() ? M.filter((m) => (S.managers.includes(m.user_id) || a.owner.includes(m.user_id)) && !a.visible_to.includes(m.user_id)).map((m) => first(m.user_id)) : [];
    return `<a class="acct" href="#/account/${a.id}"><b>${esc(a.name)}${a.mask ? ` <span class="muted">••${esc(a.mask)}</span>` : ''}${!a.is_setup && isAdmin() ? '<span class="badge new">New, not set up</span>' : ''}${hidden.length ? `<span class="badge hid">Hidden from ${esc(hidden.join(', '))}</span>` : ''}</b>
      <span class="sub">${esc(a.institution || TYPE_LABEL[a.type])}${a.balance_as_of ? ' · as of ' + fmtDate(a.balance_as_of) : ''}</span>
      <span class="bal num ${isDebt(a) && Number(a.balance) > 0 ? 'neg' : ''}">${isDebt(a) ? money(Number(a.balance || 0)) + (Number(a.balance) > 0 ? '<small class="small muted"> owed</small>' : '') : money(a.balance)}</span></a>`;
  }
  async function kidSavings(a) {
    const [bal, tx] = await Promise.all([
      sb.from('balances').select('as_of, balance').eq('account_id', a.id).order('as_of'),
      sb.from('transactions').select('*').eq('account_id', a.id).gte('date', todayISO().slice(0, 4) + '-01-01'),
    ]);
    const deposits = (tx.data || []).filter((t) => Number(t.amount) < 0).reduce((s, t) => s - Number(t.amount), 0);
    return `<section class="card"><div class="k">${esc(a.name)}</div><div class="big">${money(a.balance)}</div>
      <div class="small muted">${deposits ? money(deposits) + ' added this year' : 'No deposits yet this year'}${a.balance_as_of ? ' · as of ' + fmtDate(a.balance_as_of) : ''}</div>
      ${sparkline(bal.data || [])}${goalMeter(a)}<a class="go" href="#/account/${a.id}">See the history</a></section>`;
  }
  async function viewHome() {
    const t = todayISO(), ym = thisMonth(), lm = addMonths(ym, -1);
    const [r0] = monthRange(lm), [, r1] = monthRange(ym);
    const tx = await fetchTx({ from: r0, to: r1 });
    const spend = (m, pred) => tx.filter((x) => x.date.slice(0, 7) === m && counts(x) && (!pred || pred(x))).reduce((s, x) => s + Number(x.amount), 0);
    const kidAccounts = A.filter((a) => a.type === 'savings' && a.owner.length === 1);
    const mySavings = kidAccounts.filter((a) => a.owner[0] === ME.user_id);
    const family = A.length > mySavings.length;
    let html = `<div class="stack"><div><span class="eyebrow">Knaffla Family · ${esc(monthName(ym))}</span><h1>${family ? 'Family money' : first(ME.user_id) + "'s money"}</h1></div>`;
    if (!A.length && !CARDS.length) {
      app.innerHTML = html + `<p class="muted">Nothing to show yet. ${isAdmin() ? 'Run the first sync, then set up each account in <a href="#/setup">Setup</a>.' : 'Ask Kevin to share an account with you.'}</p></div>`; return;
    }
    const newOnes = A.filter((a) => !a.is_setup);
    if (isAdmin() && newOnes.length) html += `<div class="callout">${newOnes.length} new account${newOnes.length > 1 ? 's' : ''} from the last sync ${newOnes.length > 1 ? 'are' : 'is'} visible only to you until set up. <a href="#/setup">Set up</a></div>`;
    // Kids and parents alike: own savings first.
    for (const a of mySavings) html += await kidSavings(a);
    // My Apple Card charges (anyone with purchased_by rows).
    const mine = tx.filter((x) => x.purchased_by === ME.user_id);
    if (mine.length || CARDS.length) {
      const m0 = mine.filter((x) => x.date.slice(0, 7) === ym && counts(x)).reduce((s, x) => s + Number(x.amount), 0);
      const m1 = mine.filter((x) => x.date.slice(0, 7) === lm && counts(x)).reduce((s, x) => s + Number(x.amount), 0);
      const cardId = CARDS[0] ? CARDS[0].id : (mine[0] ? mine[0].account_id : '');
      html += `<section class="card"><div class="k">My ${esc(cardId ? acctName(cardId) : 'card')} charges</div><div class="big">${money(m0)} <small>this month</small></div>
        <div class="small muted">${money(m1)} last month · ${mine.filter((x) => x.date.slice(0, 7) === ym).length} charge${mine.filter((x) => x.date.slice(0, 7) === ym).length === 1 ? '' : 's'}</div>
        <a class="go" href="${txLink({ person: 'me', month: ym })}">See my charges</a></section>`;
    }
    if (family) {
      const sum = (pred) => A.filter(pred).reduce((s, a) => s + Number(a.balance || 0), 0);
      const cash = sum((a) => ['checking', 'savings', 'cash'].includes(a.type)), inv = sum((a) => a.type === 'investment' || a.type === 'real_estate' || a.type === 'other'), debt = sum(isDebt);
      const s0 = spend(ym), s1 = spend(lm), d = s1 ? Math.round(100 * (s0 - s1) / s1) : 0;
      html += `<div class="totals">
        <div class="tot"><div class="k">Cash</div><div class="v num">${money(cash, true)}</div><div class="s">checking, savings, cash</div></div>
        <div class="tot"><div class="k">Investments</div><div class="v num">${money(inv, true)}</div><div class="s">${A.filter((a) => a.type === 'investment').length} account${A.filter((a) => a.type === 'investment').length === 1 ? '' : 's'}</div></div>
        <div class="tot"><div class="k">Owed</div><div class="v num ${debt ? 'neg' : ''}">${money(debt, true)}</div><div class="s">cards and loans</div></div>
        <div class="tot"><div class="k">Spending this month</div><div class="v num">${money(s0, true)}</div><div class="s">${s1 ? `${d >= 0 ? '+' : ''}${d}% vs ${money(s1, true)} last month` : 'no data for last month'}</div></div></div>`;
      for (const a of kidAccounts.filter((a) => a.owner[0] !== ME.user_id)) html += `<section class="card"><div class="k">${esc(a.name)}</div><div class="big">${money(a.balance)}</div>${goalMeter(a)}<a class="go" href="#/account/${a.id}">Open</a></section>`;
      for (const type of TYPE_ORDER) {
        const list = A.filter((a) => a.type === type && !(kidAccounts.includes(a)));
        if (!list.length) continue;
        html += `<h2>${TYPE_LABEL[type]}</h2><div class="acct-group">${list.map(accountRow).join('')}</div>`;
      }
      html += `<p class="note"><a href="${txLink({ month: ym })}">All charges this month</a> · <a href="#/budgets">Budgets</a></p>`;
    }
    html += `<p class="foot">Balances come from Copilot Money on each sync. Version ${APP_VERSION}.</p></div>`;
    app.innerHTML = html;
  }

  /* ---------- account ---------- */
  async function viewAccount(id, f) {
    const a = acct(id); if (!a) { app.innerHTML = '<p class="pad muted">That account isn\'t shared with you.</p>'; return; }
    const ym = f.month || thisMonth();
    const [bal, tx] = await Promise.all([sb.from('balances').select('as_of, balance').eq('account_id', id).order('as_of'), fetchTx({ account: id, month: ym, from: monthRange(ym)[0], to: monthRange(ym)[1] })]);
    const canEdit = isAdmin() || (a.editors || []).includes(ME.user_id);
    app.innerHTML = `<div class="stack"><div class="row between"><div><span class="eyebrow">${esc(a.institution || TYPE_LABEL[a.type])}${a.mask ? ' · ••' + esc(a.mask) : ''}</span><h1>${esc(a.name)}</h1></div>
        <div class="bal num" style="font-family:var(--f-display);font-size:30px;font-weight:700">${money(a.balance)}${isDebt(a) && Number(a.balance) > 0 ? '<small class="small muted"> owed</small>' : ''}</div></div>
      ${a.balance_as_of ? `<div class="note">Balance as of ${fmtDateY(a.balance_as_of)}${a.credit_limit ? ` · limit ${money(a.credit_limit, true)}` : ''}</div>` : ''}
      ${sparkline(bal.data || [])}
      ${a.type === 'savings' ? `<div>${goalMeter(a) || '<div class="note">No savings goal set.</div>'}${canEdit ? ' <button class="linkbtn sm" id="goal">Set goal</button>' : ''}</div>` : ''}
      <div class="row between"><h2>${esc(monthName(ym))}</h2><div class="seg"><button data-m="${addMonths(ym, -1)}">‹ ${monthName(addMonths(ym, -1)).split(' ')[0]}</button><button data-m="${addMonths(ym, 1)}">${monthName(addMonths(ym, 1)).split(' ')[0]} ›</button></div></div>
      ${txTable(tx, { showAccount: false })}
      <p class="note"><a href="${txLink({ account: id, range: 'all' })}">Every charge on this account, with filters</a></p></div>`;
    app.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { location.hash = link('account/' + id, { month: b.dataset.m }); });
    const g = app.querySelector('#goal'); if (g) g.onclick = () => goalSheet(a);
    wireRows();
  }
  function goalSheet(a) {
    const g = GOALS.find((x) => x.account_id === a.id) || {};
    sheet.innerHTML = `<form class="sheetgrid" id="gf"><h2>Savings goal for ${esc(a.name)}</h2>
      <label>Target<input id="g_t" type="number" min="1" step="1" value="${esc(g.target || '')}" required></label>
      <label>By (optional)<input id="g_d" type="date" value="${esc(g.target_date || '')}"></label>
      <label>Note<input id="g_n" type="text" maxlength="120" value="${esc(g.note || '')}"></label>
      <div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" id="g_x">Cancel</button>${g.id ? '<button type="button" class="linkbtn" id="g_del">Remove goal</button>' : ''}</div><div class="err" id="g_e"></div></form>`;
    sheet.showModal();
    sheet.querySelector('#g_x').onclick = () => sheet.close();
    sheet.querySelector('#gf').onsubmit = async (e) => {
      e.preventDefault();
      const row = { account_id: a.id, target: Number(sheet.querySelector('#g_t').value), target_date: sheet.querySelector('#g_d').value || null, note: sheet.querySelector('#g_n').value.trim() || null };
      const { error } = await sb.from('savings_goals').upsert(row, { onConflict: 'account_id' });
      if (error) { sheet.querySelector('#g_e').textContent = error.message; return; }
      sheet.close(); toast('Goal saved'); await loadBase(); render();
    };
    const del = sheet.querySelector('#g_del'); if (del) del.onclick = async () => { await sb.from('savings_goals').delete().eq('account_id', a.id); sheet.close(); await loadBase(); render(); };
  }

  /* ---------- transactions (drill-in) ---------- */
  function sortRows(rows, sort, dir) {
    const k = sort || 'date', m = dir === 'asc' ? 1 : -1;
    const key = { date: (t) => t.date, amount: (t) => Number(t.amount), merchant: (t) => (t.merchant || t.name).toLowerCase(), category: (t) => catName(categoryOf(t)).toLowerCase(), account: (t) => acctName(t.account_id).toLowerCase(), person: (t) => personLabel(personOf(t)).toLowerCase() }[k] || ((t) => t.date);
    return rows.slice().sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * m || (a.date < b.date ? 1 : -1); });
  }
  function txTable(rows, o) {
    o = o || {}; const f = o.f || {};
    const th = (k, label, cls) => `<th class="${cls || ''}"><button class="${f.sort === k || (!f.sort && k === 'date') ? 'on' : ''} ${f.dir === 'asc' ? 'asc' : ''}" data-sort="${k}">${label}</button></th>`;
    const showPerson = o.showPerson !== false, showAccount = o.showAccount !== false;
    if (!rows.length) return '<p class="muted">No charges match.</p>';
    const spend = rows.filter(counts).reduce((s, t) => s + Number(t.amount), 0);
    const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s - Number(t.amount), 0);
    return `<div class="scroll"><table class="tx"><thead><tr>${th('date', 'Date')}${th('merchant', 'Merchant')}${showAccount ? th('account', 'Account') : ''}${showPerson ? th('person', 'Who') : ''}${th('category', 'Category')}${th('amount', 'Amount', 'r')}</tr></thead><tbody>
      ${rows.map((t) => `<tr data-id="${t.id}"><td class="num">${fmtDate(t.date)}${t.status === 'pending' ? '<span class="badge pend">pending</span>' : ''}</td>
        <td><div class="m">${esc(t.merchant || t.name)}</div><div class="s">${esc(t.category || '')}${t.recurring ? ' · recurring' : ''}${t.excluded ? ' · excluded' : ''}${t.note ? ' · ' + esc(t.note) : ''}</div></td>
        ${showAccount ? `<td>${esc(acctName(t.account_id))}</td>` : ''}${showPerson ? `<td>${esc(personLabel(personOf(t)))}</td>` : ''}
        <td><a href="${txLink({ ...f, cat: categoryOf(t) })}">${esc(catName(categoryOf(t)))}</a>${isAdmin() ? ` <button class="rule" data-rule="${esc(t.merchant || t.name)}">rule…</button>` : ''}</td>
        <td class="r num ${Number(t.amount) < 0 ? 'pos' : ''}">${t.type === 'transfer' ? '<span class="muted">' + signed(t.amount) + '</span>' : signed(t.amount)}</td></tr>`).join('')}
      <tr class="sum"><td colspan="${3 + (showAccount ? 1 : 0) + (showPerson ? 1 : 0)}">${rows.length} charge${rows.length === 1 ? '' : 's'} · spending ${money(spend)}${income ? ' · income ' + money(income) : ''}</td><td class="r num">${money(spend)}</td></tr></tbody></table></div>`;
  }
  function wireRows() {
    app.querySelectorAll('[data-rule]').forEach((b) => b.onclick = () => ruleSheet(b.dataset.rule));
  }
  async function viewTransactions(f) {
    const ym = f.range === 'all' || f.from || f.to ? null : (f.month || thisMonth());
    const q = { ...f }; if (ym) { [q.from, q.to] = monthRange(ym); q.month = ym; }
    const rows = sortRows(await fetchTx(q), f.sort, f.dir);
    const groups = f.by && f.by !== 'list' ? groupBy(rows, f.by) : null;
    const people = [...new Set(A.flatMap((a) => a.owner))].map((u) => [u, first(u)]);
    if (A.some((a) => a.owner.length > 1)) people.push(['shared', 'Kevin & Janet']);
    M.forEach((m) => { if (!people.some((p) => p[0] === m.user_id)) people.push([m.user_id, first(m.user_id)]); });
    const accounts = [...A, ...CARDS];
    app.innerHTML = `<div class="stack"><div><span class="eyebrow">${ym ? esc(monthName(ym)) : f.from || f.to ? `${esc(f.from || '…')} to ${esc(f.to || '…')}` : 'All time'}</span><h1>Charges</h1></div>
      <form class="filters" id="filt">
        <label class="wide">Search<input type="search" name="q" value="${esc(f.q || '')}" placeholder="merchant, name or note"></label>
        <label>Month<input type="month" name="month" value="${esc(ym || '')}"></label>
        <label>From<input type="date" name="from" value="${esc(ym ? '' : f.from || '')}"></label>
        <label>To<input type="date" name="to" value="${esc(ym ? '' : f.to || '')}"></label>
        <label>Account<select name="account"><option value="">All</option>${accounts.map((a) => `<option value="${a.id}" ${f.account === a.id ? 'selected' : ''}>${esc(a.name)}${a.mask ? ' ••' + esc(a.mask) : ''}</option>`).join('')}</select></label>
        <label>Who<select name="person"><option value="">Everyone</option><option value="me" ${f.person === 'me' ? 'selected' : ''}>Me</option>${people.map(([k, l]) => `<option value="${k}" ${f.person === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label>Category<select name="cat"><option value="">All</option>${CATS.map((c) => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Type<select name="type"><option value="">All</option>${[['spending', 'Spending'], ['income', 'Income'], ['transfer', 'Transfers']].map(([k, l]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Recurring<select name="recurring"><option value="">All</option><option value="1" ${f.recurring === '1' ? 'selected' : ''}>Recurring only</option></select></label>
        ${f.merchant ? `<label>Merchant<input type="text" name="merchant" value="${esc(f.merchant)}"></label>` : ''}
        <div class="row wide"><button class="btn" style="padding:8px 14px">Apply</button><a class="linkbtn" href="#/transactions">Clear</a><a class="linkbtn" href="${txLink({ ...f, range: 'all', month: '' })}">All time</a></div>
      </form>
      <div class="row between"><span class="note">Totals by</span><div class="seg">${[['list', 'List'], ['account', 'Account'], ['month', 'Month'], ['category', 'Category'], ['merchant', 'Merchant'], ['person', 'Person']].map(([k, l]) => `<button class="${(f.by || 'list') === k ? 'on' : ''}" data-by="${k}">${l}</button>`).join('')}</div></div>
      ${groups ? groupTable(groups, f) : txTable(rows, { f })}</div>`;
    document.getElementById('filt').onsubmit = (e) => {
      e.preventDefault(); const fd = new FormData(e.target); const n = { sort: f.sort, dir: f.dir, by: f.by };
      fd.forEach((v, k) => { if (v) n[k] = v; });
      if (n.from || n.to) { delete n.month; n.range = 'all'; } else if (!n.month) n.range = 'all';
      location.hash = txLink(n);
    };
    app.querySelectorAll('[data-by]').forEach((b) => b.onclick = () => { location.hash = txLink({ ...f, by: b.dataset.by }); });
    app.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => { const k = b.dataset.sort; location.hash = txLink({ ...f, sort: k, dir: f.sort === k && f.dir !== 'asc' ? 'asc' : 'desc' }); });
    wireRows();
  }
  function groupBy(rows, by) {
    const keyOf = { account: (t) => [t.account_id, acctName(t.account_id)], month: (t) => [t.date.slice(0, 7), monthName(t.date.slice(0, 7))], category: (t) => [categoryOf(t), catName(categoryOf(t))], merchant: (t) => [t.merchant || t.name, t.merchant || t.name], person: (t) => [personOf(t) || '', personLabel(personOf(t))] }[by];
    const g = new Map();
    rows.forEach((t) => { const [k, l] = keyOf(t); const e = g.get(k) || { k, l, n: 0, spend: 0, income: 0 }; e.n++; if (counts(t)) e.spend += Number(t.amount); if (t.type === 'income') e.income -= Number(t.amount); g.set(k, e); });
    return [...g.values()].sort((a, b) => b.spend - a.spend);
  }
  function groupTable(groups, f) {
    const param = { account: 'account', month: 'month', category: 'cat', merchant: 'merchant', person: 'person' }[f.by];
    const total = groups.reduce((s, g) => s + g.spend, 0);
    return `<div class="scroll"><table class="tx"><thead><tr><th>${esc(f.by)}</th><th class="r">Charges</th><th class="r">Spending</th><th class="r">Share</th></tr></thead><tbody>
      ${groups.map((g) => `<tr><td><a href="${txLink({ ...f, by: 'list', [param]: g.k, ...(f.by === 'month' ? { range: '', from: '', to: '' } : {}) })}">${esc(g.l)}</a></td><td class="r num">${g.n}</td><td class="r num">${money(g.spend)}${g.income ? `<div class="s">income ${money(g.income)}</div>` : ''}</td><td class="r num">${total ? Math.round(100 * g.spend / total) : 0}%</td></tr>`).join('')}
      <tr class="sum"><td>Total</td><td class="r num">${groups.reduce((s, g) => s + g.n, 0)}</td><td class="r num">${money(total)}</td><td></td></tr></tbody></table></div>`;
  }
  function ruleSheet(merchant) {
    sheet.innerHTML = `<form class="sheetgrid" id="rf"><h2>Always put this merchant in…</h2><div class="note">Charges whose merchant contains the text below go to the category you pick, whatever the bank called them.</div>
      <label>Merchant text<input id="r_p" type="text" value="${esc(merchant)}" required maxlength="80"></label>
      <label>Category<select id="r_c">${CATS.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <div class="row"><button class="btn">Save rule</button><button type="button" class="btn ghost" id="r_x">Cancel</button></div><div class="err" id="r_e"></div></form>`;
    sheet.showModal(); sheet.querySelector('#r_x').onclick = () => sheet.close();
    sheet.querySelector('#rf').onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.from('category_rules').upsert({ kind: 'merchant', pattern: sheet.querySelector('#r_p').value.trim(), category_id: sheet.querySelector('#r_c').value, sort: 0 }, { onConflict: 'kind,pattern' });
      if (error) { sheet.querySelector('#r_e').textContent = error.message; return; }
      sheet.close(); toast('Rule saved'); await loadBase(); render();
    };
  }

  /* ---------- budgets ---------- */
  async function viewBudgets(f) {
    const ym = f.month || thisMonth();
    const [r0, r1] = monthRange(ym);
    const people = isManager() ? [...M.map((m) => [m.user_id, first(m.user_id)]), ['shared', 'Kevin & Janet'], ['family', 'Whole family']] : [[ME.user_id, first(ME.user_id)]];
    const person = f.person && people.some((p) => p[0] === f.person) ? f.person : people[0][0];
    const [tx, b] = await Promise.all([fetchTx({ from: r0, to: r1 }), sb.from('budgets').select('*')]);
    const budgets = b.data || [];
    const mine = tx.filter((t) => counts(t) && (person === 'family' ? !!personOf(t) : personOf(t) === person));
    const spent = new Map(); mine.forEach((t) => { const c = categoryOf(t); spent.set(c, (spent.get(c) || 0) + Number(t.amount)); });
    const budgetFor = (cid) => person === 'family' ? budgets.filter((x) => x.category_id === cid && x.amount != null).reduce((s, x) => s + Number(x.amount), 0) || null : (budgets.find((x) => x.person === person && x.category_id === cid) || {}).amount;
    const total = [...spent.values()].reduce((s, v) => s + v, 0);
    const rows = CATS.map((c) => ({ c, spent: spent.get(c.id) || 0, budget: budgetFor(c.id) })).filter((r) => r.spent || r.budget != null || isAdmin());
    const totalBudget = rows.reduce((s, r) => s + (r.budget != null ? Number(r.budget) : 0), 0);
    app.innerHTML = `<div class="stack"><div class="row between"><div><span class="eyebrow">${esc(monthName(ym))}</span><h1>${esc(personLabel(person))}${person === 'family' ? '' : "'s budget"}</h1></div>
        <div class="seg"><button data-m="${addMonths(ym, -1)}">‹</button><button data-m="${thisMonth()}">This month</button><button data-m="${addMonths(ym, 1)}">›</button></div></div>
      ${people.length > 1 ? `<div class="seg">${people.map(([k, l]) => `<button class="${k === person ? 'on' : ''}" data-p="${k}">${esc(l)}</button>`).join('')}</div>` : ''}
      <div class="totals"><div class="tot"><div class="k">Spent</div><div class="v num">${money(total, true)}</div><div class="s">${mine.length} charges</div></div>
        <div class="tot"><div class="k">Budget</div><div class="v num">${totalBudget ? money(totalBudget, true) : '—'}</div><div class="s">${totalBudget ? (totalBudget - total >= 0 ? money(totalBudget - total, true) + ' left' : money(total - totalBudget, true) + ' over') : 'no budget set'}</div></div></div>
      <div>${rows.map((r) => {
        const pct = r.budget ? Math.round(100 * r.spent / Number(r.budget)) : 0, cls = r.budget ? (pct >= 100 ? 'over' : pct >= 85 ? 'warn' : '') : '';
        return `<div class="brow"><a href="${txLink({ month: ym, person: person === 'family' ? '' : person, cat: r.c.id })}" style="font-weight:600;text-decoration:none">${esc(r.c.name)}</a>
          <div class="amt">${money(r.spent)}${r.budget != null ? ` of ${isAdmin() && person !== 'family' ? '' : money(r.budget, true)}` : isAdmin() && person !== 'family' ? ' of ' : ' · <span class="muted">no budget set</span>'}${isAdmin() && person !== 'family' ? `<input type="number" min="0" step="1" data-b="${r.c.id}" value="${r.budget != null ? esc(r.budget) : ''}" placeholder="budget" aria-label="Budget for ${esc(r.c.name)}">` : ''}${r.budget != null ? `<div class="s ${pct >= 100 ? 'neg' : ''}">${pct >= 100 ? money(r.spent - r.budget) + ' over' : money(r.budget - r.spent) + ' left'}</div>` : ''}</div>
          ${r.budget ? `<div class="meter ${cls}"><div class="tr"><i style="width:${Math.min(100, pct)}%"></i></div></div>` : ''}</div>`; }).join('')}</div>
      <p class="note">Spending only: transfers, card payments and charges Copilot excludes never count. Apple Card charges go to whoever bought them; other cards go to the account's owner.</p></div>`;
    app.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { location.hash = link('budgets', { person, month: b.dataset.m }); });
    app.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { location.hash = link('budgets', { person: b.dataset.p, month: ym }); });
    app.querySelectorAll('[data-b]').forEach((inp) => inp.onchange = async () => {
      const amount = inp.value === '' ? null : Number(inp.value);
      const { error } = await sb.from('budgets').upsert({ person, category_id: inp.dataset.b, amount }, { onConflict: 'person,category_id' });
      if (error) { toast('Could not save: ' + error.message); return; }
      toast(amount == null ? 'Budget cleared' : 'Budget saved'); render();
    });
  }

  /* ---------- setup (admins) ---------- */
  async function viewSetup() {
    if (!isAdmin()) { app.innerHTML = '<p class="pad muted">Only Kevin can change the setup.</p>'; return; }
    const sync = (await sb.from('money_sync').select('*').eq('id', 1).maybeSingle()).data;
    const peopleBoxes = (name, list) => `<div class="people">${M.map((m) => `<label><input type="checkbox" name="${name}" value="${m.user_id}" ${list.includes(m.user_id) ? 'checked' : ''}>${esc(first(m.user_id))}</label>`).join('')}</div>`;
    app.innerHTML = `<div class="stack"><div><span class="eyebrow">Kevin only</span><h1>Setup</h1></div>
      <section class="card"><h3>Sync from Copilot Money</h3>
        <div class="note">${sync && sync.last_sync_at ? `Last sync ${new Date(sync.last_sync_at).toLocaleString('en-US', { timeZone: TZ })}: ${esc(sync.last_result || '')}` : 'No sync has run yet.'}</div>
        <div class="row"><button class="linkbtn" id="showkey">Show sync key</button><button class="linkbtn" id="rotkey">Rotate key</button></div><div class="code" id="key" hidden></div>
        <div class="note">The scheduled Claude job sends this key with each push. If it ever leaks, rotate it and save the new one on the Mac.</div></section>
      <section class="card"><h3>Apple Card: who bought what</h3>
        <div class="note">Export from Wallet (Apple Card › Card balance › Export transactions, CSV) and choose the file. Only the "Purchased By" name is used; charges are matched by date, amount and merchant.</div>
        <label>Card<select id="ap_acct">${A.filter((a) => a.type === 'credit').map((a) => `<option value="${a.id}" ${/apple/i.test(a.name) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        <label>CSV file<input type="file" id="ap_file" accept=".csv,text/csv"></label>
        <div id="ap_out" class="note"></div><div class="row"><button class="btn" id="ap_go" disabled>Apply to charges</button></div></section>
      <h2>Accounts</h2><div class="note">Who can see each account, who can change it, and whose spending it counts as. New accounts from the sync start visible to you only.</div>
      ${A.map((a) => `<form class="setup-acct ${a.is_setup ? '' : 'new'}" data-id="${a.id}">
        <div class="row between"><b>${esc(a.copilot_name || a.name)}${a.mask ? ' ••' + esc(a.mask) : ''}${a.is_setup ? '' : '<span class="badge new">New, not set up</span>'}</b><span class="note">${esc(a.institution || '')} · ${money(a.balance)}</span></div>
        <div class="row"><label style="flex:1">Name in the app<input type="text" name="name" value="${esc(a.name)}" maxlength="60" required></label>
          <label>Type<select name="type">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <div class="note">Who can see it</div>${peopleBoxes('visible_to', a.visible_to)}
        <div class="note">Whose spending it is (two people = the Kevin & Janet budget)</div>${peopleBoxes('owner', a.owner)}
        <div class="note">Who can change it</div>${peopleBoxes('editors', a.editors)}
        <div class="row"><button class="btn" style="padding:8px 14px">Save</button></div></form>`).join('')}
      <h2>Category rules</h2><div class="note">Merchant rules win over category rules. Anything unmatched goes to Other.</div>
      <div class="scroll"><table class="tx"><thead><tr><th>Kind</th><th>Matches</th><th>Goes to</th><th></th></tr></thead><tbody>${RULES.map((r) => `<tr><td>${r.kind}</td><td>${esc(r.pattern)}</td><td>${esc(catName(r.category_id))}</td><td><button class="rule" data-del="${r.id}">remove</button></td></tr>`).join('')}</tbody></table></div>
      <form class="f" id="newrule"><div class="row"><select name="kind"><option value="merchant">Merchant contains</option><option value="category">Bank category is</option></select><input type="text" name="pattern" placeholder="text" required maxlength="80"><select name="category_id">${CATS.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><button class="btn" style="padding:8px 14px">Add rule</button></div></form>
      <h2>Budget categories</h2><form class="f" id="newcat"><div class="row">${CATS.map((c) => `<span class="badge">${esc(c.name)}</span>`).join(' ')}</div><div class="row"><input type="text" name="name" placeholder="New category" required maxlength="40"><button class="btn" style="padding:8px 14px">Add</button></div></form></div>`;
    document.getElementById('showkey').onclick = () => { const k = document.getElementById('key'); k.textContent = sync ? sync.token : 'Not available'; k.hidden = !k.hidden; };
    document.getElementById('rotkey').onclick = async () => {
      if (!confirm('Rotate the sync key? The Mac job stops working until the new key is saved there.')) return;
      const { data, error } = await sb.rpc('rotate_money_sync_key'); if (error) { toast(error.message); return; }
      const k = document.getElementById('key'); k.textContent = data; k.hidden = false; toast('New key');
    };
    app.querySelectorAll('form.setup-acct').forEach((frm) => frm.onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(frm);
      const row = { name: fd.get('name').trim(), type: fd.get('type'), visible_to: fd.getAll('visible_to'), owner: fd.getAll('owner'), editors: fd.getAll('editors'), is_setup: true };
      if (!row.visible_to.includes(ME.user_id)) row.visible_to.push(ME.user_id);
      const { error } = await sb.from('accounts').update(row).eq('id', frm.dataset.id);
      if (error) { toast('Could not save: ' + error.message); return; }
      toast('Saved'); await loadBase(); render();
    });
    app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await sb.from('category_rules').delete().eq('id', b.dataset.del); await loadBase(); render(); });
    document.getElementById('newrule').onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      const { error } = await sb.from('category_rules').upsert({ kind: fd.get('kind'), pattern: fd.get('pattern').trim(), category_id: fd.get('category_id'), sort: 50 }, { onConflict: 'kind,pattern' });
      if (error) { toast(error.message); return; } await loadBase(); render();
    };
    document.getElementById('newcat').onsubmit = async (e) => {
      e.preventDefault(); const name = new FormData(e.target).get('name').trim();
      const { error } = await sb.from('budget_categories').insert({ name, sort: CATS.length + 1 });
      if (error) { toast(error.message); return; } await loadBase(); render();
    };
    // Apple Card CSV
    let parsed = null;
    document.getElementById('ap_file').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const text = await file.text(); parsed = parseAppleCsv(text);
      const by = {}; parsed.rows.forEach((r) => { by[r.byName] = (by[r.byName] || 0) + 1; });
      document.getElementById('ap_out').innerHTML = `${parsed.rows.length} purchases from ${esc(parsed.rows.length ? parsed.rows[parsed.rows.length - 1].date : '')} to ${esc(parsed.rows.length ? parsed.rows[0].date : '')}: ${Object.entries(by).map(([k, v]) => `${esc(k)} ${v}${parsed.unknown.includes(k) ? ' (no login, skipped)' : ''}`).join(', ')}${parsed.skipped ? ` · ${parsed.skipped} payments and other non-purchases skipped` : ''}`;
      document.getElementById('ap_go').disabled = !parsed.rows.some((r) => r.by);
    };
    document.getElementById('ap_go').onclick = async () => {
      const rows = parsed.rows.filter((r) => r.by).map(({ date, clearing, amount, merchant, by }) => ({ date, clearing, amount, merchant, by }));
      const btn = document.getElementById('ap_go'); btn.disabled = true; btn.textContent = 'Applying…';
      let ok = 0, miss = 0, missing = [];
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await sb.rpc('money_apply_purchasers', { acct: document.getElementById('ap_acct').value, rows: rows.slice(i, i + 500) });
        if (error) { toast('Import failed: ' + error.message); btn.disabled = false; btn.textContent = 'Apply to charges'; return; }
        ok += data.matched; miss += data.unmatched; missing = missing.concat(data.missing || []);
      }
      // Second pass: Apple and Copilot often spell a merchant differently ("Mcdonalds" vs "Mcdonald's"), so a
      // leftover row is matched on date and amount alone when that points at exactly one unassigned charge.
      const loose = await looseMatch(document.getElementById('ap_acct').value, missing);
      btn.textContent = 'Apply to charges';
      document.getElementById('ap_out').innerHTML = `Done: ${ok + loose.done} charges now say who bought them (${loose.done} by date and amount only), ${miss - loose.done} had no matching charge in Copilot yet${loose.left.length ? ` (${loose.left.slice(0, 8).map((r) => `${esc(r.date)} ${esc(r.merchant)} ${money(r.amount)}`).join('; ')}${loose.left.length > 8 ? '…' : ''})` : ''}.`;
    };
  }
  async function looseMatch(acctId, rows) {
    const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const key = (d, a) => d + '|' + Number(a).toFixed(2);
    let tx = [];
    for (let p = 0; p < 10; p++) {
      const { data } = await sb.from('transactions').select('id, date, amount').eq('account_id', acctId).is('purchased_by', null).range(p * 1000, p * 1000 + 999);
      tx = tx.concat(data || []); if (!data || data.length < 1000) break;
    }
    const txBy = {}; tx.forEach((t) => (txBy[key(t.date, t.amount)] = txBy[key(t.date, t.amount)] || []).push(t));
    const rowsBy = {}; rows.forEach((r) => (rowsBy[key(r.date, r.amount)] = rowsBy[key(r.date, r.amount)] || []).push(r));
    const used = new Set(), byPerson = {}, left = [];
    for (const [k, rs] of Object.entries(rowsBy)) {
      const [d, a] = k.split('|'); let cands = [];
      for (const off of [0, 1, -1, 2, 3]) { cands = (txBy[key(addDays(d, off), a)] || []).filter((t) => !used.has(t.id)); if (cands.length) break; }
      const people = new Set(rs.map((r) => r.by));
      if (cands.length && cands.length === rs.length && people.size === 1) cands.forEach((t) => { used.add(t.id); (byPerson[rs[0].by] = byPerson[rs[0].by] || []).push(t.id); });
      else left.push(...rs);
    }
    let done = 0;
    for (const [by, ids] of Object.entries(byPerson)) {
      for (let i = 0; i < ids.length; i += 200) { const { error } = await sb.from('transactions').update({ purchased_by: by }).in('id', ids.slice(i, i + 200)); if (!error) done += Math.min(200, ids.length - i); }
    }
    return { done, left };
  }
  // Apple Card CSV: Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD), Purchased By
  function parseAppleCsv(text) {
    const lines = []; let cur = [], field = '', inq = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inq) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inq = false; } else field += c; }
      else if (c === '"') inq = true; else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; cur.push(field); lines.push(cur); cur = []; field = ''; }
      else field += c;
    }
    if (field || cur.length) { cur.push(field); lines.push(cur); }
    const head = (lines.shift() || []).map((h) => h.trim().toLowerCase());
    const col = (n) => head.findIndex((h) => h.startsWith(n));
    const ix = { date: col('transaction date'), clearing: col('clearing date'), merchant: col('merchant'), type: col('type'), amount: col('amount'), by: col('purchased by') };
    const mdy = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
    const rows = [], unknown = new Set(); let skipped = 0;
    for (const l of lines) {
      if (l.length < head.length || !mdy(l[ix.date])) continue;
      const type = String(l[ix.type] || '').trim();
      if (!/purchase|installment|debit/i.test(type)) { skipped++; continue; }
      const byName = String(l[ix.by] || '').trim(); const fn = byName.split(' ')[0].toLowerCase();
      const m = M.find((x) => x.display_name.split(' ')[0].toLowerCase() === fn);
      if (!m) unknown.add(byName);
      rows.push({ date: mdy(l[ix.date]), clearing: mdy(l[ix.clearing]), merchant: String(l[ix.merchant] || '').trim(), amount: Number(String(l[ix.amount]).replace(/[^0-9.-]/g, '')), byName, by: m ? m.user_id : null });
    }
    return { rows, unknown: [...unknown], skipped };
  }

  /* ---------- start ---------- */
  async function start() {
    session = (await sb.auth.getSession()).data.session;
    if (!session) { app.innerHTML = '<div class="signin"><h1>Family money</h1><p>Sign in on the <a href="/">family page</a> first; that sign-in covers this page too.</p></div>'; return; }
    try { await loadBase(); } catch (e) { app.innerHTML = `<p class="pad err">Could not load: ${esc(e.message)}</p>`; return; }
    if (!ME) { app.innerHTML = '<div class="signin"><h1>Almost there</h1><p>Your account isn\'t on the family list yet. Ask Kevin to add you.</p></div>'; return; }
    window.addEventListener('hashchange', render);
    render();
  }
  if (!CFG.SUPABASE_URL || !window.supabase) { app.innerHTML = '<p class="pad">Setup needed: config.js is missing.</p>'; return; }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') location.href = '/'; });
  start();
})();
