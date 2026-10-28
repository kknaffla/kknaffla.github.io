/* Amy's College Plan (class of 2029): courses with AP and dual enrollment, a
   grade-by-grade timeline, the four Michigan colleges, activities and tests.
   Same Supabase project and sign-in as the family page. Vanilla JS, no build. */
(() => {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const TZ = CFG.TIME_ZONE || 'America/Detroit';
  const CLASS_OF = 2029;
  const app = document.getElementById('app'), sheet = document.getElementById('sheet');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fmtDate = (iso) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const daysUntil = (iso) => { const [y, m, d] = iso.split('-').map(Number); const [ty, tm, td] = todayISO().split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5); };
  const toast = (t) => { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2400); };
  // School year runs Aug–Jul. Class of 2029 is in grade 12 during 2028-29.
  const nowGrade = () => { const [y, m] = todayISO().split('-').map(Number); const endYear = m >= 8 ? y + 1 : y; return 12 - (CLASS_OF - endYear); };
  const yearLabel = (g) => { const end = CLASS_OF - (12 - g); return `${end - 1}-${String(end).slice(2)}`; };
  const GRADE_NAME = { 9: 'Freshman', 10: 'Sophomore', 11: 'Junior', 12: 'Senior' };

  // Michigan Merit Curriculum (credits). Confirm against the school's handbook.
  const MMC = [['English', 4], ['Math', 4], ['Science', 3], ['Social studies', 3], ['World language', 2], ['Arts', 1], ['Health & PE', 1]];
  // Personal finance (half credit, class of 2028+) is built into 11th grade Economics at Manistique.
  const SUBJECTS = ['English', 'Math', 'Science', 'Social studies', 'World language', 'Arts', 'Business & tech', 'Health & PE', 'Personal finance', 'Elective'];
  const LEVELS = ['Regular', 'Honors', 'AP', 'Online AP', 'Dual enrollment'];

  let sb, D = { courses: [], tasks: [], colleges: [], activities: [], tests: [] };

  /* ---------- data ---------- */
  const TABLE = { courses: 'amy_courses', tasks: 'amy_tasks', colleges: 'amy_colleges', activities: 'amy_activities', tests: 'amy_tests' };
  async function loadAll() {
    const res = await Promise.all(Object.entries(TABLE).map(([k, t]) => sb.from(t).select('*').order(k === 'tasks' ? 'due_date' : k === 'tests' ? 'taken_on' : 'sort', { nullsFirst: false })));
    const bad = res.find((r) => r.error);
    if (bad) throw bad.error;
    Object.keys(TABLE).forEach((k, i) => { D[k] = res[i].data || []; });
  }
  async function save(kind, row) {
    const t = TABLE[kind]; const body = { ...row }; delete body.updated_at; delete body.updated_by;
    const q = body.id ? sb.from(t).update(body).eq('id', body.id).select() : sb.from(t).insert(body).select();
    const { data, error } = await q;
    if (error) { toast('Couldn\'t save: ' + error.message); return false; }
    const r = data[0]; const i = D[kind].findIndex((x) => x.id === r.id);
    if (i >= 0) D[kind][i] = r; else D[kind].push(r);
    return true;
  }
  async function remove(kind, id) {
    const { error } = await sb.from(TABLE[kind]).delete().eq('id', id);
    if (error) { toast('Couldn\'t delete: ' + error.message); return false; }
    D[kind] = D[kind].filter((x) => x.id !== id); return true;
  }

  /* ---------- helpers ---------- */
  const levelBadge = (c) => c.level === 'AP' || c.level === 'Online AP' ? `<span class="badge ap">${c.level === 'Online AP' ? 'AP online' : 'AP'}</span>` : c.level === 'Dual enrollment' ? '<span class="badge de">DE</span>' : c.level === 'Honors' ? '<span class="badge hn">Honors</span>' : '';
  const isAP = (c) => c.level === 'AP' || c.level === 'Online AP';
  const live = (c) => c.status !== 'Dropped' && c.status !== 'Idea';
  function meter(label, have, need) {
    const pct = Math.min(100, Math.round(100 * have / need));
    return `<div class="meter ${have < need ? 'short' : ''}"><div class="lbl"><span>${esc(label)}</span><b>${have} of ${need}</b></div><div class="tr"><i style="width:${pct}%"></i></div></div>`;
  }
  // Match "AP U.S. History" to "AP United States History", "AP American Government" to "AP US Government and Politics", etc.
  const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\./g, '').replace(/^ap\s+/, '')
    .replace(/united states|american/g, 'us').replace(/\b(and politics|and composition|composition)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  /* ---------- views ---------- */
  function viewHome() {
    const g = nowGrade(), t = todayISO();
    const open = D.tasks.filter((x) => x.status !== 'Done' && x.status !== 'Not needed');
    const next = open.filter((x) => x.due_date && x.due_date >= t).slice(0, 5);
    const aps = D.courses.filter((c) => isAP(c) && live(c)), des = D.courses.filter((c) => c.level === 'Dual enrollment' && live(c));
    const collegeCr = des.reduce((a, c) => a + Number(c.college_credits || 0), 0);
    const thisYear = D.courses.filter((c) => c.grade === g && live(c));
    const nextTest = D.tasks.filter((x) => x.category === 'Testing' && x.status !== 'Done' && x.due_date && x.due_date >= t)[0];
    return `<div class="stack">
      <div><span class="eyebrow">${GRADE_NAME[g] || ''} year · ${yearLabel(g)} · Class of ${CLASS_OF}</span><h1>Amy's College Plan</h1></div>
      <section class="today">
        <a class="card" href="#/courses"><div class="k">Challenge courses</div><div class="big">${aps.length} AP <small>· ${des.length} dual enrollment</small></div><div class="small muted">${collegeCr ? collegeCr + ' college credits planned' : 'No college credits planned yet'}</div><div class="go">Course plan</div></a>
        <a class="card" href="#/timeline"><div class="k">Coming up</div>${next.length ? next.slice(0, 3).map((x) => `<div><b>${esc(x.title)}</b> <span class="small muted">${fmtDate(x.due_date)}</span></div>`).join('') : '<div class="small muted">Nothing dated yet</div>'}<div class="go">Timeline</div></a>
        <a class="card ${nextTest && daysUntil(nextTest.due_date) <= 21 ? 'hot' : ''}" href="#/timeline"><div class="k">Next test</div>${nextTest ? `<div class="big">${daysUntil(nextTest.due_date)} days <small>${esc(nextTest.title)}</small></div>` : '<div class="small muted">No test scheduled</div>'}<div class="go">Timeline</div></a>
      </section>
      <h2>This year's classes</h2>
      <div class="card">${thisYear.length ? thisYear.map((c) => `<div>${levelBadge(c)}${esc(c.title)} <span class="small muted">${esc(c.term)}</span></div>`).join('') : '<span class="small muted">Add this year\'s classes on the Courses tab.</span>'}</div>
    </div>`;
  }

  function viewCourses() {
    const g = nowGrade();
    const credits = Object.fromEntries(SUBJECTS.map((s) => [s, 0]));
    D.courses.filter(live).forEach((c) => { credits[c.subject] = (credits[c.subject] || 0) + Number(c.hs_credits || 0); });
    const aps = D.courses.filter((c) => isAP(c) && live(c)).length, des = D.courses.filter((c) => c.level === 'Dual enrollment' && live(c));
    return `<div class="stack">
      <div class="row between"><h1>Course plan</h1><span class="small muted">${aps} AP · ${des.length} dual enrollment · ${des.reduce((a, c) => a + Number(c.college_credits || 0), 0)} college credits</span></div>
      <p class="note">Tap a class to change it. Mark ideas as <b>Idea</b> until they're on the schedule; ideas don't count toward totals.</p>
      <div class="years">${[9, 10, 11, 12].map((gr) => {
        const list = D.courses.filter((c) => c.grade === gr).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
        return `<section class="year ${gr === g ? 'now' : ''}"><h3>${gr}th <small>${yearLabel(gr)}</small></h3>
          ${list.map((c) => `<button class="course ${c.status === 'Dropped' ? 'dropped' : ''}" data-edit="courses" data-id="${c.id}"><b>${levelBadge(c)}${c.status === 'Idea' ? '<span class="badge idea">Idea</span>' : ''}${esc(c.title)}</b><span>${esc(c.subject)} · ${esc(c.term)}${c.level === 'Dual enrollment' ? ' · ' + esc(c.provider) : ''}${c.final_grade ? ' · ' + esc(c.final_grade) : ''}${c.ap_score ? ' · AP ' + c.ap_score : ''}</span></button>`).join('')}
          <button class="addbtn" data-add="courses" data-grade="${gr}">+ Add class</button></section>`;
      }).join('')}</div>
      <h2>Graduation requirements</h2>
      <p class="note">Michigan Merit Curriculum credits planned across all four years. Confirm the exact rules with the school counselor.</p>
      <div class="grid2">${MMC.map(([s, n]) => meter(s, credits[s] || 0, n)).join('')}</div>
    </div>`;
  }

  function viewTimeline() {
    const g = nowGrade();
    const groups = [10, 11, 12].map((gr) => ({ gr, items: D.tasks.filter((x) => (x.grade || 0) === gr) })).concat([{ gr: 0, items: D.tasks.filter((x) => !x.grade) }]);
    return `<div class="stack">
      <div class="row between"><h1>Timeline</h1><button class="btn" data-add="tasks">Add item</button></div>
      ${groups.filter((x) => x.items.length || x.gr >= g).map(({ gr, items }) => `<section class="card"><h2>${gr ? `${gr}th grade <span class="small muted">${yearLabel(gr)}</span>` : 'Any time'}</h2>
        ${items.length ? items.map((x) => `<div class="task ${x.status === 'Done' ? 'done' : ''}">
          <button class="check ${x.status === 'Done' ? 'done' : ''}" data-toggle="${x.id}" aria-label="Mark ${esc(x.title)} ${x.status === 'Done' ? 'not done' : 'done'}"></button>
          <div><div class="t">${esc(x.title)}</div><div class="small muted">${esc(x.category)} · ${esc(x.owner)}${x.notes ? ' · ' + esc(x.notes) : ''}${safeUrl(x.source_url) ? ` · <a href="${esc(x.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</div></div>
          <div style="text-align:right"><div class="d">${fmtDate(x.due_date)}</div><button class="edit" data-edit="tasks" data-id="${x.id}">Edit</button></div></div>`).join('') : '<p class="small muted">Nothing here yet.</p>'}</section>`).join('')}
    </div>`;
  }

  function apRows(col) {
    const table = (col.facts && col.facts.ap_credit && col.facts.ap_credit.courses) || [];
    const mine = D.courses.filter((c) => isAP(c) && c.status !== 'Dropped');
    if (!mine.length) return '<p class="small muted">Add AP classes on the Courses tab to see what each would earn here.</p>';
    return `<div class="scroll"><table class="ap"><thead><tr><th>Amy's AP class</th><th>Score needed</th><th>Credit</th></tr></thead><tbody>${mine.map((c) => {
      const hit = table.find((r) => norm(r.course) === norm(c.title));
      return `<tr><td>${esc(c.title)}</td><td>${esc(hit ? hit.min_score : '—')}</td><td>${esc(hit ? hit.credit : 'Not listed; check the table')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function viewColleges() {
    return `<div class="stack"><h1>Colleges</h1>
      <p class="note">The same four Michigan schools as Lily, for now. Facts were checked on the date shown; confirm before relying on them.</p>
      ${D.colleges.sort((a, b) => a.sort - b.sort).map((c) => {
        const f = c.facts || {};
        const cw = f.coursework || {}, de = f.dual_enrollment || {}, te = f.testing || {}, ap = f.ap_credit || {};
        return `<article class="card stack" style="gap:10px">
          <div class="row between"><div><h2>${esc(c.name)}</h2><div class="small muted">${esc(c.program || '')}</div></div>
            <label class="small">Interest <select data-interest="${c.id}">${['Interested', 'Want to visit', 'Visited', 'Top choice', 'Not interested'].map((v) => `<option ${v === c.interest ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
          ${cw.summary || (cw.items || []).length ? `<div><div class="k">Recommended high school classes</div>${cw.summary ? `<p style="margin:4px 0">${esc(cw.summary)}</p>` : ''}${(cw.items || []).length ? `<ul style="margin:0;padding-left:18px">${cw.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</div>` : ''}
          ${f.rigor_note ? `<div><div class="k">On AP and dual enrollment</div><p style="margin:4px 0">${esc(f.rigor_note)}</p></div>` : ''}
          <div><div class="k">AP credit for Amy's AP classes</div>${apRows(c)}${safeUrl(ap.table_url) ? `<a class="small" href="${esc(ap.table_url)}" target="_blank" rel="noopener">Full AP credit table</a>` : ''}</div>
          ${de.summary ? `<div><div class="k">Dual enrollment credit</div><p style="margin:4px 0">${esc(de.summary)}</p>${de.transfer_status_risk ? `<div class="callout">${esc(de.transfer_status_risk)}</div>` : ''}${de.ross_note ? `<div class="callout" style="margin-top:8px">${esc(de.ross_note)}</div>` : ''}</div>` : ''}
          ${te.policy ? `<div><div class="k">Testing</div><p style="margin:4px 0">${esc(te.policy)}${te.middle50 ? ' ' + esc(te.middle50) : ''}</p></div>` : ''}
          ${(f.summer_programs || []).length ? `<div><div class="k">Summer programs for high schoolers</div><ul style="margin:0;padding-left:18px">${f.summer_programs.map((p) => `<li>${safeUrl(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}${p.grades ? ' · ' + esc(p.grades) : ''}${p.when_to_apply ? ' · apply ' + esc(p.when_to_apply) : ''}${p.cost ? ' · ' + esc(p.cost) : ''}</li>`).join('')}</ul></div>` : ''}
          <label class="small">Notes<textarea data-cnotes="${c.id}" placeholder="Visit thoughts, majors, questions">${esc(c.notes || '')}</textarea></label>
          ${f.checked_on ? `<div class="small muted">Facts checked ${esc(f.checked_on)}</div>` : ''}
        </article>`;
      }).join('') || '<p class="muted">No colleges yet.</p>'}</div>`;
  }

  function viewActivities() {
    const kinds = ['Activity', 'Sport', 'Volunteer', 'Job', 'Summer program', 'Honor'];
    return `<div class="stack">
      <div class="row between"><h1>Activities</h1><button class="btn" data-add="activities">Add activity</button></div>
      <p class="note">This becomes the activities list on college applications. Descriptions have a 150-character limit, the same as the Common App.</p>
      ${kinds.map((k) => { const list = D.activities.filter((a) => a.kind === k); return list.length ? `<section class="card"><h2>${k === 'Activity' ? 'Clubs and activities' : k + 's'}</h2>${list.map((a) => `<div class="task" style="grid-template-columns:1fr auto"><div><div class="t">${esc(a.name)}${a.role ? ' · ' + esc(a.role) : ''}</div><div class="small muted">${[a.grades ? 'Grades ' + a.grades : '', a.hours_week ? a.hours_week + ' hrs/week' : '', a.weeks_year ? a.weeks_year + ' weeks/yr' : ''].filter(Boolean).join(' · ')}${a.description ? '<br>' + esc(a.description) : ''}</div></div><button class="edit" data-edit="activities" data-id="${a.id}">Edit</button></div>`).join('')}</section>` : ''; }).join('')}
      <div class="row between"><h2>Test scores</h2><button class="btn ghost" data-add="tests">Add score</button></div>
      <section class="card">${D.tests.length ? D.tests.map((x) => `<div class="task" style="grid-template-columns:1fr auto"><div><div class="t">${esc(x.test)}${x.total ? ' · ' + x.total : ''}</div><div class="small muted">${fmtDate(x.taken_on)}${x.parts ? ' · ' + esc(x.parts) : ''}${x.notes ? ' · ' + esc(x.notes) : ''}</div></div><button class="edit" data-edit="tests" data-id="${x.id}">Edit</button></div>`).join('') : '<p class="small muted">No scores yet. PSAT 10 is in the spring of 10th grade.</p>'}</section>
    </div>`;
  }

  /* ---------- forms ---------- */
  const FORMS = {
    courses: { title: 'Class', fields: [['title', 'Class name', 'text', true], ['grade', 'Grade', [9, 10, 11, 12]], ['term', 'Term', ['Year', 'Fall', 'Spring', 'Summer']], ['subject', 'Subject', SUBJECTS], ['level', 'Level', LEVELS], ['provider', 'Taught by', 'text'], ['hs_credits', 'High school credits', 'number'], ['college_credits', 'College credits (dual enrollment)', 'number'], ['status', 'Status', ['Idea', 'Planned', 'Enrolled', 'Done', 'Dropped']], ['final_grade', 'Final grade', 'text'], ['ap_score', 'AP exam score (1-5)', 'number'], ['notes', 'Notes', 'textarea']] },
    tasks: { title: 'Timeline item', fields: [['title', 'What', 'text', true], ['grade', 'Grade', ['', 10, 11, 12]], ['due_date', 'Date', 'date'], ['category', 'Category', ['Classes', 'Testing', 'Dual enrollment', 'Activities', 'Summer', 'College research', 'Scholarships', 'Other']], ['owner', 'Who', ['Amy', 'Parent', 'Both']], ['status', 'Status', ['Not started', 'In progress', 'Done', 'Not needed']], ['source_url', 'Link', 'url'], ['notes', 'Notes', 'textarea']] },
    activities: { title: 'Activity', fields: [['name', 'Name', 'text', true], ['kind', 'Type', ['Activity', 'Sport', 'Volunteer', 'Job', 'Summer program', 'Honor']], ['role', 'Role or position', 'text'], ['grades', 'Grades (e.g. 9,10,11)', 'text'], ['hours_week', 'Hours per week', 'number'], ['weeks_year', 'Weeks per year', 'number'], ['description', 'Description (150 characters)', 'textarea', false, 150]] },
    tests: { title: 'Test score', fields: [['test', 'Test', ['PSAT 8/9', 'PSAT 10', 'PSAT/NMSQT', 'SAT', 'ACT', 'AP exam', 'ACCUPLACER', 'Other']], ['taken_on', 'Date', 'date'], ['total', 'Total score', 'number'], ['parts', 'Section scores', 'text'], ['notes', 'Notes', 'textarea']] },
  };
  function openForm(kind, row) {
    const F = FORMS[kind]; const isNew = !row.id;
    sheet.innerHTML = `<form class="f" id="ff"><h2>${isNew ? 'Add' : 'Edit'} ${F.title.toLowerCase()}</h2>
      ${F.fields.map(([k, l, t, req, max]) => {
        const v = row[k] ?? '';
        if (Array.isArray(t)) return `<label>${l}<select name="${k}">${t.map((o) => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(o === '' ? 'Any time' : o)}</option>`).join('')}</select></label>`;
        if (t === 'textarea') return `<label>${l}<textarea name="${k}" ${max ? `maxlength="${max}"` : ''}>${esc(v)}</textarea></label>`;
        return `<label>${l}<input name="${k}" type="${t}" value="${esc(v)}" ${req ? 'required' : ''} ${t === 'number' ? 'step="any"' : ''}></label>`;
      }).join('')}
      <div class="row between"><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" id="cancel">Cancel</button></div>
        ${isNew ? '' : '<button type="button" class="linkbtn danger" id="del">Delete</button>'}</div></form>`;
    sheet.showModal();
    sheet.querySelector('#cancel').onclick = () => sheet.close();
    const del = sheet.querySelector('#del');
    if (del) del.onclick = async () => { if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Tap again to delete'; return; } if (await remove(kind, row.id)) { sheet.close(); render(); toast('Deleted'); } };
    sheet.querySelector('#ff').onsubmit = async (e) => {
      e.preventDefault();
      const out = { ...row }; const fd = new FormData(e.target);
      F.fields.forEach(([k, , t]) => { let v = fd.get(k); if (v === '' || v === null) v = null; else if (t === 'number' || k === 'grade') v = Number(v); out[k] = v; });
      if (kind === 'courses') { out.hs_credits = out.hs_credits ?? 1; out.college_credits = out.college_credits ?? 0; out.provider = out.provider || 'Manistique High School'; }
      if (await save(kind, out)) { sheet.close(); render(); toast('Saved'); }
    };
  }

  /* ---------- routing ---------- */
  const VIEWS = { '#/': viewHome, '#/courses': viewCourses, '#/timeline': viewTimeline, '#/colleges': viewColleges, '#/activities': viewActivities };
  function render() {
    const h = VIEWS[location.hash] ? location.hash : '#/';
    document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === h));
    app.innerHTML = VIEWS[h]();
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add) { const d = { courses: { grade: Number(b.dataset.grade) || nowGrade(), term: 'Year', subject: 'Elective', level: 'Regular', status: 'Planned', hs_credits: 1, college_credits: 0, provider: 'Manistique High School' }, tasks: { grade: nowGrade(), category: 'Other', owner: 'Amy', status: 'Not started' }, activities: { kind: 'Activity' }, tests: { test: 'PSAT 10' } }[b.dataset.add]; openForm(b.dataset.add, d); }
    else if (b.dataset.edit) openForm(b.dataset.edit, D[b.dataset.edit].find((x) => x.id === b.dataset.id));
    else if (b.dataset.toggle) { const x = D.tasks.find((t) => t.id === b.dataset.toggle); if (await save('tasks', { ...x, status: x.status === 'Done' ? 'Not started' : 'Done' })) render(); }
  });
  document.addEventListener('change', async (e) => {
    const s = e.target;
    if (s.dataset.interest) { const c = D.colleges.find((x) => x.id === s.dataset.interest); if (await save('colleges', { id: c.id, interest: s.value })) toast('Saved'); }
    if (s.dataset.cnotes) { const c = D.colleges.find((x) => x.id === s.dataset.cnotes); if (await save('colleges', { id: c.id, notes: s.value })) toast('Notes saved'); }
  });

  /* ---------- start ---------- */
  (async () => {
    if (!window.supabase || !CFG.SUPABASE_URL) { app.innerHTML = '<p class="pad">Setup needed.</p>'; return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { app.innerHTML = '<div class="signin"><h1>Amy\'s College Plan</h1><p>Sign in on the family page first.</p><a class="btn" href="/" style="text-align:center;text-decoration:none">Go to the family page</a></div>'; return; }
    try { await loadAll(); } catch (err) { app.innerHTML = `<div class="signin"><h1>Almost there</h1><p>Amy's plan couldn't load. If you're new, ask Kevin to add you to the family list.</p><p class="small muted">${esc(err.message || err)}</p></div>`; return; }
    render();
  })();
})();
