/* Mock Supabase client for UI tests (served by tests/serve.py in place of the CDN script).
   Reads window.__SEED__ (tests/fixtures/money-seed.json, gitignored) and signs in as the member named
   by ?as=<first name> in the page URL. It imitates the money row rules: an account and its balances and
   goals are visible if visible_to lists me; a charge if its account is visible or purchased_by is me. */
(function () {
  const DB = window.__SEED__ || {};
  const who = (new URLSearchParams(location.search).get('as') || 'kevin').toLowerCase();
  const me = (DB.members || []).find((m) => m.display_name.toLowerCase().startsWith(who)) || (DB.members || [])[0];
  const uid = me.user_id;
  const settings = (DB.money_settings || [])[0] || { admins: [], managers: [] };
  const isAdmin = settings.admins.includes(uid);
  const canSee = (aid) => (DB.accounts || []).some((a) => a.id === aid && a.visible_to.includes(uid));
  const canChange = (aid) => (DB.accounts || []).some((a) => a.id === aid && a.editors.includes(uid));
  const visible = {
    accounts: (r) => r.visible_to.includes(uid),
    balances: (r) => canSee(r.account_id),
    savings_goals: (r) => canSee(r.account_id),
    transactions: (r) => canSee(r.account_id) || r.purchased_by === uid,
    budgets: (r) => isAdmin || settings.managers.includes(uid) || r.person === uid,
    money_sync: () => isAdmin,
  };
  const writable = { accounts: (r) => isAdmin || r.editors.includes(uid), budgets: () => isAdmin, category_rules: () => isAdmin, budget_categories: () => isAdmin, savings_goals: (r) => canChange(r.account_id), transactions: (r) => canChange(r.account_id) };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function q(table) {
    let op = 'select', payload = null, single = false, filters = [], orders = [], rng = null;
    const api = {
      select() { return api; }, maybeSingle() { single = true; return api; }, single() { single = true; return api; },
      insert(r) { op = 'insert'; payload = r; return api; }, update(r) { op = 'update'; payload = r; return api; },
      upsert(r, o) { op = 'upsert'; payload = r; api._on = o && o.onConflict; return api; }, delete() { op = 'delete'; return api; },
      eq(k, v) { filters.push((r) => r[k] === v); return api; }, neq(k, v) { filters.push((r) => r[k] !== v); return api; },
      gte(k, v) { filters.push((r) => r[k] >= v); return api; }, lte(k, v) { filters.push((r) => r[k] <= v); return api; },
      in(k, vs) { filters.push((r) => vs.includes(r[k])); return api; },
      not(k, o, v) { filters.push((r) => !(o === 'is' && v === null ? r[k] == null : r[k] === v)); return api; },
      or(expr) { const parts = expr.split(',').map((p) => { const [k, , pat] = p.split('.'); const s = pat.replace(/%/g, '').toLowerCase(); return (r) => String(r[k] || '').toLowerCase().includes(s); }); filters.push((r) => parts.some((f) => f(r))); return api; },
      order(k, o) { orders.push([k, !o || o.ascending !== false]); return api; }, range(a, b) { rng = [a, b]; return api; }, limit(n) { rng = [0, n - 1]; return api; },
      then(res, rej) {
        const rows = DB[table] = DB[table] || [];
        const vis = visible[table] || (() => true), canW = writable[table] || (() => isAdmin);
        const match = (r) => filters.every((f) => f(r));
        let data = null, error = null;
        if (op === 'select') {
          data = clone(rows.filter((r) => vis(r) && match(r)));
          orders.reverse().forEach(([k, asc]) => data.sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1)));
          if (rng) data = data.slice(rng[0], rng[1] + 1);
          if (single) data = data[0] || null;
        } else if (op === 'insert') {
          const list = Array.isArray(payload) ? payload : [payload];
          data = list.map((p) => { if (!canW(p)) { error = { message: 'new row violates row-level security policy' }; return null; } const r = Object.assign({ id: crypto.randomUUID(), updated_at: new Date().toISOString(), updated_by: uid }, p); rows.push(r); return clone(r); });
        } else if (op === 'update') {
          data = []; rows.forEach((r) => { if (match(r) && vis(r) && canW(r)) { Object.assign(r, payload, { updated_at: new Date().toISOString(), updated_by: uid }); data.push(clone(r)); } });
        } else if (op === 'delete') {
          data = []; DB[table] = rows.filter((r) => !(match(r) && vis(r) && canW(r)));
        } else if (op === 'upsert') {
          const keys = (api._on || 'id').split(','); const list = Array.isArray(payload) ? payload : [payload];
          data = list.map((p) => { if (!canW(p)) { error = { message: 'new row violates row-level security policy' }; return null; } const i = rows.findIndex((r) => keys.every((k) => r[k] === p[k])); if (i >= 0) { Object.assign(rows[i], p); return clone(rows[i]); } const r = Object.assign({ id: crypto.randomUUID() }, p); rows.push(r); return clone(r); });
        }
        return Promise.resolve({ data, error }).then(res, rej);
      },
    };
    return api;
  }
  const rpc = {
    money_card_labels: () => (DB.accounts || []).filter((a) => (DB.transactions || []).some((t) => t.account_id === a.id && t.purchased_by === uid)).map(({ id, name, type, mask }) => ({ id, name, type, mask })),
    rotate_money_sync_key: () => { const t = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''); DB.money_sync[0].token = t; return t; },
    money_apply_purchasers: ({ acct, rows }) => {
      let matched = 0; const missing = [];
      rows.forEach((r) => { const m = r.merchant.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0];
        const t = (DB.transactions || []).find((t) => t.account_id === acct && Number(t.amount) === Number(r.amount) && t.date >= r.date && (t.merchant || t.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').startsWith(m));
        if (t) { t.purchased_by = r.by; matched++; } else missing.push(r); });
      return { matched, unmatched: missing.length, missing };
    },
  };
  window.supabase = { createClient() { return {
    from: q,
    rpc(name, args) { return Promise.resolve({ data: rpc[name] ? rpc[name](args || {}) : null, error: rpc[name] ? null : { message: 'no such function ' + name } }); },
    auth: {
      async getSession() { return { data: { session: { user: { id: uid, email: me.email || 'test@example' } } } }; },
      onAuthStateChange(cb) { setTimeout(() => cb('INITIAL_SESSION', { user: { id: uid } }), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword() { return { error: null }; }, async signOut() { return { error: null }; },
      async resetPasswordForEmail() { return { error: null }; }, async updateUser() { return { error: null }; },
    },
    channel() { const c = { on() { return c; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 0); return c; } }; return c; }, removeChannel() {},
  }; } };
})();
