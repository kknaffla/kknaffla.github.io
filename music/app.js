/* Music we follow: each family member follows the artists they like. The Knaffla Brief shows news and
   new releases for every followed artist. Anyone can add an artist; you follow or unfollow only for yourself. */
(() => {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PALETTE = [['#2b1055', '#7b2ff7'], ['#7b2ff7', '#f107a3'], ['#0b5f73', '#138a6c'], ['#b4400b', '#e8590c'], ['#1d3f8f', '#2f86c9'], ['#8a1f5c', '#d9486f'], ['#3b2a7a', '#2a7f8f']];
  const PICS = ['🎸', '🎤', '🎶', '🥁', '🎹', '🎧', '🎺'];
  const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  let sb, me, members = [], artists = [], follows = [];

  async function load() {
    const [m, a, f] = await Promise.all([sb.from('members').select('user_id, display_name'), sb.from('music_artists').select('id, name').order('name'), sb.from('music_follows').select('artist_id, user_id')]);
    if (a.error) throw a.error;
    members = m.data || []; artists = a.data || []; follows = f.data || [];
  }
  const first = (id) => ((members.find((x) => x.user_id === id) || {}).display_name || 'Someone').split(' ')[0];

  function render() {
    app.innerHTML = `<section class="mhero"><h1>🎶 Music we follow</h1><p>Follow the artists you like. Each morning the Knaffla Brief shows their news, tours and new releases.</p></section>
      <form class="addrow" id="add"><input id="newname" placeholder="Add an artist, like Zach Bryan" maxlength="80" aria-label="Artist name"><button class="btn">Add</button></form>
      <div class="artists">${artists.map((a) => {
        const h = hash(a.name), [c1, c2] = PALETTE[h % PALETTE.length], who = follows.filter((f) => f.artist_id === a.id).map((f) => f.user_id), mine = who.includes(me);
        return `<div class="artist" style="--a1:${c1};--a2:${c2}"><span class="wm" aria-hidden="true">${PICS[h % PICS.length]}</span><h3>${esc(a.name)}</h3>
          <div class="who">${who.length ? who.map((u) => `<span>${esc(first(u))}</span>`).join('') : '<em>Nobody yet</em>'}</div>
          <div class="acts"><button class="fbtn ${mine ? 'on' : ''}" data-f="${a.id}">${mine ? '✓ Following' : '+ Follow'}</button>${who.length ? '' : `<button class="rm" data-rm="${a.id}">Remove</button>`}</div></div>`;
      }).join('')}</div>
      <p class="note">The brief only shows artists at least one of us follows. Remove appears when nobody follows an artist.</p>`;
    document.getElementById('add').onsubmit = async (e) => {
      e.preventDefault(); const name = document.getElementById('newname').value.trim().replace(/\s+/g, ' ');
      if (!name) return;
      const { data, error } = await sb.from('music_artists').insert({ name }).select('id, name');
      if (error) { alert(error.code === '23505' ? 'That artist is already here.' : error.message); return; }
      artists.push(data[0]); artists.sort((x, y) => x.name.localeCompare(y.name));
      await sb.from('music_follows').insert({ artist_id: data[0].id, user_id: me }); follows.push({ artist_id: data[0].id, user_id: me });
      render();
    };
    app.querySelectorAll('[data-f]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.f, mine = follows.some((f) => f.artist_id === id && f.user_id === me);
      const { error } = mine ? await sb.from('music_follows').delete().eq('artist_id', id).eq('user_id', me) : await sb.from('music_follows').insert({ artist_id: id, user_id: me });
      if (error) return;
      follows = mine ? follows.filter((f) => !(f.artist_id === id && f.user_id === me)) : [...follows, { artist_id: id, user_id: me }];
      render();
    });
    app.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      const { error } = await sb.from('music_artists').delete().eq('id', b.dataset.rm);
      if (!error) { artists = artists.filter((a) => a.id !== b.dataset.rm); render(); }
    });
  }

  (async () => {
    if (!CFG.SUPABASE_URL || !window.supabase) { app.innerHTML = '<p class="pad">Setup needed: config.js is missing.</p>'; return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { app.innerHTML = '<div class="signin"><h1>Music we follow</h1><p>Sign in on the family page first.</p><a class="btn" href="/" style="text-align:center;text-decoration:none">Go to the family page</a></div>'; return; }
    me = session.user.id;
    try { await load(); } catch (err) { app.innerHTML = `<p class="pad">Music isn't set up yet. ${esc(err.message || err)}</p>`; return; }
    render();
  })();
})();
