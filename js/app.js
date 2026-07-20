/* =====================================================================
   PROJECT 75 — app.js
   Views, routing, sheets, and every interaction.
   Depends on: store.js, charts.js, food.js
   ===================================================================== */
(function (global) {
  'use strict';

  const S = global.P75.Store, Dates = global.P75.Dates, M = global.P75.Metrics,
        Charts = global.P75.Charts, Media = global.P75.Media, Food = global.P75.Food,
        Ach = global.P75.Achievements, Data = global.P75.Data;

  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ensure(o, k, def) { if (o[k] === undefined) o[k] = def; return o[k]; }
  function money(n) { return (n == null || n === '') ? '—' : '₦' + Number(n).toLocaleString(); }
  function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
  function splitLines(s) { return (s || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function pick(arr, seed) { return arr[Math.abs(seed || 0) % arr.length]; }

  const RETURN_LINES = [
    'Welcome home. Nothing is lost. Today still counts.',
    'You’re back. That’s the whole thing. Continue.',
    'No catching up needed. One intentional decision still counts.',
    'Welcome home. Let’s keep the promise, softly.'
  ];
  const SOFT_LINES = ['Progress still counts.', 'Keep going.', 'Tomorrow still counts.', 'One intentional decision still counts.', 'Continue.'];

  const App = { route: 'today', seg: {}, rec: null };

  /* ============================ Toasts & sheets ============================ */
  function toast(msg) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function closeSheet() { const o = $('#sheet-overlay'); if (o) { o.classList.remove('open'); setTimeout(function () { o.remove(); }, 240); } }

  function openSheet(cfg) {
    closeSheet();
    const overlay = document.createElement('div'); overlay.id = 'sheet-overlay'; overlay.className = 'sheet-overlay';
    const fieldsHTML = (cfg.fields || []).map(function (f) {
      const val = f.value == null ? '' : f.value;
      if (f.type === 'textarea') return `<label class="fld"><span>${esc(f.label)}</span><textarea name="${f.name}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea></label>`;
      if (f.type === 'select') return `<label class="fld"><span>${esc(f.label)}</span><select name="${f.name}">${(f.options || []).map(function (o) { const v = o.value != null ? o.value : o, t = o.label != null ? o.label : o; return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select></label>`;
      return `<label class="fld"><span>${esc(f.label)}</span><input name="${f.name}" type="${f.type || 'text'}" ${f.step ? 'step="' + f.step + '"' : ''} ${f.min != null ? 'min="' + f.min + '"' : ''} ${f.max != null ? 'max="' + f.max + '"' : ''} placeholder="${esc(f.placeholder || '')}" value="${esc(val)}"></label>`;
    }).join('');
    overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>
      <div class="sheet-head"><h3>${esc(cfg.title || '')}</h3>${cfg.subtitle ? `<p>${esc(cfg.subtitle)}</p>` : ''}</div>
      <form id="sheet-form" class="sheet-body">${cfg.bodyHTML || ''}${fieldsHTML}
        <div class="sheet-actions"><button type="button" class="btn ghost" data-act="sheet-cancel">Not now</button>
        <button type="submit" class="btn primary">${esc(cfg.submitLabel || 'Save')}</button></div></form></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('open'); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSheet(); });
    $('#sheet-form', overlay).addEventListener('submit', function (e) {
      e.preventDefault(); const values = {};
      $$('input,textarea,select', overlay).forEach(function (el) { if (el.name) values[el.name] = el.value.trim(); });
      if (cfg.onSubmit) cfg.onSubmit(values, overlay);
    });
    if (cfg.afterOpen) cfg.afterOpen(overlay);
    return overlay;
  }
  function quickAdd(title, label, apply) {
    openSheet({ title: title, fields: [{ name: 'text', label: label, type: 'textarea', rows: 3 }], submitLabel: 'Add',
      onSubmit: function (v) { if (v.text) S.mutate(function () { apply(v.text); }); closeSheet(); render(); } });
  }
  function confirmSheet(title, subtitle, okLabel, onOk, danger) {
    openSheet({ title: title, subtitle: subtitle, submitLabel: okLabel || 'Yes', onSubmit: function () { closeSheet(); onOk(); } });
    if (danger) { const b = $('#sheet-form .btn.primary'); if (b) b.classList.add('danger'); }
  }

  /* ============================ Primitives ============================ */
  function card(inner, cls) { return `<section class="card ${cls || ''}">${inner}</section>`; }
  function tile(label, value, sub, cls) { return `<div class="tile ${cls || ''}"><div class="tile-val">${value}</div><div class="tile-label">${esc(label)}</div>${sub ? `<div class="tile-sub">${esc(sub)}</div>` : ''}</div>`; }
  function sectionTitle(t, action) { return `<div class="sec-title"><h2>${esc(t)}</h2>${action || ''}</div>`; }
  function addBtn(act, extra) { return `<button class="add-btn" data-act="${act}" ${extra || ''}>＋</button>`; }
  function listEmpty(msg) { return `<div class="empty">${esc(msg)}</div>`; }
  function listBlock(title, addAct, items, renderItem, emptyMsg) {
    return card(`${sectionTitle(title, addBtn(addAct))}${items.length ? `<div class="rows">` + items.map(renderItem).join('') + `</div>` : listEmpty(emptyMsg)}`);
  }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.'; }

  function renderHeader() {
    $('#appbar').innerHTML = `<div class="brand"><div class="brand-mark">75</div>
      <div class="brand-text"><b>Project 75</b><span>Returning to Her</span></div></div>
      <button class="icon-btn" data-act="go-settings" aria-label="Settings">⚙︎</button>`;
  }

  /* ============================ People helpers ============================ */
  function daysUntilBirthday(b) {
    if (!b) return null;
    const parts = b.split('-').map(Number); let mo, da;
    if (parts.length === 3) { mo = parts[1]; da = parts[2]; } else { mo = parts[0]; da = parts[1]; }
    if (!mo || !da) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), mo - 1, da);
    if (next < today) next = new Date(today.getFullYear() + 1, mo - 1, da);
    return Math.round((next - today) / 86400000);
  }
  function reachOutNudge() {
    const people = S.get().people || []; if (!people.length) return '';
    let bday = null, bmin = 999;
    people.forEach(function (p) { const dd = daysUntilBirthday(p.birthday); if (dd != null && dd <= 21 && dd < bmin) { bmin = dd; bday = p; } });
    if (bday) return card(`<div class="nudge"><span class="nudge-ico">🎂</span>
      <div class="nudge-copy"><b>${esc(bday.name)}’s birthday is ${bmin === 0 ? 'today' : 'in ' + bmin + ' days'}.</b><span>Plan something small and thoughtful.</span></div></div>`, 'nudge-card');
    let od = null, omax = 0;
    people.forEach(function (p) { const since = p.lastContacted ? Dates.diffDays(p.lastContacted, Dates.today()) : 999; const over = since - (p.cadence || 7); if (over > 0 && since > omax) { omax = since; od = p; } });
    if (od) return card(`<div class="nudge"><span class="nudge-ico">📞</span>
      <div class="nudge-copy"><b>Have you called or texted ${esc(od.name)} recently?</b><span>${od.lastContacted ? 'It’s been ' + omax + ' days.' : 'You haven’t logged reaching out yet.'} A short message counts.</span></div>
      <button class="btn ghost small" data-act="reached" data-id="${od.id}">Done</button></div>`, 'nudge-card');
    return '';
  }

  /* ============================ Constants ============================ */
  const AGREEMENT = ['No soda.', 'No office snacks.', 'Protein first.', '2 litres of water.', 'Follow today’s meal plan.', 'Continue.'];
  const DAILY = [
    { key: 'diet', label: 'Followed my diet' }, { key: 'noSnacks', label: 'No office snacks' },
    { key: 'noSoda', label: 'No soda' }, { key: 'water', label: 'Drank 2L of water' },
    { key: 'fruit', label: 'Had my fruit' }, { key: 'protein', label: 'Had my protein' },
    { key: 'walked', label: 'Walked today' }, { key: 'weighed', label: 'Weighed myself' },
    { key: 'slept', label: 'Slept 7 hours' }
  ];
  const SOUL = [{ key: 'create', label: 'Created something' }, { key: 'peace', label: 'Protected my peace' }, { key: 'cont', label: 'Continued' }];
  const BOOK_STAGES = ['Idea', 'Outlining', 'Drafting', 'Editing', 'Published'];
  function stageClass(s) { return { Idea: 'idea', Outlining: 'outline', Drafting: 'draft', Editing: 'edit', Published: 'pub' }[s] || 'idea'; }

  /* Tap-to-pick suggestions (so she rarely has to type) */
  const SUGGEST = {
    standards: ['Emotionally available', 'Consistent, not confusing', 'Shares my values', 'Financially responsible', 'Kind to everyone', 'Ambitious & driven', 'Communicates honestly', 'Adds peace, not stress', 'Makes me feel safe', 'Respects my time', 'Wants the same future', 'Spiritually aligned'],
    green: ['Follows through', 'Curious about my world', 'Calm in conflict', 'Reliable', 'Respects my boundaries', 'Consistent effort', 'Emotionally mature', 'A good listener', 'Makes me laugh', 'Encourages my goals'],
    red: ['Hot and cold', 'Dishonest', 'Disrespectful', 'Avoids commitment', 'Makes me anxious', 'Poor communicator', 'Selfish', 'No ambition', 'Dismisses my feelings', 'Love-bombs then pulls away'],
    nn: ['No soda', 'No office snacks', 'Protein first', '2 litres of water', 'No late-night eating', 'No fried food', 'Follow today’s plan', 'Weigh weekly only', 'No eating when stressed'],
    boundaries: ['Protect my evenings', 'No work after 7pm', 'Say no without guilt', 'Limit draining people', 'Phone away at dinner', 'No lending money I need', 'Rest without apologising', 'Reply when I have capacity'],
    gratitude: ['My health', 'My home', 'My work', 'A good friend', 'My family', 'God', 'A small win today', 'My body', 'Rest', 'This quiet moment'],
    focus: ['Lose 3kg', 'Save ₦500,000', 'Publish 4 videos', 'Write 20 pages', 'Finish a book chapter', 'Read 2 books', 'Go on 1 intentional date', 'No soda all month', 'Walk 4× a week', 'Meal-prep every Sunday'],
    offplan: ['Chocolate', 'Cake', 'Office snacks', 'Soda', 'Biscuits', 'Ice cream', 'Fried food', 'Pizza', 'Chips', 'Bread', 'Sweets', 'Meat pie'],
    checks: ['Respects women', 'Wants kids', 'Wants marriage', 'Emotionally available', 'Financially responsible', 'Shares my faith', 'Ambitious / driven', 'Kind to family & staff', 'Communicates honestly', 'Makes time for me', 'No deal-breakers', 'Similar values', 'Wants the same number of kids', 'Health-conscious', 'Emotionally mature']
  };

  /* Rough calorie estimates for off-plan foods (per typical serving) */
  const OFFPLAN_CAL = { chocolate: 250, cake: 350, 'office snacks': 200, snacks: 150, soda: 140, biscuits: 140, biscuit: 70, cookie: 120, 'ice cream': 250, 'fried food': 300, fried: 300, pizza: 285, chips: 150, bread: 160, sweets: 60, 'meat pie': 300, juice: 120, burger: 400, fries: 350, donut: 250, doughnut: 250, shawarma: 500, popcorn: 150, 'puff puff': 250, gala: 180 };
  function calFor(item) { const q = (item || '').toLowerCase(); let best = null; Object.keys(OFFPLAN_CAL).forEach(function (k) { if (q.indexOf(k) !== -1) best = OFFPLAN_CAL[k]; }); return best || 200; }
  function caloriesToday() {
    const st = S.get(), t = Dates.today(), m = (st.meals || {})[t] || {}, cal = st.diet.cal || { breakfast: 285, lunch: 240, dinner: 250 };
    let total = 0;
    if (m.breakfast) total += cal.breakfast || 0;
    if (m.lunch) total += cal.lunch || 0;
    if (m.dinner) total += cal.dinner || 0;
    st.foodLog.forEach(function (f) { if (f.date === t && f.cal) total += f.cal; });
    return total;
  }
  function plannedCal() { const c = S.get().diet.cal || { breakfast: 285, lunch: 240, dinner: 250 }; return (c.breakfast || 0) + (c.lunch || 0) + (c.dinner || 0); }
  function graceSheet() {
    openSheet({ title: 'Noted — no shame.', subtitle: 'Honesty is the whole practice.', bodyHTML: `<div class="wait-water"><div class="wait-emoji">🤍</div><p>One meal is not the story. You didn’t fail — you noticed, and you told the truth. Your next choice is a clean slate. Drink some water, and continue.</p></div>`, submitLabel: 'Continue', onSubmit: closeSheet });
  }
  /* Accurate off-plan logging: asks quantity, lets her edit the calories. */
  function logOffPlanSheet(prefillItem) {
    const chips = SUGGEST.offplan.map(function (s) { return `<button type="button" class="pick-chip" data-food="${esc(s)}">${esc(s)}</button>`; }).join('');
    const ov = openSheet({
      title: 'Note what you ate', subtitle: 'No judgement — let’s just be accurate.',
      bodyHTML: `<div class="pick-wrap">${chips}</div>
        <label class="fld"><span>Food</span><input name="item" id="op-item" value="${esc(prefillItem || '')}" placeholder="e.g. cake"></label>
        <label class="fld"><span>How many servings?</span><input name="qty" id="op-qty" type="number" step="0.5" min="0" value="1"></label>
        <label class="fld"><span>Calories — edit if you know better</span><input name="cal" id="op-cal" type="number" min="0" placeholder="tap a food or type"></label>
        <p class="muted small">The number is only a rough guess per serving. Change it to whatever’s realistic — you know best.</p>`,
      submitLabel: 'Log it',
      onSubmit: function (v) {
        const item = (v.item || '').trim(); if (!item) { toast('What did you have?'); return; }
        const qty = num(v.qty) || 1, cal = num(v.cal);
        S.mutate(function () { S.get().foodLog.push({ id: S.uid(), date: Dates.today(), item: (qty !== 1 ? (qty + '× ') : '') + item, verdict: 'no', cal: cal != null ? cal : Math.round(calFor(item) * qty) }); });
        closeSheet(); render(); graceSheet();
      }
    });
    const itemEl = $('#op-item', ov), qtyEl = $('#op-qty', ov), calEl = $('#op-cal', ov);
    let calEdited = false;
    calEl.addEventListener('input', function () { calEdited = true; });
    function suggest() { if (calEdited) return; const t = (itemEl.value || '').trim(); if (!t) { calEl.value = ''; return; } const q = parseFloat(qtyEl.value) || 1; calEl.value = Math.round(calFor(t) * q); }
    $$('.pick-chip', ov).forEach(function (b) { b.addEventListener('click', function () { itemEl.value = b.getAttribute('data-food'); calEdited = false; suggest(); }); });
    itemEl.addEventListener('input', suggest);
    qtyEl.addEventListener('input', suggest);
    if (prefillItem) suggest();
  }

  /* Daily reminder schedule (fires while the app is open/installed) */
  const REMINDERS = [
    { id: 'eggs_am', time: '07:00', title: 'Buy today’s eggs & fruit 🥚🍎', body: 'Don’t forget your eggs, an apple and a pear for today. Drink some water too.' },
    { id: 'soda_am', time: '08:00', title: 'No soda today ☕', body: 'Water or tea on your desk — not a can. You already decided.' },
    { id: 'water_am', time: '10:00', title: 'Water break 💧', body: 'Drink a full glass now.' },
    { id: 'noon', time: '12:00', title: 'Midday check 🍎', body: 'Have your fruit and protein. No office snacks.' },
    { id: 'lunch', time: '13:00', title: 'Lunch, intentionally 🥗', body: 'Protein first. Did you bring yours?' },
    { id: 'snack_pm', time: '15:00', title: 'Snack o’clock — no thank you 🚫', body: 'Someone’s offering snacks. Water instead. 💧' },
    { id: 'done_pm', time: '17:00', title: 'Well done 🤍', body: 'You held the line today. Go home, rest, continue.' }
  ];

  const AFFIRMATIONS = [
    'You are becoming her, softly.', 'Consistency over perfection.', 'One intentional decision still counts.',
    'A beautiful life is also a goal.', 'You don’t negotiate with yourself today.', 'Protein first. Water beside you. Continue.',
    'Missing one day never becomes missing one year.', 'Welcome home. Today still counts.'
  ];
  function dailyAffirmation() {
    const d = new Date(); const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    return AFFIRMATIONS[doy % AFFIRMATIONS.length];
  }

  /* Reusable suggestion picker — tap chips to add, or type your own. */
  function openPicker(cfg) {
    const chips = (cfg.suggestions || []).map(function (s) { return `<button type="button" class="pick-chip" data-pick="${esc(s)}">＋ ${esc(s)}</button>`; }).join('');
    const ov = openSheet({
      title: cfg.title, subtitle: cfg.subtitle || 'Tap to add. Add as many as you like.',
      bodyHTML: `<div class="pick-wrap">${chips}</div><div class="pick-custom"><input type="text" id="pick-input" placeholder="Or write your own…"><button type="button" class="btn ghost small" id="pick-add">Add</button></div>`,
      submitLabel: cfg.doneLabel || 'Done', onSubmit: function () { if (cfg.onDone) { render(); cfg.onDone(); } else { closeSheet(); render(); } }
    });
    const wrap = $('.pick-wrap', ov);
    wrap.addEventListener('click', function (e) { const b = e.target.closest('[data-pick]'); if (!b || b.disabled) return; cfg.onAdd(b.getAttribute('data-pick')); b.classList.add('added'); b.textContent = '✓ ' + b.getAttribute('data-pick'); b.disabled = true; });
    const inp = $('#pick-input', ov);
    function addCustom() { const t = (inp.value || '').trim(); if (!t) return; cfg.onAdd(t); inp.value = ''; const chip = document.createElement('span'); chip.className = 'pick-chip added'; chip.textContent = '✓ ' + t; wrap.appendChild(chip); }
    $('#pick-add', ov).addEventListener('click', addCustom);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
  }

  /* A garden that grows with every promise-day and never dies. */
  const GARDEN_STAGES = [
    { min: 0, emoji: '🌱', name: 'A seed', msg: 'Every promise you keep is water. Begin.' },
    { min: 3, emoji: '🌿', name: 'A sprout', msg: 'Something is growing. Keep going.' },
    { min: 7, emoji: '🌷', name: 'A bud', msg: 'Almost blooming. She’s in there.' },
    { min: 14, emoji: '🌸', name: 'In bloom', msg: 'Look at you — blossoming.' },
    { min: 30, emoji: '💐', name: 'A bouquet', msg: 'A month of showing up. Beautiful.' },
    { min: 60, emoji: '🌺', name: 'A garden', msg: 'You built a whole garden, softly.' },
    { min: 120, emoji: '🏡', name: 'A blooming home', msg: 'This is her life now.' }
  ];
  function gardenCard() {
    const count = M.keptDaysTotal();
    let cur = GARDEN_STAGES[0], nextS = null;
    for (let i = 0; i < GARDEN_STAGES.length; i++) { if (count >= GARDEN_STAGES[i].min) { cur = GARDEN_STAGES[i]; nextS = GARDEN_STAGES[i + 1] || null; } }
    const pct = nextS ? Math.round(((count - cur.min) / (nextS.min - cur.min)) * 100) : 100;
    const remain = nextS ? (nextS.min - count) : 0;
    return card(`<div class="garden">
      <div class="garden-plant">${cur.emoji}</div>
      <div class="garden-name">${cur.name}</div>
      ${nextS ? `<div class="garden-bar"><div class="garden-fill" style="width:${pct}%"></div></div><div class="garden-next">${remain} more promise-day${remain === 1 ? '' : 's'} to ${nextS.name.toLowerCase()}</div>` : `<div class="garden-next">Fully grown, and still growing with you. 🤍</div>`}
      <div class="garden-msg">${esc(cur.msg)}</div>
      <div class="garden-foot">It grows each day you keep a promise. It never dies — it just waits for you.</div>
    </div>`, 'garden-card');
  }
  function applyHomeBg() {
    const st = S.get(); if (!st.settings.bgMediaId) return;
    const el = $('.agreement-card'); if (!el) return;
    Media.url(st.settings.bgMediaId).then(function (u) { if (u) { el.classList.add('has-bg'); el.style.backgroundImage = `linear-gradient(180deg, rgba(35,22,28,0.30), rgba(35,22,28,0.62)), url(${u})`; } });
  }

  /* ============================ Diet ============================ */
  function dietCard() {
    const d = S.get().diet;
    const m = (S.get().meals || {})[Dates.today()] || {};
    const sec = function (t, items) { return `<div class="diet-sec"><h4>${esc(t)}</h4><ul>${(items || []).map(function (i) { return `<li>${esc(i)}</li>`; }).join('')}</ul></div>`; };
    const meal = function (k, label) { return `<button class="meal ${m[k] ? 'on' : ''}" data-act="meal" data-m="${k}"><span>${m[k] ? '✓' : ''}</span>${label}</button>`; };
    return card(`${sectionTitle('Today’s diet', `<button class="add-btn" data-act="edit-diet">✎</button>`)}
      <div class="grocery ${m.groceries ? 'done' : ''}"><span>🥚🍎</span><div><b>Today you need</b>eggs, an apple &amp; a pear</div><button class="btn ghost small" data-act="grocery">${m.groceries ? 'Got them ✓' : 'Mark bought'}</button></div>
      <div class="meal-ticks">${meal('breakfast', 'Breakfast')}${meal('lunch', 'Lunch')}${meal('dinner', 'Dinner')}</div>
      <div class="cal-line"><div><span class="cal-label">Calories today</span><b class="cal-val">~${caloriesToday()} kcal</b></div><i>plan ≈ ${plannedCal()} kcal · a gentle estimate, not a rule</i></div>
      <div class="diet-grid">${sec('Breakfast', d.breakfast)}${sec('Lunch', d.lunch)}${sec('Dinner — choose one', d.dinner)}${sec('Unlimited', d.unlimited)}</div>
      <p class="muted small">Repetition is the strategy. Fewer decisions, fewer chances to negotiate.</p>`, 'diet-card');
  }

  /* ============================ Office Mode ============================ */
  function officeCheckpoint(hour) {
    if (hour < 10) return { time: '8:00 AM', msg: 'Remember: <b>no soda.</b> Water is on your desk, not in a can.' };
    if (hour < 13) return { time: '10:00 AM', msg: 'Drink water now — a full glass, before the emails.', actions: `<div class="office-actions"><button class="chip-btn strong" data-act="water-plus">＋ a glass</button></div>` };
    if (hour < 15) {
      const ans = (S.get().office[Dates.today()] || {}).lunch;
      if (!ans) return { time: '1:00 PM', msg: 'Did you bring lunch?', actions: `<div class="office-actions"><button class="btn ghost small" data-act="office-lunch" data-v="yes">Yes</button><button class="btn ghost small" data-act="office-lunch" data-v="no">No</button></div>` };
      return { time: '1:00 PM', msg: ans === 'yes' ? 'Good. You planned ahead — eat it slowly, protein first.' : 'Then choose the most protein-first thing available. No snacks to fill the gap.' };
    }
    if (hour < 17) return { time: '3:00 PM', msg: 'Someone is probably offering you snacks right now.<br><b>No, thank you.</b>', actions: `<div class="office-actions"><button class="btn primary small" data-act="office-nothanks">I said no thank you 🤍</button></div>` };
    return { time: '5:00 PM', msg: 'Well done. You held the line all day.<br>Go home. Rest. Continue.' };
  }
  function officeCard() {
    const d = new Date(), day = d.getDay(), hour = d.getHours();
    if (day < 1 || day > 5 || hour < 8 || hour >= 18) return '';
    const cp = officeCheckpoint(hour);
    return card(`<div class="office-mode"><div class="office-top"><span class="office-clock">${cp.time}</span><span class="office-badge">Office Mode</span></div>
      <div class="office-msg">${cp.msg}</div>${cp.actions || ''}
      <button class="office-link" data-act="go-office">See today’s full office plan →</button></div>`, 'office-card');
  }
  const OFFICE_PLAN = [
    { t: '8:00 AM', m: 'Remember: <b>No soda.</b>' }, { t: '10:00 AM', m: 'Drink water.' },
    { t: '1:00 PM', m: 'Did you bring lunch?' }, { t: '3:00 PM', m: 'Someone is offering you snacks right now. <b>No, thank you.</b>' },
    { t: '5:00 PM', m: 'Well done. Go home.' }
  ];
  function viewOffice() {
    const nowH = new Date().getHours();
    const cur = officeCheckpoint(Math.min(17, Math.max(8, nowH)));
    return `<div class="view"><header class="page-head"><h1>Office Mode</h1><p>Monday to Friday, 8–5. Where it’s hardest — so I’m strictest here.</p></header>
      ${card(`<div class="office-mode"><div class="office-top"><span class="office-badge">Right now</span></div>
        <div class="office-clock big">${cur.time}</div><div class="office-msg">${cur.msg}</div>${cur.actions || ''}</div>`, 'office-card')}
      ${card(`${sectionTitle('Today’s checkpoints')}<div class="office-timeline">${OFFICE_PLAN.map(function (c) { return `<div class="ot-row"><div class="ot-time">${c.t}</div><div class="ot-msg">${c.m}</div></div>`; }).join('')}</div>`)}
      ${card(`<div class="quote-block">Between 8 and 5, you don’t negotiate. You already decided. Continue.</div>`, 'quote')}</div>`;
  }

  /* ============================ VIEW: TODAY ============================ */
  function viewToday() {
    const st = S.get(), today = Dates.today(), p = st.promises[today] || {};
    const kept = M.dayScore(today), total = M.promiseTotal(), score = M.promiseScore(30), streak = M.streak();
    const cups = st.water[today] || 0;
    const gap = Dates.diffDays(st.settings.lastOpen, today), returning = gap >= 2;
    const reached = M.goalReached(), month = M.monthly(), focus = month.focus || [];

    const trackRow = function (item, extra) {
      const on = !!p[item.key];
      return `<div class="track-row ${on ? 'done' : ''}"><button class="track-main" data-act="toggle-promise" data-key="${item.key}">
        <span class="check">${on ? '✓' : ''}</span><span class="track-label">${esc(item.label)}</span></button>${extra || ''}</div>`;
    };
    const waterExtra = `<span class="cups"><button class="chip-btn" data-act="water-minus">－</button><b>${cups}/8</b><button class="chip-btn strong" data-act="water-plus">＋</button></span>`;
    const dailyRows = DAILY.map(function (i) { return trackRow(i, i.key === 'water' ? waterExtra : ''); }).join('');
    const soulRows = SOUL.map(function (i) { return trackRow(i); }).join('');

    const ringHTML = Charts.ring({ percent: Math.round((kept / total) * 100), size: 148, stroke: 13, gradient: ['#F3B7C6', '#E38AA0'], label: `<b>${kept}<span>/${total}</span></b>`, sub: 'promises kept' });

    return `<div class="view today">
      ${card(`<div class="agreement"><h1 class="agree-hi">${esc(greeting())}</h1><p class="agree-welcome">Welcome home.</p>
        ${returning ? `<div class="return-banner">${esc(pick(RETURN_LINES, gap))}</div>` : ''}
        <div class="agree-label">Your agreement today</div>
        <ul class="agree-list">${AGREEMENT.map(function (a) { return `<li>${esc(a)}</li>`; }).join('')}</ul>
        <div class="agree-seal">You do not have permission to quit today.</div></div>`, 'agreement-card')}

      <p class="affirmation">${esc(dailyAffirmation())}</p>

      ${(function () { const ph = cyclePhase(); return ph && ph.pms ? card(`<div class="nudge"><span class="nudge-ico">🌸</span><div class="nudge-copy"><b>Be extra gentle today.</b><span>You’re in your luteal phase — cravings and a heavier scale are hormonal, not failure.</span></div></div>`, 'nudge-card') : ''; })()}

      ${reached ? card(`<div class="forever-mini"><div class="forever-badge">✦</div>
        <div class="forever-copy"><b>You made it to her.</b><span>Project 75 is now Project Forever.</span></div>
        <button class="btn ghost small" data-act="go-forever">What next →</button></div>`, 'forever-mini-card') : ''}

      ${reachOutNudge()}

      ${dateNudge()}

      ${card(`<div class="today-top">${ringHTML}<div class="today-stats">
        ${tile('Promise Score', score + '%', 'last 30 days')}${tile('Streak', streak + (streak === 1 ? ' day' : ' days'), 'gently counted')}</div></div>`, 'today-hero')}

      ${gardenCard()}

      ${card(`${sectionTitle('Daily tracker')}<div class="track-list">${dailyRows}</div>
        <div class="track-divider">And for her heart</div><div class="track-list">${soulRows}</div>
        <p class="enough">Keep at least one promise. That is enough.</p>`)}

      ${dietCard()}

      ${card(`<div class="sec-title"><h2>This month · only three</h2><button class="add-btn" data-act="go-month">›</button></div>
        ${focus.length ? `<div class="focus-list">` + focus.map(function (f, i) { return `<button class="focus-row ${f.done ? 'done' : ''}" data-act="toggle-focus" data-id="${f.id}"><span class="focus-num">${i + 1}</span><span class="focus-text">${esc(f.title)}</span><span class="check">${f.done ? '✓' : ''}</span></button>`; }).join('') + `</div>` : `<button class="btn ghost full" data-act="go-month">Choose this month’s three focuses</button>`}`)}

      ${officeCard()}

      ${card(`<div class="quick-grid">
        <button class="quick" data-act="go-food"><span>🍽️</span>Should I eat this?</button>
        <button class="quick" data-act="wait20"><span>⏳</span>Wait 20 minutes</button>
        <button class="quick" data-act="hunger-jump"><span>📊</span>How hungry am I?</button>
        <button class="quick" data-act="future-her"><span>🤍</span>What would 75kg her do?</button></div>`, 'quiet')}

      <p class="soft-close">${esc(pick(SOFT_LINES, kept + streak))}</p></div>`;
  }

  /* ============================ VIEW: BODY ============================ */
  function viewBody() {
    const seg = App.seg.body || 'weight';
    const inner = seg === 'food' ? bodyFood() : seg === 'cycle' ? bodyCycle() : seg === 'future' ? bodyFuture() : bodyWeight();
    const tab = function (v, label) { return `<button class="${seg === v ? 'on' : ''}" data-act="seg" data-group="body" data-val="${v}">${label}</button>`; };
    return `<div class="view"><header class="page-head"><h1>Your Body</h1><p>Kind, honest, unhurried.</p></header>
      <div class="segmented scroll" data-seg="body">${tab('weight', 'Weight')}${tab('food', 'Food')}${tab('cycle', 'Cycle')}${tab('future', 'Future Her')}</div>${inner}</div>`;
  }

  function bodyWeight() {
    const st = S.get(), cur = M.currentWeight(), start = M.startWeight(), goal = M.goalWeight();
    const remaining = M.remaining(), lost = M.totalLost(), bmi = M.bmi(), bmiLabel = M.bmiLabel(bmi);
    const fc = M.forecast(), pct = M.percentToGoal();
    const target = M.targetDate(), reqRate = M.requiredWeeklyRate();
    const chart = Charts.weightChart(M.sortedWeights(), { goal: goal, forecast: (fc && !fc.arrived && !fc.unknown) ? { arrivalKey: fc.arrivalKey } : null });

    let forecastLine;
    if (fc.arrived) forecastLine = 'You’ve arrived at her. 🤍';
    else if (fc.unknown) forecastLine = 'Your forecast appears once your line has a direction. Keep logging weekly.';
    else forecastLine = `At about ${Math.abs(fc.weeklyRate)}kg / week, 75kg her arrives around <b>${fc.arrivalPretty}</b>.`;

    let paceMsg = '';
    if (!fc.arrived) {
      if (fc.weeklyRate && fc.weeklyRate <= -reqRate * 0.9) paceMsg = 'You’re on pace with your 6-month plan. 🤍';
      else if (fc.weeklyRate && fc.weeklyRate < 0) paceMsg = 'A little gentler than plan — and that’s okay. Sustainable wins.';
      else paceMsg = 'Keep logging weekly; your pace will show here.';
    }

    const ringHTML = Charts.ring({ percent: pct, size: 128, stroke: 12, gradient: ['#F3B7C6', '#E38AA0'], label: `<b>${pct}<span>%</span></b>`, sub: 'to goal' });
    const photos = st.photos.slice().reverse(), measures = st.measurements.slice().reverse();

    return `
      ${card(`<div class="weight-hero">${ringHTML}<div class="weight-grid">
        ${tile('Current', cur + 'kg')}${tile('Goal', goal + 'kg')}${tile('Remaining', remaining + 'kg')}${tile('Lost', lost + 'kg', 'from ' + start + 'kg')}</div></div>
        <div class="cta-row"><button class="btn primary" data-act="log-weight">Log weight</button><span class="cta-note">Weigh weekly only — the scale isn’t the story.</span></div>`, 'weight-summary')}

      ${card(`${sectionTitle('Your line')}${chart}<div class="forecast-note">${forecastLine}</div>
        <div class="plan-note">Your 6-month plan: reach 75kg by <b>${Dates.prettyFull(target)}</b> — about ${reqRate}kg/week. ${paceMsg}</div>`)}

      ${card(`<div class="bmi-row"><div>${tile('BMI', bmi, bmiLabel)}</div><div class="bmi-bar"><div class="bmi-fill" style="width:${Math.min(100, (bmi / 40) * 100)}%"></div></div></div>`)}

      ${card(`${sectionTitle('Measurements', addBtn('add-measurement'))}
        ${measures.length ? `<div class="rows">` + measures.map(function (m) { const parts = ['waist', 'hips', 'bust', 'thigh', 'arm'].filter(function (k) { return m[k]; }).map(function (k) { return k + ' ' + m[k] + 'cm'; }).join(' · '); return `<div class="row"><div><b>${esc(Dates.prettyShort(m.date))}</b><i>${esc(parts || '—')}</i></div></div>`; }).join('') + `</div>` : listEmpty('Optional — a tape measure tells the truth the scale hides.')}`)}

      ${card(`${sectionTitle('Progress photos', addBtn('add-photo'))}
        ${photos.length ? `<div class="gallery">` + photos.map(function (ph) { return `<figure class="shot"><img alt="progress" data-load="${ph.mediaId}"><figcaption>${esc(Dates.prettyShort(ph.date))}</figcaption><button class="shot-del" data-act="del-photo" data-id="${ph.id}" data-mid="${ph.mediaId}">✕</button></figure>`; }).join('') + `</div>` : listEmpty('Private to this device. A gentle before, for future her to smile at.')}`)}`;
  }

  function bodyFood() {
    const st = S.get(), nn = st.nonNegotiables, log = st.foodLog.slice().reverse().slice(0, 12);
    return `
      ${card(`${sectionTitle('How hungry are you?')}
        <div class="hunger-scale">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return `<button class="hunger-dot" data-act="hunger-set" data-n="${n}">${n}</button>`; }).join('')}</div>
        <div class="hunger-legend"><span>Bored</span><span>Peckish</span><span>Hungry</span><span>Starving</span></div>
        <div id="hunger-out" class="hunger-out"></div>`)}

      ${card(`${sectionTitle('Should I eat this?')}<p class="muted small">Ask before, not after. I’ll be honest — I won’t negotiate.</p>
        <div class="food-check"><input id="food-input" type="text" placeholder="e.g. office cake, chicken, soda…" autocomplete="off"><button class="btn primary" data-act="food-check">Ask</button></div>
        <div class="food-quick">${['Office cake', 'Soda', 'Chocolate', 'Office snacks', 'Chicken', 'Greek yogurt'].map(function (x) { return `<button class="tag" data-act="food-quick" data-q="${esc(x)}">${esc(x)}</button>`; }).join('')}</div>
        <div id="food-verdict" class="food-verdict"></div>`)}

      ${card(`${sectionTitle('Already ate something off-plan?')}<p class="muted small">No shame — just note it. Honesty is what makes this work, and it keeps your calorie estimate honest too.</p><button class="btn ghost full" data-act="note-offplan">Note it, kindly</button>`)}

      ${card(`${sectionTitle('Non-negotiables', addBtn('add-nn'))}
        <div class="nn-list">${nn.map(function (n) { return `<div class="nn-row ${n.active ? 'on' : ''}"><button class="nn-toggle" data-act="toggle-nn" data-id="${n.id}">${n.active ? '◆' : '◇'}</button><span>${esc(n.text)}</span><button class="nn-del" data-act="del-nn" data-id="${n.id}">✕</button></div>`; }).join('')}</div>
        <p class="muted small">These aren’t rules to break. They’re agreements you already made with her.</p>`)}

      ${card(`${sectionTitle('Food notes')}
        ${log.length ? `<div class="rows">` + log.map(function (f) { return `<div class="row"><div><b>${esc(f.item)}</b><i>${esc(Dates.prettyShort(f.date))}${f.cal ? ' · ~' + f.cal + ' kcal' : ''}</i></div><span class="verdict-pill ${f.verdict}">${f.verdict === 'yes' ? 'Aligned' : f.verdict === 'no' ? 'Off-plan' : 'Noted'}</span></div>`; }).join('') + `</div>` : listEmpty('Nothing logged yet. Every honest note counts.')}`)}`;
  }

  function cyclePhase() {
    const c = S.get().cycle;
    if (!c || !c.periods || !c.periods.length) return null;
    const last = c.periods.slice().sort()[c.periods.length - 1];
    const elapsed = Dates.diffDays(last, Dates.today());
    if (elapsed < 0) return null;
    const avg = c.avgCycle || 28, period = c.avgPeriod || 5;
    const day = (elapsed % avg) + 1;
    let phase, emoji, pms = false, message;
    if (day <= period) { phase = 'Menstrual'; emoji = '🌙'; message = 'Rest is productive. Lower energy is expected, and any weight up is water — not fat. Be gentle with yourself.'; }
    else if (day <= 13) { phase = 'Follicular'; emoji = '🌱'; message = 'Energy is rising. A good window for movement and momentum.'; }
    else if (day <= 16) { phase = 'Ovulation'; emoji = '☀️'; message = 'Peak energy and confidence. Ride it.'; }
    else { phase = 'Luteal'; emoji = '🌸'; if (day >= avg - 4) { pms = true; message = 'Cravings are hormonal right now — not failure. Protein and water help. The scale may rise 1–2kg from water; it passes.'; } else { message = 'Winding down. Prioritise protein, water and sleep.'; } }
    const nextStart = Dates.addDays(last, avg), daysUntil = Dates.diffDays(Dates.today(), nextStart);
    return { day: day, phase: phase, emoji: emoji, pms: pms, message: message, nextStart: nextStart, daysUntil: daysUntil };
  }
  function bodyCycle() {
    const c = S.get().cycle, ph = cyclePhase();
    const periods = (c.periods || []).slice().sort().reverse();
    return `
      ${ph ? card(`<div class="cycle-hero"><div class="cycle-emoji">${ph.emoji}</div><div class="cycle-day">Day ${ph.day}</div><div class="cycle-phase">${ph.phase} phase</div>
        <div class="cycle-next">${ph.daysUntil >= 0 ? 'Next period in about ' + ph.daysUntil + ' day' + (ph.daysUntil === 1 ? '' : 's') : 'Expected around now — ' + Math.abs(ph.daysUntil) + 'd past the estimate'}</div></div>
        <div class="cycle-msg ${ph.pms ? 'pms' : ''}">${ph.message}</div>`, 'cycle-card')
        : card(`<div class="cycle-empty"><div class="cycle-emoji">🌙</div><p>Log your last period start to see your phase, your next date, and gentle context for cravings and weight.</p></div>`, 'cycle-card')}
      ${card(`<div class="cta-row"><button class="btn primary" data-act="log-period">Log period start</button><span class="cta-note">Understanding your cycle takes the shame out of a heavy week.</span></div>`)}
      ${card(`${sectionTitle('Cycle settings', `<button class="add-btn" data-act="edit-cycle">✎</button>`)}<div class="weight-grid"><div>${tile('Cycle length', (c.avgCycle || 28) + 'd')}</div><div>${tile('Period length', (c.avgPeriod || 5) + 'd')}</div></div>`)}
      ${card(`${sectionTitle('Recent periods')}${periods.length ? `<div class="rows">` + periods.map(function (p) { return `<div class="row"><div><b>${esc(Dates.prettyFull(p))}</b></div><button class="nn-del" data-act="del-period" data-d="${p}">✕</button></div>`; }).join('') + `</div>` : listEmpty('No periods logged yet.')}`)}`;
  }
  function bodyFuture() {
    const vision = S.get().vision || [];
    return `${card(`<div class="future-her"><div class="fh-halo">🤍</div><h2>What would 75kg her do?</h2>
      <ul class="fh-list"><li>Eats intentionally.</li><li>Doesn’t negotiate with herself.</li><li>Drinks water.</li><li>Sleeps properly.</li><li>Protects her peace.</li><li>Continues.</li></ul>
      <p class="fh-close">You don’t have to become her. You’re returning to her.</p></div>`, 'future-card')}
      ${card(`${sectionTitle('Vision board', addBtn('add-vision'))}<p class="muted small">Images of the life you’re returning to. Look at her often.</p>
        ${vision.length ? `<div class="gallery">` + vision.slice().reverse().map(function (v) { return `<figure class="shot"><img alt="vision" data-load="${v.mediaId}"><button class="shot-del" data-act="del-vision" data-id="${v.id}" data-mid="${v.mediaId}">✕</button></figure>`; }).join('') + `</div>` : listEmpty('Add photos that feel like her — places, outfits, moments, goals.')}`)}
      ${card(`${sectionTitle('A letter waiting for you')}<p class="muted">When it’s hard, open the Vault and read what you wrote to yourself.</p><button class="btn ghost" data-act="go-vault">Open the Vault</button>`)}`;
  }

  /* ============================ VIEW: RESETS ============================ */
  function viewResets() {
    const seg = App.seg.resets || 'content';
    const tabs = [['content', 'Content'], ['wealth', 'Money'], ['love', 'Love'], ['dating', 'Dating'], ['soft', 'Soft Life'], ['beautiful', 'Beautiful']];
    const inner = ({ content: resetContent, wealth: resetWealth, love: resetLove, dating: resetDating, soft: resetSoft, beautiful: resetBeautiful })[seg]();
    return `<div class="view"><header class="page-head"><h1>Resets</h1><p>A whole life, not just a body.</p></header>
      <div class="segmented scroll" data-seg="resets">${tabs.map(function (t) { return `<button class="${seg === t[0] ? 'on' : ''}" data-act="seg" data-group="resets" data-val="${t[0]}">${t[1]}</button>`; }).join('')}</div>${inner}</div>`;
  }

  function projRow(item, kind) {
    return `<div class="proj-row"><button class="proj-main" data-act="edit-proj" data-kind="${kind}" data-id="${item.id}">
      <div class="proj-top"><b>${esc(item.title)}</b><span>${item.done ? 'Done ✓' : (item.progress || 0) + '%'}</span></div>
      <div class="proj-bar"><div class="proj-fill ${item.done ? 'full' : ''}" style="width:${item.done ? 100 : (item.progress || 0)}%"></div></div></button>
      <button class="nn-del" data-act="del-proj" data-kind="${kind}" data-id="${item.id}">✕</button></div>`;
  }
  function projBlock(title, kind, items, emptyMsg) {
    return card(`${sectionTitle(title, `<button class="add-btn" data-act="add-proj" data-kind="${kind}">＋</button>`)}
      ${items.length ? `<div class="rows">` + items.map(function (i) { return projRow(i, kind); }).join('') + `</div>` : listEmpty(emptyMsg)}`);
  }

  function bookRow(b) {
    const stage = b.stage || 'Idea';
    return `<div class="book-item"><button class="book-row" data-act="edit-book" data-id="${b.id}">
      <div class="book-spine s-${stageClass(stage)}"></div>
      <div class="book-info"><div class="book-title">${esc(b.title)}</div>
        ${b.subtitle ? `<div class="book-sub">“${esc(b.subtitle)}”</div>` : ''}
        <div class="book-meta"><span class="stage-badge s-${stageClass(stage)}">${esc(stage)}</span>${b.description ? `<span class="book-desc">${esc(b.description)}</span>` : ''}</div>
      </div></button><button class="nn-del" data-act="del-book" data-id="${b.id}">✕</button></div>`;
  }
  function bookVaultCard(books) {
    return card(`${sectionTitle('The Book Vault', `<button class="add-btn" data-act="add-book">＋</button>`)}
      <p class="muted small">Unlimited books. An idea can wait years before it’s written — that’s allowed here.</p>
      ${books.length ? `<div class="book-list">` + books.map(bookRow).join('') + `</div>` : listEmpty('Add a book — even one that’s only an idea for now.')}`, 'bookvault-card');
  }
  function resetContent() {
    const c = S.get().content;
    ['videos', 'posts', 'pagesWritten', 'coursesCompleted'].forEach(function (k) { ensure(c, k, 0); });
    ensure(c, 'books', []); ensure(c, 'apps', []); ensure(c, 'games', []); ensure(c, 'projects', []);
    const booksDone = c.books.filter(function (b) { return b.done || b.stage === 'Published'; }).length;
    return `
      ${card(`${sectionTitle('Content reset', `<button class="add-btn" data-act="edit-content">✎</button>`)}
        <div class="content-grid">${tile('Videos', c.videos)}${tile('Books', booksDone + '/' + c.books.length)}${tile('Pages written', c.pagesWritten)}${tile('Courses', c.coursesCompleted)}${tile('Days created', M.daysCreated())}</div>
        <div class="content-quick"><button class="chip-btn strong" data-act="videos-plus">＋ video</button><button class="chip-btn" data-act="pages-plus">＋ page</button></div>
        <p class="muted small">Content creation is one of your biggest goals — so it gets its own scoreboard.</p>`)}
      ${bookVaultCard(c.books)}
      ${projBlock('Apps', 'apps', c.apps, 'Your apps — add one and track its progress.')}
      ${projBlock('Games', 'games', c.games, 'Your games in progress.')}
      ${projBlock('Projects & other', 'projects', c.projects, 'Courses, comics, websites — anything you’re making.')}`;
  }

  function resetWealth() {
    const w = S.get().wealth;
    ['rentGoal', 'transport', 'food', 'gifts', 'carFund', 'perfumeFund'].forEach(function (k) { ensure(w, k, k === 'rentGoal' ? null : 0); });
    const subsTotal = (w.subscriptions || []).reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    const rentPct = (w.rentGoal && w.rentGoal > 0) ? Math.min(100, Math.round((w.rentSavings / w.rentGoal) * 100)) : 0;
    const spend = M.monthly().intentionalSpend;
    ensure(w, 'expenses', []);
    const today = Dates.today(), mk = M.currentMonthKey();
    const todaySpent = w.expenses.filter(function (e) { return e.date === today; }).reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
    const monthSpent = w.expenses.filter(function (e) { return Dates.monthKey(e.date) === mk; }).reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
    const budget = w.monthlyBudget || 0, overBudget = budget > 0 && monthSpent > budget;
    const budgetPct = budget > 0 ? Math.min(100, Math.round((monthSpent / budget) * 100)) : 0;
    const recentExp = w.expenses.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 12);
    return `
      ${card(`${sectionTitle('The money page', `<button class="add-btn" data-act="edit-money">✎</button>`)}${tile('Salary', money(w.salary), 'monthly', 'wide')}`)}
      ${card(`${sectionTitle('Daily expenses', `<button class="add-btn" data-act="add-expense">＋</button>`)}
        <div class="weight-grid"><div>${tile('Spent today', money(todaySpent))}</div><div>${tile('This month', money(monthSpent))}</div></div>
        ${budget > 0 ? `<div class="rent-bar" style="margin-top:12px"><div class="rent-fill" style="width:${budgetPct}%${overBudget ? ';background:#E38AA0' : ''}"></div></div><div class="muted small">${overBudget ? ('Over budget by ' + money(monthSpent - budget) + '. Gently — the next choice resets it.') : (money(budget - monthSpent) + ' left of your ' + money(budget) + ' monthly budget')}</div>` : `<p class="muted small">Set a monthly budget (✎ above) to see what’s left each month.</p>`}
        ${recentExp.length ? `<div class="rows" style="margin-top:12px">` + recentExp.map(function (e) { return `<div class="row"><div><b>${money(e.amount)}</b><i>${esc(Dates.prettyShort(e.date))} · ${esc(e.category || 'Other')}${e.note ? ' · ' + esc(e.note) : ''}</i></div><button class="nn-del" data-act="del-expense" data-id="${e.id}">✕</button></div>`; }).join('') + `</div>` : listEmpty('No expenses logged yet. Track daily to spend on purpose.')}`)}
      ${card(`${sectionTitle('Rent goal')}<div class="rent-top"><span>${money(w.rentSavings)}</span><span class="muted">of ${money(w.rentGoal)}</span></div>
        <div class="rent-bar"><div class="rent-fill" style="width:${rentPct}%"></div></div><div class="muted small">${rentPct}% saved toward next year’s rent.</div>`)}
      ${card(`${sectionTitle('Funds & envelopes')}<div class="funds-grid">${tile('Emergency', money(w.emergencyFund))}${tile('Car fund', money(w.carFund))}${tile('Transport', money(w.transport))}${tile('Food', money(w.food))}${tile('Gifts', money(w.gifts))}${tile('Perfume', money(w.perfumeFund))}</div>`)}
      ${listBlock('Subscriptions', 'add-sub', w.subscriptions, function (s) { return `<div class="row"><div><b>${esc(s.name)}</b><i>monthly</i></div><span class="amt">${money(s.amount)}</span><button class="nn-del" data-act="del-sub" data-id="${s.id}">✕</button></div>`; }, 'Track what quietly leaves each month.')}
      ${subsTotal ? `<p class="muted small center">Subscriptions total about ${money(subsTotal)} / month.</p>` : ''}
      ${listBlock('Financial goals', 'add-fgoal', w.goals, function (g) { return `<div class="row"><label class="row-check ${g.done ? 'done' : ''}" data-act="toggle-fgoal" data-id="${g.id}"><span class="check">${g.done ? '✓' : ''}</span><b>${esc(g.title)}</b>${g.target ? `<i>${money(g.target)}</i>` : ''}</label><button class="nn-del" data-act="del-fgoal" data-id="${g.id}">✕</button></div>`; }, 'Save first. Spend on purpose.')}
      ${card(`${sectionTitle('Did I spend intentionally this month?')}<div class="intentional"><button class="btn ${spend === 'yes' ? 'primary' : 'ghost'}" data-act="set-intentional" data-v="yes">Yes</button><button class="btn ${spend === 'no' ? 'primary' : 'ghost'}" data-act="set-intentional" data-v="no">Not quite</button></div>
        ${spend ? `<p class="muted small center">${spend === 'yes' ? 'Beautiful. Intentional money is soft money.' : 'Noticed, not judged. Next month, on purpose.'}</p>` : ''}`)}`;
  }

  function loveList(key, title, addAct, emptyMsg) {
    return listBlock(title, addAct, S.get().love[key], function (x) { return `<div class="row"><div><b>${esc(x.text)}</b><i>${esc(Dates.prettyShort(x.date))}</i></div><button class="nn-del" data-act="del-love" data-key="${key}" data-id="${x.id}">✕</button></div>`; }, emptyMsg);
  }

  const DEFAULT_CHECKS = ['Respects women', 'Emotionally available', 'Consistent (not hot & cold)', 'Communicates honestly', 'Financially responsible', 'Ambitious / driven', 'Kind to others', 'Shares my values', 'Wants marriage', 'Wants kids', 'Makes time for me', 'No deal-breakers so far'];
  function ensureDating(st) {
    const L = st.love; if (!L.dating2) L.dating2 = { standards: [], green: [], red: [], people: [], dates: [], goal: 2, checks: [] };
    ['standards', 'green', 'red', 'people', 'dates'].forEach(function (k) { if (!L.dating2[k]) L.dating2[k] = []; });
    if (L.dating2.goal == null) L.dating2.goal = 2;
    if (!L.dating2.checks || !L.dating2.checks.length) L.dating2.checks = DEFAULT_CHECKS.map(function (t) { return { id: S.uid(), label: t }; });
    return L.dating2;
  }
  const DATE_IDEAS = ['Coffee somewhere beautiful', 'A gallery or museum', 'A sunset walk', 'Try a new restaurant', 'Cook a meal together', 'Live music', 'Browse a bookshop', 'Board games & mocktails', 'The beach or waterfront', 'A farmers’ market', 'A dessert date', 'A class together — pottery, dance, art', 'A picnic', 'A spa afternoon (a solo date counts!)'];
  function datePersonSheet(person) {
    const st = S.get(); const d = ensureDating(st);
    const p = person || {}; const answers = Object.assign({}, p.answers || {});
    const opt = function (s, sel) { return `<option ${sel === s ? 'selected' : ''}>${s}</option>`; };
    const profile =
      `<label class="fld"><span>Name</span><input name="name" value="${esc(p.name || '')}" placeholder="His name"></label>
       <label class="fld"><span>Status</span><select name="status">${['Talking', 'Dating', 'Paused', 'Ended'].map(function (s) { return opt(s, p.status || 'Talking'); }).join('')}</select></label>
       <label class="fld"><span>Birthday</span><input name="birthday" type="date" value="${esc(p.birthday || '')}"></label>
       <label class="fld"><span>State of origin</span><input name="origin" value="${esc(p.origin || '')}" placeholder="e.g. Anambra"></label>
       <label class="fld"><span>Likes / interests</span><input name="likes" value="${esc(p.likes || '')}" placeholder="e.g. football, travel, jollof"></label>
       <label class="fld"><span>Kids — wants them? how many?</span><input name="kids" value="${esc(p.kids || '')}" placeholder="e.g. Yes, 3"></label>
       <label class="fld"><span>Notes</span><textarea name="notes" rows="3" placeholder="Anything worth remembering">${esc(p.notes || '')}</textarea></label>`;
    const checksHTML = `<div class="checks-title">Does he meet your standards?</div><div class="checks">` + d.checks.map(function (c) {
      const a = answers[c.id] || '';
      return `<div class="check-row"><span class="check-q">${esc(c.label)}</span><div class="tri" data-check="${c.id}"><button type="button" data-val="yes" class="tri-btn ${a === 'yes' ? 'on yes' : ''}">Yes</button><button type="button" data-val="checking" class="tri-btn ${a === 'checking' ? 'on chk' : ''}">Checking</button><button type="button" data-val="no" class="tri-btn ${a === 'no' ? 'on no' : ''}">No</button></div></div>`;
    }).join('') + `</div><p class="muted small">Add or remove questions from the “Questions I’m checking” card.</p>`;
    const ov = openSheet({
      title: person ? (p.name || 'Edit') : 'Someone I’m seeing', subtitle: 'His details — and how he measures up.',
      bodyHTML: profile + checksHTML, submitLabel: person ? 'Save' : 'Add him',
      onSubmit: function (v) {
        S.mutate(function () {
          const dd = ensureDating(st);
          if (person) { person.name = v.name || person.name; person.status = v.status; person.birthday = v.birthday || ''; person.origin = v.origin || ''; person.likes = v.likes || ''; person.kids = v.kids || ''; person.notes = v.notes || ''; person.answers = answers; }
          else { dd.people.push({ id: S.uid(), name: v.name || 'Someone', status: v.status || 'Talking', birthday: v.birthday || '', origin: v.origin || '', likes: v.likes || '', kids: v.kids || '', notes: v.notes || '', answers: answers }); }
        });
        closeSheet(); render();
      }
    });
    $$('.tri', ov).forEach(function (tri) {
      const cid = tri.getAttribute('data-check');
      $$('.tri-btn', tri).forEach(function (btn) {
        btn.addEventListener('click', function () {
          const val = btn.getAttribute('data-val');
          answers[cid] = (answers[cid] === val) ? '' : val;
          $$('.tri-btn', tri).forEach(function (b) { b.classList.remove('on', 'yes', 'no', 'chk'); });
          if (answers[cid]) btn.classList.add('on', val === 'yes' ? 'yes' : val === 'no' ? 'no' : 'chk');
        });
      });
    });
  }
  function datesThisMonth() { const d = S.get().love.dating2; if (!d || !d.dates) return 0; const mk = M.currentMonthKey(); return d.dates.filter(function (x) { return Dates.monthKey(x.date) === mk; }).length; }
  function dateNudge() {
    const d = S.get().love && S.get().love.dating2; if (!d) return '';
    const dates = d.dates || [], goal = d.goal || 2, count = datesThisMonth();
    if (count >= goal) return '';
    const last = dates.length ? dates.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })[dates.length - 1].date : null;
    if (last && Dates.diffDays(last, Dates.today()) < 10) return ''; // dated recently — ease off
    const weeks = last ? Math.max(1, Math.floor(Dates.diffDays(last, Dates.today()) / 7)) : null;
    const line = last ? ('It’s been ' + weeks + ' week' + (weeks === 1 ? '' : 's') + ' since your last date. Plan another this week. 💗') : 'You wanted intentional love. It starts with one yes. Plan a date this week. 💗';
    return card(`<div class="nudge"><span class="nudge-ico">💗</span><div class="nudge-copy"><b>Go on a date this week.</b><span>${esc(line)}</span></div><button class="btn ghost small" data-act="go-dating">Plan</button></div>`, 'nudge-card');
  }
  function planDate() {
    const idea = DATE_IDEAS[Math.floor(Math.random() * DATE_IDEAS.length)];
    const ov = openSheet({ title: 'Plan a date', subtitle: '75kg her chooses — she doesn’t wait to be chosen.', bodyHTML: `<div class="wait-water"><div class="wait-emoji">💗</div><p style="font-size:18px;font-weight:600;color:var(--rose-deep)">${esc(idea)}</p><p class="muted small">Pick a day this week. Text someone — or take yourself. A solo date absolutely counts.</p></div>`, submitLabel: 'I’ll make it happen', onSubmit: function () { closeSheet(); toast('Yes. Put it in your calendar. 💗'); } });
    const actions = $('.sheet-actions', ov); if (actions && actions.lastChild) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = 'Another idea'; b.addEventListener('click', function () { planDate(); }); actions.insertBefore(b, actions.lastChild); }
  }
  function datingSection() {
    const d = ensureDating(S.get());
    const chips = function (arr, delAct, empty) { return arr.length ? arr.map(function (x) { return `<span class="dchip">${esc(x.text)}<button data-act="${delAct}" data-id="${x.id}" aria-label="remove">✕</button></span>`; }).join('') : `<span class="muted small">${empty}</span>`; };
    const STATUS = { Talking: 'talking', Dating: 'dating', Paused: 'paused', Ended: 'ended' };
    const count = datesThisMonth(), goal = d.goal || 2;
    const pushLine = count >= goal ? 'You showed up for your own love life this month. Proud of you. 🤍' : count > 0 ? 'One down — keep the momentum. You deserve to pursue and to be pursued.' : 'You said you wanted intentional love. It starts with one yes. Plan a date this week.';
    const recent = (d.dates || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 8);
    return `
      ${card(`${sectionTitle('Go on dates 💗', `<button class="add-btn" data-act="set-date-goal">✎</button>`)}
        <div class="date-goal"><div class="date-goal-num">${count}<span>/${goal}</span></div><div class="date-goal-lab">intentional dates<br>this month</div></div>
        <p class="push-line">${pushLine}</p>
        <div class="cta-row two"><button class="btn primary" data-act="plan-date">Plan a date</button><button class="btn ghost" data-act="log-date">I went on a date</button></div>`, 'datepush-card')}

      ${card(`${sectionTitle('Dating — my standards', addBtn('add-standard'))}
        <p class="muted small">Decide who you’re becoming intentional for — before the feelings, not after.</p>
        <div class="dchips">${chips(d.standards, 'del-standard', 'Add what you want and won’t compromise.')}</div>`)}

      ${card(`${sectionTitle('Green flags & deal-breakers')}
        <div class="flag-group"><div class="flag-head green"><span>Green flags</span><button class="add-btn" data-act="add-green">＋</button></div>
          <div class="dchips">${chips(d.green, 'del-green', 'What to look for.')}</div></div>
        <div class="flag-group"><div class="flag-head red"><span>Deal-breakers</span><button class="add-btn" data-act="add-red">＋</button></div>
          <div class="dchips">${chips(d.red, 'del-red', 'What you walk away from.')}</div></div>`)}

      ${card(`${sectionTitle('Questions I’m checking', `<button class="add-btn" data-act="add-check">＋</button>`)}
        <p class="muted small">The things you check each person against — you’ll answer Yes / No / Still checking on his card.</p>
        <div class="dchips">${d.checks && d.checks.length ? d.checks.map(function (c) { return `<span class="dchip">${esc(c.label)}<button data-act="del-check" data-id="${c.id}" aria-label="remove">✕</button></span>`; }).join('') : `<span class="muted small">Add questions to check for.</span>`}</div>`)}

      ${card(`${sectionTitle('People I’m seeing', addBtn('add-date-person'))}
        <p class="muted small">Tap someone to fill in his details and check him against your standards.</p>
        ${d.people.length ? `<div class="date-people">` + d.people.map(function (p) {
          const ans = p.answers || {}; let yes = 0, no = 0, chk = 0; Object.keys(ans).forEach(function (k) { const a = ans[k]; if (a === 'yes') yes++; else if (a === 'no') no++; else if (a === 'checking') chk++; });
          const sub = [p.origin, p.likes].filter(Boolean).join(' · ');
          return `<div class="date-person"><button class="dp-main" data-act="edit-date-person" data-id="${p.id}">
            <div class="dp-top"><b>${esc(p.name)}</b><span class="dp-status s-${STATUS[p.status] || 'talking'}">${esc(p.status || 'Talking')}</span></div>
            ${sub ? `<div class="dp-notes">${esc(sub)}</div>` : ''}
            <div class="dp-summary"><span class="ds yes">✓ ${yes}</span><span class="ds no">✕ ${no}</span><span class="ds chk">? ${chk}</span></div></button>
            <button class="nn-del" data-act="del-date-person" data-id="${p.id}">✕</button></div>`;
        }).join('') + `</div>` : listEmpty('No one yet — and that’s perfectly fine. Intentional means unhurried.')}`)}

      ${card(`${sectionTitle('Dates you’ve been on')}${recent.length ? `<div class="rows">` + recent.map(function (x) { return `<div class="row"><div><b>${esc(x.who || 'Solo date')}</b><i>${esc(Dates.prettyShort(x.date))}${x.place ? ' · ' + esc(x.place) : ''}${x.felt ? ' · ' + esc(x.felt) : ''}</i></div><button class="nn-del" data-act="del-date" data-id="${x.id}">✕</button></div>`; }).join('') + `</div>` : listEmpty('No dates logged yet. Your first intentional one is waiting.')}`)}`;
  }

  function resetDating() {
    return `${card(`<div class="quote-block">“Dating on purpose. Never out of loneliness.”</div>`, 'quote')}${datingSection()}`;
  }
  function resetLove() {
    const commits = S.get().love.commitments || [], people = S.get().people || [];
    return `
      ${card(`<div class="quote-block">“I will…”</div>`, 'quote')}
      ${card(`${sectionTitle('My intentions', addBtn('add-commit'))}<div class="commit-list">${commits.map(function (c) { return `<label class="commit-row ${c.done ? 'on' : ''}" data-act="toggle-commit" data-id="${c.id}"><span class="check">${c.done ? '✓' : ''}</span><span>${esc(c.text)}</span><button class="nn-del" data-act="del-commit" data-id="${c.id}">✕</button></label>`; }).join('')}</div>`)}

      ${card(`${sectionTitle('Family & friends', addBtn('add-person'))}
        <p class="muted small">Add the people who matter. I’ll gently ask if it’s been a while — and remind you before birthdays.</p>
        ${people.length ? `<div class="people-list">` + people.map(function (pn) {
          const since = pn.lastContacted ? Dates.diffDays(pn.lastContacted, Dates.today()) : null;
          const overdue = since == null || since > (pn.cadence || 7);
          const bd = daysUntilBirthday(pn.birthday);
          return `<div class="person ${overdue ? 'overdue' : ''}"><div class="person-top"><b>${esc(pn.name)}</b>${pn.relation ? `<span class="person-rel">${esc(pn.relation)}</span>` : ''}</div>
            <div class="person-meta">${since == null ? 'Not reached out yet' : (since === 0 ? 'Reached out today' : 'Last reached out ' + since + 'd ago')}${bd != null && bd <= 30 ? ` · 🎂 ${bd === 0 ? 'today!' : 'in ' + bd + 'd'}` : ''}</div>
            <div class="person-actions"><button class="btn ghost small" data-act="reached" data-id="${pn.id}">I reached out</button><button class="chip-btn" data-act="edit-person" data-id="${pn.id}">✎</button><button class="nn-del" data-act="del-person" data-id="${pn.id}">✕</button></div></div>`;
        }).join('') + `</div>` : listEmpty('No one added yet. Start with your parents and a close friend.')}`)}

      ${loveList('boundaries', 'Boundaries', 'add-love:boundaries', 'A boundary is a form of self-love.')}
      ${loveList('memories', 'Beautiful memories', 'add-love:memories', 'The moments worth keeping.')}`;
  }

  function resetSoft() {
    const sl = S.get().softlife, today = Dates.today(), hToday = sl.happiness[today];
    return `
      ${card(`${sectionTitle('Happiness today')}<div class="happy-scale">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return `<button class="happy-dot ${hToday === n ? 'on' : ''}" data-act="set-happy" data-n="${n}">${n}</button>`; }).join('')}</div>
        <p class="muted small">${hToday ? 'Noted, softly. Thank you for checking in.' : 'How full does today feel? No wrong answer.'}</p>`)}
      ${listBlock('Rest & sleep', 'add-rest', sl.weekendReset, function (r) { return `<div class="row"><div><b>${esc(r.text)}</b><i>${esc(Dates.prettyShort(r.date))}</i></div></div>`; }, 'Weekend resets, naps, slow mornings.')}
      ${listBlock('Solo dates', 'add-solo', sl.soloDates, function (r) { return `<div class="row"><div><b>${esc(r.text)}</b><i>${esc(Dates.prettyShort(r.date))}</i></div></div>`; }, 'A film, a café, a long walk — just you.')}
      ${listBlock('Travel & beautiful moments', 'add-moment', sl.moments, function (r) { return `<div class="row"><div><b>${esc(r.text)}</b><i>${esc(Dates.prettyShort(r.date))}</i></div></div>`; }, 'Places, plans, and small joys.')}`;
  }

  function beautifulList(key, title, addAct, emptyMsg) {
    return listBlock(title, addAct, S.get().beautiful[key], function (x) { return `<div class="row"><div><b>${esc(x.text)}</b><i>${esc(Dates.prettyShort(x.date))}</i></div><button class="nn-del" data-act="del-beautiful" data-key="${key}" data-id="${x.id}">✕</button></div>`; }, emptyMsg);
  }
  function resetBeautiful() {
    return `${card(`<div class="quote-block">“A beautiful life is also a goal.”</div>`, 'quote')}
      ${beautifulList('gratitude', 'Gratitude', 'add-beautiful:gratitude', 'Three lines. Whatever is true today.')}
      ${beautifulList('smiles', 'Things that made me smile', 'add-beautiful:smiles', 'Ordinary Tuesdays count too.')}
      ${beautifulList('memories', 'Beautiful memories', 'add-beautiful:memories', 'Saturdays worth remembering.')}
      ${beautifulList('wins', 'Monthly wins', 'add-beautiful:wins', 'Small wins are still wins.')}`;
  }

  /* ============================ VIEW: VAULT ============================ */
  function viewVault() {
    const v = S.get().vault; ensure(v, 'photos', []);
    const seg = App.seg.vault || 'letters';
    const tabs = [['letters', 'Letters'], ['journal', 'Journal'], ['dreams', 'Dreams'], ['voice', 'Voice'], ['photos', 'Photos']];
    let inner = '';
    if (seg === 'journal') {
      inner = listBlock('Journals', 'add-journal', v.journals.slice().reverse(), function (j) { return `<button class="row wide" data-act="open-journal" data-id="${j.id}"><div><b>${esc(j.title || 'Untitled')}</b><i>${esc(Dates.prettyShort(j.date))} · ${esc((j.body || '').slice(0, 60))}</i></div></button>`; }, 'A soft place to put the day down.');
    } else if (seg === 'letters') {
      inner = listBlock('Letters to future me', 'add-letter', v.letters.slice().reverse(), function (l) { return `<button class="row wide" data-act="open-letter" data-id="${l.id}"><div><b>${esc(l.title || 'To future me')}</b><i>${esc(Dates.prettyShort(l.date))}</i></div><span>💌</span></button>`; }, 'Write to her. She’ll need your words later.');
    } else if (seg === 'dreams') {
      inner = listBlock('Dreams & goals', 'add-dream', v.dreams.concat(v.goals), function (d) { return `<div class="row"><div><b>${esc(d.text || d.title)}</b></div><button class="nn-del" data-act="del-dream" data-id="${d.id}">✕</button></div>`; }, 'Name them so they stop being secrets.');
    } else if (seg === 'voice') {
      inner = card(`${sectionTitle('Voice notes')}<div class="voice-panel"><button class="btn primary" id="rec-btn" data-act="rec-toggle">● Record</button><span id="rec-status" class="muted small">Speak kindly to yourself.</span></div>
        ${v.voice.length ? `<div class="rows">` + v.voice.slice().reverse().map(function (n) { return `<div class="row"><div><b>${esc(n.note || 'Voice note')}</b><i>${esc(Dates.prettyShort(n.date))}</i></div><button class="chip-btn" data-act="play-voice" data-mid="${n.mediaId}">▶</button><button class="nn-del" data-act="del-voice" data-id="${n.id}" data-mid="${n.mediaId}">✕</button></div>`; }).join('') + `</div>` : listEmpty('Record a note for the days words are hard to find.')}`);
    } else {
      inner = card(`${sectionTitle('Photos', addBtn('add-vault-photo'))}${v.photos.length ? `<div class="gallery">` + v.photos.slice().reverse().map(function (ph) { return `<figure class="shot"><img alt="memory" data-load="${ph.mediaId}"><button class="shot-del" data-act="del-vault-photo" data-id="${ph.id}" data-mid="${ph.mediaId}">✕</button></figure>`; }).join('') + `</div>` : listEmpty('Keep the moments that made you feel like her.')}`);
    }
    return `<div class="view"><header class="page-head"><h1>The Vault</h1><p>Everything precious, in one quiet place.</p></header>
      <div class="segmented scroll" data-seg="vault">${tabs.map(function (t) { return `<button class="${seg === t[0] ? 'on' : ''}" data-act="seg" data-group="vault" data-val="${t[0]}">${t[1]}</button>`; }).join('')}</div>${inner}</div>`;
  }

  /* ============================ VIEW: PROGRESS ============================ */
  function viewProgress() {
    const st = S.get(), score = M.promiseScore(30), streak = M.streak(), consistency = M.consistencyScore(), today = Dates.today();
    const weekStart = Dates.startOfWeek(today), days = [], labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    for (let i = 0; i < 7; i++) days.push(M.dayScore(Dates.addDays(weekStart, i)));
    const bars = Charts.miniBars(days, labels, { max: M.promiseTotal() });
    const unlocked = Ach.catalog.filter(function (a) { return st.achievements[a.id]; });
    const badges = Ach.catalog.map(function (a) { const on = !!st.achievements[a.id]; return `<div class="badge ${on ? 'on' : ''}"><div class="badge-icon">${a.icon}</div><div class="badge-title">${esc(a.title)}</div><div class="badge-note">${on ? esc(a.note) : 'Coming, gently.'}</div></div>`; }).join('');
    return `<div class="view"><header class="page-head"><h1>Progress</h1><p>Consistency, not perfection.</p></header>
      ${card(`<div class="promise-hero">${Charts.ring({ percent: score, size: 156, stroke: 14, gradient: ['#F3B7C6', '#E38AA0'], label: `<b>${score}<span>%</span></b>`, sub: 'Promise Score' })}
        <div class="today-stats">${tile('Streak', streak + (streak === 1 ? ' day' : ' days'))}${tile('Consistency', consistency + '%', '30 days')}${tile('Days kept', M.keptDaysTotal())}</div></div>
        <p class="muted small center">Did you keep at least one promise to yourself today? If yes — today counts.</p>`)}
      ${card(`${sectionTitle('This week')}${bars}<p class="muted small center">Each bar is a day you showed up. Empty days are rest, not failure.</p>`)}
      ${card(`${sectionTitle('Reports')}<div class="report-btns"><button class="btn ghost" data-act="report" data-kind="weekly">Weekly</button><button class="btn ghost" data-act="report" data-kind="monthly">Monthly</button><button class="btn ghost" data-act="report" data-kind="quarterly">Quarterly</button></div><div id="report-out" class="report-out"></div>`)}
      ${card(`${sectionTitle('Share your progress')}<p class="muted small">A beautiful card of how far you’ve come — save it or share it.</p><button class="btn primary full" data-act="share-progress">Create my progress card</button>`)}
      ${card(`${sectionTitle('Achievements')}<p class="muted small">${unlocked.length} of ${Ach.catalog.length} earned so far.</p><div class="badge-grid">${badges}</div>`)}</div>`;
  }

  /* ============================ VIEW: MONTH ============================ */
  function defaultIdentity() { return { am: ['disciplined', 'healthy', 'intentional', 'financially intelligent', 'soft', 'beautiful', 'becoming her'], dont: ['drink soda', 'emotionally eat', 'quit'] }; }
  function viewMonth() {
    const mk = M.currentMonthKey(), m = M.monthly(mk), identity = m.identity || defaultIdentity(), focus = m.focus || [], spend = m.intentionalSpend;
    return `<div class="view"><header class="page-head"><h1>Who am I this month?</h1><p>${esc(Dates.prettyMonth(mk).toUpperCase())}</p></header>
      ${card(`${sectionTitle('I am…', `<button class="add-btn" data-act="edit-identity">✎</button>`)}
        <ul class="identity-list am">${identity.am.map(function (x) { return `<li>${esc(x)}.</li>`; }).join('')}</ul>
        <div class="identity-divider">This month I don’t…</div>
        <ul class="identity-list dont">${identity.dont.map(function (x) { return `<li>${esc(x)}.</li>`; }).join('')}</ul>`, 'identity-card')}
      ${card(`<div class="sec-title"><h2>This month · only three</h2>${focus.length < 3 ? `<button class="add-btn" data-act="add-focus">＋</button>` : ''}</div>
        ${focus.length ? `<div class="rows">` + focus.map(function (f, i) { return `<div class="row"><label class="row-check ${f.done ? 'done' : ''}" data-act="toggle-focus" data-id="${f.id}"><span class="focus-num">${i + 1}</span><span class="check">${f.done ? '✓' : ''}</span><b>${esc(f.title)}</b></label><button class="nn-del" data-act="del-focus" data-id="${f.id}">✕</button></div>`; }).join('') + `</div>` : listEmpty('Three goals. No more. That’s the whole point.')}
        ${focus.length >= 3 ? `<p class="muted small center">Three is the limit. Finish these first. 🤍</p>` : ''}`)}
      ${card(`${sectionTitle('Did I spend intentionally this month?')}<div class="intentional"><button class="btn ${spend === 'yes' ? 'primary' : 'ghost'}" data-act="set-intentional" data-v="yes">Yes</button><button class="btn ${spend === 'no' ? 'primary' : 'ghost'}" data-act="set-intentional" data-v="no">Not quite</button></div>
        ${spend ? `<p class="muted small center">${spend === 'yes' ? 'Beautiful. Intentional money is soft money.' : 'Noticed, not judged. Next month, on purpose.'}</p>` : ''}`)}</div>`;
  }

  /* ============================ VIEW: FOREVER ============================ */
  function viewForever() {
    const f = S.get().forever;
    return `<div class="view">
      ${card(`<div class="forever-hero"><div class="forever-badge big">✦</div><h1>Welcome.</h1><p class="forever-made">You made it.</p>
        <p class="forever-sub">You returned to her. Now you get to keep going — not because you have to, but because a beautiful life is also a goal.</p></div>`, 'forever-card')}
      ${card(`${sectionTitle('What next?', addBtn('add-forever'))}<div class="rows">${f.goals.map(function (g) { return `<div class="row"><label class="row-check ${g.done ? 'done' : ''}" data-act="toggle-forever" data-id="${g.id}"><span class="check">${g.done ? '✓' : ''}</span><b>${esc(g.text)}</b></label><button class="nn-del" data-act="del-forever" data-id="${g.id}">✕</button></div>`; }).join('')}</div>`)}
      ${card(`<div class="quote-block">Project 75 is now <b>Project Forever</b>.</div>`, 'quote')}</div>`;
  }

  /* ============================ VIEW: SETTINGS ============================ */
  function viewSettings() {
    const st = S.get(), s = st.settings;
    return `<div class="view"><header class="page-head"><h1>Settings</h1><p>Make it feel like yours.</p></header>
      ${card(`${sectionTitle('You')}<div class="rows">
        <div class="row"><div><b>Name</b><i>${esc(st.profile.name)}</i></div><button class="chip-btn" data-act="edit-profile">Edit</button></div>
        <div class="row"><div><b>Height</b><i>${st.profile.heightCm} cm</i></div></div>
        <div class="row"><div><b>Journey</b><i>${st.profile.startWeight}kg → ${st.profile.goalWeight}kg · ${st.profile.targetMonths || 6} months</i></div></div></div>`)}
      ${card(`${sectionTitle('Appearance')}
        <div class="segmented" data-seg="theme">${['system', 'light', 'dark'].map(function (t) { return `<button class="${s.theme === t ? 'on' : ''}" data-act="set-theme" data-val="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`; }).join('')}</div>
        <div class="skin-label">Colour</div>
        <div class="skins">${[['rose', 'Rose'], ['lavender', 'Lavender'], ['sage', 'Sage'], ['champagne', 'Champagne']].map(function (k) { return `<button class="skin-swatch sk-${k[0]} ${(s.skin || 'rose') === k[0] ? 'on' : ''}" data-act="set-skin" data-val="${k[0]}"><span></span>${k[1]}</button>`; }).join('')}</div>
        <div class="skin-label">Home background</div>
        <div class="report-btns"><button class="btn ghost" data-act="choose-bg">${s.bgMediaId ? 'Change photo' : 'Choose photo'}</button>${s.bgMediaId ? `<button class="btn ghost" data-act="remove-bg">Remove</button>` : ''}</div>
        <p class="muted small">Your own photo, behind your morning greeting.</p>`)}
      ${card(`${sectionTitle('Daily reminders')}<label class="switch-row"><span>Turn on reminders</span><button class="switch ${s.reminders ? 'on' : ''}" data-act="toggle-reminders" role="switch" aria-checked="${s.reminders}"></button></label>
        <div class="reminder-schedule">${REMINDERS.map(function (r) { return `<div class="rem-row"><span class="rem-time">${r.time}</span><span class="rem-text">${esc(r.title)}</span></div>`; }).join('')}</div>
        <p class="muted small">These pop up while the app is open or installed on your home screen. For pings even when the app is closed, I can also send them to your Teams — just ask.</p>`)}
      ${card(`${sectionTitle('Your data')}<div class="report-btns"><button class="btn ghost" data-act="export-data">Export backup</button><button class="btn ghost" data-act="import-data">Import backup</button></div>
        <p class="muted small">Everything stays on this device. Back up whenever you like.</p><button class="btn ghost danger" data-act="reset-data">Start the space fresh</button>`)}
      <p class="soft-close">A beautiful life is also a goal.</p></div>`;
  }

  /* ============================ Router ============================ */
  const VIEWS = { today: viewToday, body: viewBody, resets: viewResets, vault: viewVault, progress: viewProgress, settings: viewSettings, month: viewMonth, office: viewOffice, forever: viewForever };
  const TABS = [['today', 'Today', '🏠'], ['body', 'Body', '🤍'], ['resets', 'Resets', '✨'], ['vault', 'Vault', '🔐'], ['progress', 'Progress', '📈']];

  function renderTabs() {
    $('#tabbar').innerHTML = TABS.map(function (t) { const on = App.route === t[0]; return `<button class="tab ${on ? 'on' : ''}" data-act="go" data-route="${t[0]}"><span class="tab-ico">${t[2]}</span><span class="tab-lab">${t[1]}</span></button>`; }).join('');
  }
  function loadMediaImages(root) { $$('img[data-load]', root).forEach(function (img) { const id = img.getAttribute('data-load'); img.removeAttribute('data-load'); Media.url(id).then(function (u) { if (u) img.src = u; }); }); }
  function updatePanic() { const el = $('#panic'); if (el) el.hidden = M.inactiveDays() < 3; }

  function render() {
    const view = $('#view');
    const routeChanged = App._renderedRoute !== App.route;
    const y = window.scrollY;
    if (routeChanged) view.classList.remove('enter');
    view.innerHTML = (VIEWS[App.route] || viewToday)();
    loadMediaImages(view); renderTabs(); updatePanic();
    if (App.route === 'today') applyHomeBg();
    if (routeChanged) {
      // New screen: play the entrance animation and start at the top.
      requestAnimationFrame(function () { view.classList.add('enter'); Charts.animateIn(view); });
      window.scrollTo(0, 0);
    } else {
      // Same screen (a tap/toggle): update in place, keep scroll position, no replay.
      view.classList.add('enter');
      Charts.animateIn(view, true);
      window.scrollTo(0, y);
    }
    App._renderedRoute = App.route;
  }
  function go(route) { App.route = route; render(); }

  /* ============================ Food, hunger, wait-20, overwhelmed ============================ */
  function runFoodCheck(q) {
    const res = Food.classify(q), box = $('#food-verdict'); if (!box) return;
    box.className = 'food-verdict show ' + res.verdict;
    box.innerHTML = `<div class="fv-title">${esc(res.title)}</div><div class="fv-msg">${esc(res.message)}</div><div class="fv-reason">${esc(res.reason || '')}</div>
      ${res.verdict === 'no' ? `<div class="fv-joke">${esc(Food.joke())}</div>` : ''}
      <div class="fv-actions"><button class="btn ghost small" data-act="food-log" data-item="${esc(res.item)}" data-verdict="${res.verdict}">Note it</button>${res.verdict === 'no' ? `<button class="btn primary small" data-act="wait20">I really want it →</button>` : ''}</div>`;
  }
  function hungerSet(n) {
    const out = $('#hunger-out'); if (!out) return;
    $$('.hunger-dot').forEach(function (b) { b.classList.toggle('on', parseInt(b.getAttribute('data-n'), 10) <= n); });
    let html;
    if (n <= 3) html = `<div class="hunger-msg low"><b>${n}/10 — that’s not really hunger.</b><p>Are you hungry, or overwhelmed?</p><div class="fv-actions"><button class="btn ghost small" data-act="overwhelmed">I’m overwhelmed</button><button class="btn ghost small" data-act="wait20">Just a craving →</button></div></div>`;
    else if (n <= 6) html = `<div class="hunger-msg mid"><b>${n}/10 — peckish, not starving.</b><p>Drink water first, then wait twenty minutes. If it passes, it wasn’t hunger.</p><div class="fv-actions"><button class="btn primary small" data-act="wait20">Wait 20 minutes</button></div></div>`;
    else html = `<div class="hunger-msg high"><b>${n}/10 — real hunger.</b><p>Then eat, intentionally. Protein first, something on today’s plan. You waited, you listened — that’s her.</p></div>`;
    out.className = 'hunger-out show'; out.innerHTML = html;
  }
  function overwhelmedSheet() {
    openSheet({ title: 'Overwhelmed?', subtitle: 'Not lazy. Overwhelmed. I know the difference — and so should you.',
      bodyHTML: `<div class="overwhelmed"><p class="ow-lead">Today’s goal just got smaller. This is all it is:</p>
        <ul class="ow-list"><li>Drink water.</li><li>Eat protein.</li><li>Shower.</li><li>Take a short walk.</li><li>Sleep.</li></ul>
        <div class="ow-enough">That is enough.</div><p class="ow-sub">Everything else can wait.</p><div class="ow-welcome">Welcome home.</div></div>`,
      submitLabel: 'That, I can do', onSubmit: function () { closeSheet(); } });
    const c = $('#sheet-form .btn.ghost'); if (c) c.textContent = 'Close';
  }

  function startWait20() {
    let step = 0; const answers = {}; const Q = Food.CRAVING_QUESTIONS;
    function stepQuestion() {
      const cur = Q[step];
      openSheet({ title: 'Before you decide', subtitle: (step + 1) + ' of ' + Q.length,
        bodyHTML: `<div class="wait-q">${esc(cur.q)}</div><div class="wait-choices"><button type="button" class="btn ghost" data-w="no">No</button><button type="button" class="btn primary" data-w="yes">Yes</button></div>`,
        afterOpen: function (ov) { $$('[data-w]', ov).forEach(function (b) { b.addEventListener('click', function () { answers[cur.key] = b.getAttribute('data-w') === 'yes'; step++; if (step < Q.length) stepQuestion(); else stepWater(); }); }); } });
      const act = $('#sheet-form .sheet-actions'); if (act) act.style.display = 'none';
    }
    function stepWater() {
      const emotional = answers.bored || answers.stressed || answers.emotional || answers.tired;
      openSheet({ title: 'Drink water first', subtitle: emotional ? 'This might not be hunger.' : 'Let’s be sure it’s hunger.',
        bodyHTML: `<div class="wait-water"><div class="wait-emoji">💧</div><p>${emotional ? 'It sounds like your body is asking for something food won’t fix. Drink a full glass of water, then wait twenty minutes.' : 'Drink a full glass of water. Set this down for twenty minutes. Then we’ll ask again.'}</p></div>`,
        submitLabel: 'Start 20 minutes', onSubmit: function () { closeSheet(); startTimer(); } });
    }
    function startTimer() {
      let secs = 20 * 60;
      const ov = openSheet({ title: 'Twenty minutes', subtitle: 'You’re allowed to just breathe.',
        bodyHTML: `<div class="timer-wrap"><div id="w20-time" class="timer">20:00</div><p class="muted small">Distract gently — a walk, a text to a friend, a song. I’ll wait with you.</p></div>`,
        submitLabel: 'I’m still hungry', onSubmit: function () { clearInterval(tk); closeSheet(); stepAfter(); } });
      const actions = $('.sheet-actions', ov), passed = document.createElement('button');
      passed.type = 'button'; passed.className = 'btn ghost'; passed.textContent = 'It passed 🤍';
      passed.addEventListener('click', function () { clearInterval(tk); closeSheet(); cravingPassed(); });
      actions.insertBefore(passed, actions.firstChild);
      const tk = setInterval(function () { secs--; const el = $('#w20-time'); if (el) el.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0'); if (secs <= 0) { clearInterval(tk); if (el) el.textContent = '00:00'; } }, 1000);
    }
    function cravingPassed() {
      S.mutate(function (st) { st.promises[Dates.today()] = st.promises[Dates.today()] || {}; st.promises[Dates.today()].diet = true; });
      openSheet({ title: 'That was her.', subtitle: 'The waiting was the win.', bodyHTML: `<div class="wait-water"><div class="wait-emoji">🤍</div><p>You just made one intentional decision. That still counts — it always counts.</p></div>`, submitLabel: 'Continue', onSubmit: function () { closeSheet(); render(); } });
    }
    function stepAfter() {
      openSheet({ title: 'Still hungry?', subtitle: 'Then eat — intentionally.', bodyHTML: `<div class="wait-water"><div class="wait-emoji">🍽️</div><p>Real hunger deserves real food. Choose protein first, something on today’s plan. No guilt — you waited, you listened, you chose. That’s the practice.</p></div>`, submitLabel: 'Okay', onSubmit: function () { closeSheet(); } });
    }
    stepQuestion();
  }

  /* ============================ Reports ============================ */
  function generateReport(kind) {
    const st = S.get(), today = Dates.today();
    const spanDays = kind === 'weekly' ? 7 : kind === 'monthly' ? 30 : 91;
    const startKey = Dates.addDays(today, -(spanDays - 1));
    let keptDays = 0, waterSum = 0, waterDays = 0;
    for (let i = 0; i < spanDays; i++) { const d = Dates.addDays(startKey, i); if (M.dayKept(d)) keptDays++; if (st.water[d] != null) { waterSum += st.water[d]; waterDays++; } }
    const consistency = Math.round((keptDays / spanDays) * 100);
    const weightChange = M.weightChangeSince(startKey);
    const waterAvg = waterDays ? S.round(waterSum / waterDays, 1) : null;
    const unlockedInRange = Ach.catalog.filter(function (a) { const u = st.achievements[a.id]; return u && u >= startKey; });
    let weightLine;
    if (weightChange == null) weightLine = 'No new weigh-in this period — and that’s okay.';
    else if (weightChange < 0) weightLine = `Down ${Math.abs(weightChange)}kg. Softly, surely.`;
    else if (weightChange === 0) weightLine = 'Weight held steady. Maintenance is mastery too.';
    else weightLine = `Up ${weightChange}kg. Bodies fluctuate — the line matters more than the day. Continue.`;
    const closing = consistency >= 70 ? 'You kept coming home. She’s proud of you.' : consistency >= 30 ? 'You showed up more than you think. Keep the thread.' : 'A quiet season. Nothing is lost — today still counts.';
    return `<div class="report"><div class="report-title">${kind[0].toUpperCase() + kind.slice(1)} report</div><div class="report-range">${Dates.prettyShort(startKey)} – ${Dates.prettyShort(today)}</div>
      <div class="report-grid">${tile('Promise days', keptDays + '/' + spanDays)}${tile('Consistency', consistency + '%')}${tile('Water avg', waterAvg != null ? waterAvg + ' cups' : '—')}</div>
      <div class="report-line">🕊️ ${weightLine}</div>${unlockedInRange.length ? `<div class="report-line">🏅 Earned: ${unlockedInRange.map(function (a) { return esc(a.title); }).join(', ')}.</div>` : ''}
      <div class="report-close">${closing}</div></div>`;
  }

  /* ============================ Media capture ============================ */
  function pickImage(onBlob) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.addEventListener('change', function () { const file = inp.files && inp.files[0]; if (file) onBlob(file); }); inp.click(); }
  async function toggleRecord() {
    const btn = $('#rec-btn'), status = $('#rec-status');
    if (App.rec) { App.rec.stop(); return; }
    if (!navigator.mediaDevices || !global.MediaRecorder) {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*';
      inp.addEventListener('change', async function () { const f = inp.files && inp.files[0]; if (f) { const mid = await Media.put(f, { type: f.type }); saveVoice(mid); } }); inp.click(); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream), chunks = [];
      rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async function () { stream.getTracks().forEach(function (t) { t.stop(); }); const blob = new Blob(chunks, { type: 'audio/webm' }); const mid = await Media.put(blob, { type: 'audio/webm' }); App.rec = null; saveVoice(mid); };
      App.rec = rec; rec.start();
      if (btn) { btn.textContent = '■ Stop'; btn.classList.add('recording'); }
      if (status) status.textContent = 'Recording… speak kindly.';
    } catch (e) { toast('Microphone unavailable — try uploading instead.'); }
  }
  function saveVoice(mid) {
    openSheet({ title: 'Name this note', fields: [{ name: 'note', label: 'A short label', placeholder: 'e.g. For hard days' }], submitLabel: 'Keep it',
      onSubmit: function (v) { S.mutate(function (st) { ensure(st.vault, 'voice', []); st.vault.voice.push({ id: S.uid(), date: Dates.today(), mediaId: mid, note: v.note || 'Voice note' }); }); closeSheet(); render(); toast('Saved to your Vault.'); } });
  }

  /* ============================ Handlers ============================ */
  function todayP() { const st = S.get(), t = Dates.today(); st.promises[t] = st.promises[t] || {}; return st.promises[t]; }
  function celebrateMaybe(key) {
    if (todayP()[key]) {
      const lines = { cont: 'Continue. That was the whole practice today.', peace: 'Peace protected. 🤍', create: 'You made something. That counts.', diet: 'Aligned with 75kg her.', water: 'Water — your body says thank you.', noSnacks: 'You kept the agreement.', noSoda: 'No soda. Held the line.', protein: 'Protein first. Strong choice.', walked: 'You moved your body. 🤍', fruit: 'Something whole and sweet.', slept: 'Rest is discipline too.', weighed: 'Noted — kindly.' };
      if (lines[key]) toast(lines[key]);
    }
  }

  function handleAction(act, el) {
    const st = S.get();
    switch (act) {
      case 'go': go(el.getAttribute('data-route')); break;
      case 'go-settings': go('settings'); break;
      case 'go-food': go('body'); App.seg.body = 'food'; render(); break;
      case 'go-vault': go('vault'); break;
      case 'future-her': go('body'); App.seg.body = 'future'; render(); break;
      case 'seg': App.seg[el.getAttribute('data-group')] = el.getAttribute('data-val'); render(); break;

      case 'toggle-promise': { const key = el.getAttribute('data-key'); S.mutate(function () { const p = todayP(); p[key] = !p[key]; }); celebrateMaybe(key); render(); break; }
      case 'water-plus': S.mutate(function () { const t = Dates.today(); st.water[t] = (st.water[t] || 0) + 1; if (st.water[t] >= 8) todayP().water = true; }); render(); break;
      case 'water-minus': S.mutate(function () { const t = Dates.today(); st.water[t] = Math.max(0, (st.water[t] || 0) - 1); }); render(); break;

      case 'wait20': startWait20(); break;

      case 'food-check': { const q = $('#food-input') ? $('#food-input').value : ''; runFoodCheck(q); break; }
      case 'food-quick': { const q = el.getAttribute('data-q'), inp = $('#food-input'); if (inp) inp.value = q; runFoodCheck(q); break; }
      case 'food-log': { const verdict = el.getAttribute('data-verdict'), item = el.getAttribute('data-item'); if (verdict === 'no') { logOffPlanSheet(item); } else { S.mutate(function () { st.foodLog.push({ id: S.uid(), date: Dates.today(), item: item, verdict: verdict, cal: null }); }); App.seg.body = 'food'; render(); toast('Noted honestly.'); } break; }

      case 'toggle-nn': S.mutate(function () { const n = st.nonNegotiables.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (n) n.active = !n.active; }); render(); break;
      case 'del-nn': S.mutate(function () { st.nonNegotiables = st.nonNegotiables.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;
      case 'add-nn': openPicker({ title: 'Non-negotiables', suggestions: SUGGEST.nn, onAdd: function (t) { S.mutate(function () { st.nonNegotiables.push({ id: S.uid(), text: t, active: true }); }); } }); break;

      case 'log-weight': openSheet({ title: 'Log weight', subtitle: 'Weigh weekly only — kindly.', fields: [{ name: 'kg', label: 'Weight (kg)', type: 'number', step: '0.1', value: M.currentWeight() }, { name: 'date', label: 'Date', type: 'date', value: Dates.today() }], submitLabel: 'Save', onSubmit: function (v) { const kg = parseFloat(v.kg); if (!kg) { toast('Enter a number.'); return; } S.mutate(function () { const d = v.date || Dates.today(), ex = st.weights.find(function (w) { return w.date === d; }); if (ex) ex.kg = kg; else st.weights.push({ date: d, kg: kg }); todayP().weighed = true; }); closeSheet(); render(); toast('Logged. The line matters more than the number.'); } }); break;
      case 'add-measurement': openSheet({ title: 'Measurements', subtitle: 'Only what you want.', fields: [{ name: 'waist', label: 'Waist (cm)', type: 'number', step: '0.1' }, { name: 'hips', label: 'Hips (cm)', type: 'number', step: '0.1' }, { name: 'bust', label: 'Bust (cm)', type: 'number', step: '0.1' }, { name: 'thigh', label: 'Thigh (cm)', type: 'number', step: '0.1' }, { name: 'arm', label: 'Arm (cm)', type: 'number', step: '0.1' }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { st.measurements.push({ date: Dates.today(), waist: num(v.waist), hips: num(v.hips), bust: num(v.bust), thigh: num(v.thigh), arm: num(v.arm) }); }); closeSheet(); render(); } }); break;
      case 'add-photo': pickImage(async function (blob) { const mid = await Media.put(blob, { type: blob.type }); S.mutate(function () { st.photos.push({ id: S.uid(), date: Dates.today(), mediaId: mid, note: '' }); }); render(); toast('A gentle before. 🤍'); }); break;
      case 'del-photo': confirmSheet('Remove this photo?', 'It’s only on this device.', 'Remove', function () { Media.del(el.getAttribute('data-mid')); S.mutate(function () { st.photos = st.photos.filter(function (p) { return p.id !== el.getAttribute('data-id'); }); }); render(); }, true); break;

      case 'quick-gratitude': openSheet({ title: 'One good thing', subtitle: 'That’s all today asks.', fields: [{ name: 'text', label: 'Today I’m grateful for…', type: 'textarea', rows: 3 }], submitLabel: 'Keep it', onSubmit: function (v) { if (v.text) S.mutate(function () { st.beautiful.gratitude.push({ id: S.uid(), date: Dates.today(), text: v.text }); }); closeSheet(); toast('Kept. 🌸'); } }); break;

      case 'edit-diet': { const d = st.diet; const cal = d.cal || { breakfast: 285, lunch: 240, dinner: 250 }; openSheet({ title: 'Your diet', subtitle: 'One item per line. Calories are rough estimates.', fields: [{ name: 'breakfast', label: 'Breakfast', type: 'textarea', rows: 3, value: d.breakfast.join('\n') }, { name: 'bcal', label: 'Breakfast kcal (estimate)', type: 'number', value: cal.breakfast }, { name: 'lunch', label: 'Lunch', type: 'textarea', rows: 3, value: d.lunch.join('\n') }, { name: 'lcal', label: 'Lunch kcal (estimate)', type: 'number', value: cal.lunch }, { name: 'dinner', label: 'Dinner — choose one', type: 'textarea', rows: 3, value: d.dinner.join('\n') }, { name: 'dcal', label: 'Dinner kcal (estimate)', type: 'number', value: cal.dinner }, { name: 'unlimited', label: 'Unlimited', type: 'textarea', rows: 3, value: d.unlimited.join('\n') }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { st.diet = { breakfast: splitLines(v.breakfast), lunch: splitLines(v.lunch), dinner: splitLines(v.dinner), unlimited: splitLines(v.unlimited), cal: { breakfast: num(v.bcal) || 0, lunch: num(v.lcal) || 0, dinner: num(v.dcal) || 0 } }; }); closeSheet(); render(); } }); break; }

      default: if (!handleMore(act, el)) handleVaultAndSettings(act, el); break;
    }
  }

  function handleMore(act, el) {
    const st = S.get();
    switch (act) {
      case 'go-month': go('month'); return true;
      case 'go-office': go('office'); return true;
      case 'go-forever': go('forever'); return true;
      case 'hunger-jump': go('body'); App.seg.body = 'food'; render(); return true;
      case 'overwhelmed': overwhelmedSheet(); return true;
      case 'hunger-set': hungerSet(parseInt(el.getAttribute('data-n'), 10)); return true;

      case 'office-lunch': S.mutate(function () { const d = Dates.today(); st.office[d] = st.office[d] || {}; st.office[d].lunch = el.getAttribute('data-v'); }); render(); return true;
      case 'office-nothanks': S.mutate(function () { todayP().noSnacks = true; }); toast('You kept the agreement. 🤍'); render(); return true;
      case 'meal': { const k = el.getAttribute('data-m'); S.mutate(function () { const t = Dates.today(); st.meals = st.meals || {}; st.meals[t] = st.meals[t] || {}; st.meals[t][k] = !st.meals[t][k]; if (st.meals[t].breakfast && st.meals[t].lunch && st.meals[t].dinner) todayP().diet = true; }); render(); return true; }
      case 'grocery': S.mutate(function () { const t = Dates.today(); st.meals = st.meals || {}; st.meals[t] = st.meals[t] || {}; st.meals[t].groceries = !st.meals[t].groceries; }); render(); return true;

      case 'add-focus': { const m = M.monthly(); if ((m.focus || []).length >= 3) { openSheet({ title: 'Only three.', subtitle: 'This is the whole point.', bodyHTML: `<p class="ob-copy">Let’s finish these three first. Three intentional goals will change your month more than eleven half-kept ones. 🤍</p>`, submitLabel: 'You’re right', onSubmit: closeSheet }); return true; }
        openSheet({ title: 'This month’s focus', subtitle: (3 - (m.focus || []).length) + ' of 3 remaining', fields: [{ name: 'template', label: 'Pick a goal', type: 'select', options: ['— choose —'].concat(SUGGEST.focus) }, { name: 'title', label: 'Or write your own' }], submitLabel: 'Add',
          afterOpen: function (ov) { const sel = $('select[name=template]', ov), inp = $('input[name=title]', ov); if (sel && inp) sel.addEventListener('change', function () { if (sel.value && sel.value !== '— choose —') inp.value = sel.value; }); },
          onSubmit: function (v) { const t = v.title || (v.template && v.template !== '— choose —' ? v.template : ''); if (t) S.mutate(function () { M.monthly().focus.push({ id: S.uid(), title: t, done: false }); }); closeSheet(); render(); } });
        return true; }
      case 'toggle-focus': S.mutate(function () { const f = (M.monthly().focus || []).find(function (x) { return x.id === el.getAttribute('data-id'); }); if (f) f.done = !f.done; }); render(); return true;
      case 'del-focus': S.mutate(function () { const m = M.monthly(); m.focus = (m.focus || []).filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true;
      case 'set-intentional': S.mutate(function () { M.monthly().intentionalSpend = el.getAttribute('data-v'); }); render(); return true;
      case 'edit-identity': { const idn = M.monthly().identity || defaultIdentity(); openSheet({ title: 'Who am I this month?', fields: [{ name: 'am', label: 'I am… (one per line)', type: 'textarea', rows: 7, value: idn.am.join('\n') }, { name: 'dont', label: 'This month I don’t… (one per line)', type: 'textarea', rows: 4, value: idn.dont.join('\n') }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { M.monthly().identity = { am: splitLines(v.am), dont: splitLines(v.dont) }; }); closeSheet(); render(); } }); return true; }

      case 'videos-plus': S.mutate(function () { ensure(st.content, 'videos', 0); st.content.videos++; }); render(); return true;
      case 'pages-plus': S.mutate(function () { ensure(st.content, 'pagesWritten', 0); st.content.pagesWritten++; }); render(); return true;
      case 'edit-content': openSheet({ title: 'Update your content score', fields: [{ name: 'videos', label: 'Videos', type: 'number', value: st.content.videos || 0 }, { name: 'pagesWritten', label: 'Pages written', type: 'number', value: st.content.pagesWritten || 0 }, { name: 'coursesCompleted', label: 'Courses completed', type: 'number', value: st.content.coursesCompleted || 0 }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { st.content.videos = num(v.videos) || 0; st.content.pagesWritten = num(v.pagesWritten) || 0; st.content.coursesCompleted = num(v.coursesCompleted) || 0; }); closeSheet(); render(); } }); return true;

      case 'add-proj': { const kind = el.getAttribute('data-kind'); openSheet({ title: 'New ' + kind.replace(/s$/, ''), fields: [{ name: 'title', label: 'Title' }, { name: 'progress', label: 'Progress %', type: 'number', min: 0, max: 100, value: 0 }], submitLabel: 'Add', onSubmit: function (v) { if (v.title) S.mutate(function () { ensure(st.content, kind, []); st.content[kind].push({ id: S.uid(), title: v.title, progress: S.clamp(num(v.progress) || 0, 0, 100), done: (num(v.progress) || 0) >= 100 }); }); closeSheet(); render(); } }); return true; }
      case 'edit-proj': { const kind = el.getAttribute('data-kind'), it = st.content[kind].find(function (x) { return x.id === el.getAttribute('data-id'); }); if (!it) return true; openSheet({ title: it.title, fields: [{ name: 'title', label: 'Title', value: it.title }, { name: 'progress', label: 'Progress %', type: 'number', min: 0, max: 100, value: it.progress || 0 }, { name: 'done', label: 'Finished?', type: 'select', options: [{ value: 'no', label: 'In progress' }, { value: 'yes', label: 'Done ✓' }], value: it.done ? 'yes' : 'no' }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { it.title = v.title || it.title; it.progress = S.clamp(num(v.progress) || 0, 0, 100); it.done = v.done === 'yes'; if (it.done) it.progress = 100; }); closeSheet(); render(); } }); return true; }
      case 'del-proj': { const kind = el.getAttribute('data-kind'); S.mutate(function () { st.content[kind] = st.content[kind].filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true; }

      case 'add-book': openSheet({ title: 'A new book', subtitle: 'It can live in the Idea stage for as long as it needs.', fields: [{ name: 'title', label: 'Title' }, { name: 'subtitle', label: 'Subtitle (optional)' }, { name: 'stage', label: 'Stage', type: 'select', options: BOOK_STAGES, value: 'Idea' }, { name: 'description', label: 'What it’s about', type: 'textarea', rows: 4 }], submitLabel: 'Add to the vault', onSubmit: function (v) { if (v.title) S.mutate(function () { ensure(st.content, 'books', []); st.content.books.push({ id: S.uid(), title: v.title, subtitle: v.subtitle || '', stage: v.stage || 'Idea', description: v.description || '', progress: 0, done: v.stage === 'Published', notes: '' }); }); closeSheet(); render(); toast('Added to the Book Vault. 📖'); } }); return true;
      case 'edit-book': { const b = st.content.books.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (!b) return true; openSheet({ title: b.title, subtitle: 'No pressure. Move the stage whenever it’s true.', fields: [{ name: 'title', label: 'Title', value: b.title }, { name: 'subtitle', label: 'Subtitle', value: b.subtitle }, { name: 'stage', label: 'Stage', type: 'select', options: BOOK_STAGES, value: b.stage || 'Idea' }, { name: 'description', label: 'What it’s about', type: 'textarea', rows: 4, value: b.description }, { name: 'notes', label: 'Notes to self', type: 'textarea', rows: 3, value: b.notes }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { b.title = v.title || b.title; b.subtitle = v.subtitle; b.stage = v.stage || b.stage; b.description = v.description; b.notes = v.notes; b.done = (b.stage === 'Published'); }); closeSheet(); render(); } }); return true; }
      case 'del-book': { const bid = el.getAttribute('data-id'); confirmSheet('Remove this book?', 'You can always add it again.', 'Remove', function () { S.mutate(function () { st.content.books = st.content.books.filter(function (x) { return x.id !== bid; }); }); render(); }, true); return true; }

      case 'add-standard': openPicker({ title: 'My standards', subtitle: 'Tap what you want and won’t compromise.', suggestions: SUGGEST.standards, onAdd: function (t) { S.mutate(function () { ensureDating(st).standards.push({ id: S.uid(), text: t }); }); } }); return true;
      case 'del-standard': { const id = el.getAttribute('data-id'); S.mutate(function () { const d = ensureDating(st); d.standards = d.standards.filter(function (x) { return x.id !== id; }); }); render(); return true; }
      case 'add-green': openPicker({ title: 'Green flags', suggestions: SUGGEST.green, onAdd: function (t) { S.mutate(function () { ensureDating(st).green.push({ id: S.uid(), text: t }); }); } }); return true;
      case 'del-green': { const id = el.getAttribute('data-id'); S.mutate(function () { const d = ensureDating(st); d.green = d.green.filter(function (x) { return x.id !== id; }); }); render(); return true; }
      case 'add-red': openPicker({ title: 'Deal-breakers', suggestions: SUGGEST.red, onAdd: function (t) { S.mutate(function () { ensureDating(st).red.push({ id: S.uid(), text: t }); }); } }); return true;
      case 'del-red': { const id = el.getAttribute('data-id'); S.mutate(function () { const d = ensureDating(st); d.red = d.red.filter(function (x) { return x.id !== id; }); }); render(); return true; }
      case 'add-date-person': datePersonSheet(null); return true;
      case 'edit-date-person': { const p = ensureDating(st).people.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (p) datePersonSheet(p); return true; }
      case 'add-check': openPicker({ title: 'Questions to check', subtitle: 'Tap to add — or write your own.', suggestions: SUGGEST.checks, onAdd: function (t) { S.mutate(function () { ensureDating(st).checks.push({ id: S.uid(), label: t }); }); } }); return true;
      case 'del-check': { const id = el.getAttribute('data-id'); S.mutate(function () { const d = ensureDating(st); d.checks = d.checks.filter(function (x) { return x.id !== id; }); }); render(); return true; }
      case 'del-date-person': { const id = el.getAttribute('data-id'); S.mutate(function () { const d = ensureDating(st); d.people = d.people.filter(function (x) { return x.id !== id; }); }); render(); return true; }

      case 'go-dating': go('resets'); App.seg.resets = 'dating'; render(); return true;
      case 'plan-date': planDate(); return true;
      case 'log-date': openSheet({ title: 'I went on a date', subtitle: 'Log it — solo or with someone. It all counts.', fields: [{ name: 'date', label: 'When', type: 'date', value: Dates.today() }, { name: 'who', label: 'With (leave blank for a solo date)' }, { name: 'place', label: 'Where / what' }, { name: 'felt', label: 'How did it feel?', type: 'select', options: ['Amazing', 'Good', 'Okay', 'Not for me'] }], submitLabel: 'Log it', onSubmit: function (v) { S.mutate(function () { ensureDating(st).dates.push({ id: S.uid(), date: v.date || Dates.today(), who: v.who || '', place: v.place || '', felt: v.felt || '' }); }); closeSheet(); render(); toast('You showed up for yourself. 💗'); } }); return true;
      case 'del-date': { const id = el.getAttribute('data-id'); S.mutate(function () { const d = ensureDating(st); d.dates = d.dates.filter(function (x) { return x.id !== id; }); }); render(); return true; }
      case 'set-date-goal': openSheet({ title: 'Monthly date goal', subtitle: 'How many intentional dates a month?', fields: [{ name: 'goal', label: 'Dates per month', type: 'number', value: ensureDating(st).goal }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { ensureDating(st).goal = num(v.goal) || 1; }); closeSheet(); render(); } }); return true;

      case 'log-period': openSheet({ title: 'Log period start', subtitle: 'No judgement — just knowledge.', fields: [{ name: 'date', label: 'Start date', type: 'date', value: Dates.today() }], submitLabel: 'Save', onSubmit: function (v) { const d = v.date || Dates.today(); S.mutate(function () { st.cycle = st.cycle || { periods: [], avgCycle: 28, avgPeriod: 5 }; if (st.cycle.periods.indexOf(d) === -1) st.cycle.periods.push(d); }); closeSheet(); render(); toast('Logged, kindly.'); } }); return true;
      case 'edit-cycle': openSheet({ title: 'Cycle settings', fields: [{ name: 'avgCycle', label: 'Average cycle length (days)', type: 'number', value: (st.cycle && st.cycle.avgCycle) || 28 }, { name: 'avgPeriod', label: 'Average period length (days)', type: 'number', value: (st.cycle && st.cycle.avgPeriod) || 5 }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { st.cycle = st.cycle || { periods: [] }; st.cycle.avgCycle = num(v.avgCycle) || 28; st.cycle.avgPeriod = num(v.avgPeriod) || 5; }); closeSheet(); render(); } }); return true;
      case 'del-period': { const d = el.getAttribute('data-d'); S.mutate(function () { st.cycle.periods = (st.cycle.periods || []).filter(function (x) { return x !== d; }); }); render(); return true; }
      case 'add-vision': pickImage(async function (blob) { const mid = await Media.put(blob, { type: blob.type }); S.mutate(function () { ensure(st, 'vision', []); st.vision.push({ id: S.uid(), date: Dates.today(), mediaId: mid }); }); render(); toast('Added to your vision board. 🤍'); }); return true;
      case 'del-vision': { const id = el.getAttribute('data-id'), mid = el.getAttribute('data-mid'); confirmSheet('Remove this image?', '', 'Remove', function () { Media.del(mid); S.mutate(function () { st.vision = (st.vision || []).filter(function (x) { return x.id !== id; }); }); render(); }, true); return true; }
      case 'share-progress': shareProgress(); return true;
      case 'note-offplan': logOffPlanSheet(''); return true;

      case 'edit-money': openSheet({ title: 'The money page', fields: [{ name: 'salary', label: 'Salary (₦)', type: 'number', value: st.wealth.salary }, { name: 'rentGoal', label: 'Rent goal (₦)', type: 'number', value: st.wealth.rentGoal }, { name: 'rentSavings', label: 'Rent saved so far (₦)', type: 'number', value: st.wealth.rentSavings }, { name: 'emergencyFund', label: 'Emergency fund (₦)', type: 'number', value: st.wealth.emergencyFund }, { name: 'carFund', label: 'Car fund (₦)', type: 'number', value: st.wealth.carFund }, { name: 'transport', label: 'Transport (₦)', type: 'number', value: st.wealth.transport }, { name: 'food', label: 'Food (₦)', type: 'number', value: st.wealth.food }, { name: 'gifts', label: 'Gifts (₦)', type: 'number', value: st.wealth.gifts }, { name: 'perfumeFund', label: 'Perfume fund (₦)', type: 'number', value: st.wealth.perfumeFund }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { const w = st.wealth; w.salary = num(v.salary); w.rentGoal = num(v.rentGoal); w.rentSavings = num(v.rentSavings) || 0; w.emergencyFund = num(v.emergencyFund) || 0; w.carFund = num(v.carFund) || 0; w.transport = num(v.transport) || 0; w.food = num(v.food) || 0; w.gifts = num(v.gifts) || 0; w.perfumeFund = num(v.perfumeFund) || 0; }); closeSheet(); render(); } }); return true;
      case 'add-expense': openSheet({ title: 'Add expense', subtitle: 'What did you spend?', fields: [{ name: 'amount', label: 'Amount (₦)', type: 'number' }, { name: 'category', label: 'Category', type: 'select', options: ['Transport', 'Food', 'Gifts', 'Airtime / Data', 'Shopping', 'Bills', 'Health', 'Fun', 'Other'] }, { name: 'note', label: 'Note (optional)' }, { name: 'date', label: 'Date', type: 'date', value: Dates.today() }], submitLabel: 'Add', onSubmit: function (v) { const amt = num(v.amount); if (!amt) { toast('Enter an amount.'); return; } S.mutate(function () { ensure(st.wealth, 'expenses', []); st.wealth.expenses.push({ id: S.uid(), date: v.date || Dates.today(), amount: amt, category: v.category || 'Other', note: v.note || '' }); }); closeSheet(); render(); } }); return true;
      case 'del-expense': { const id = el.getAttribute('data-id'); S.mutate(function () { st.wealth.expenses = (st.wealth.expenses || []).filter(function (x) { return x.id !== id; }); }); render(); return true; }
      case 'add-sub': openSheet({ title: 'Subscription', fields: [{ name: 'name', label: 'Name' }, { name: 'amount', label: 'Monthly (₦)', type: 'number' }], submitLabel: 'Add', onSubmit: function (v) { if (v.name) S.mutate(function () { st.wealth.subscriptions.push({ id: S.uid(), name: v.name, amount: num(v.amount) || 0 }); }); closeSheet(); render(); } }); return true;
      case 'del-sub': S.mutate(function () { st.wealth.subscriptions = st.wealth.subscriptions.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true;
      case 'add-fgoal': openSheet({ title: 'Financial goal', fields: [{ name: 'title', label: 'Goal' }, { name: 'target', label: 'Target (₦, optional)', type: 'number' }], submitLabel: 'Add', onSubmit: function (v) { if (v.title) S.mutate(function () { st.wealth.goals.push({ id: S.uid(), title: v.title, target: num(v.target), done: false }); }); closeSheet(); render(); } }); return true;
      case 'toggle-fgoal': S.mutate(function () { const g = st.wealth.goals.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (g) g.done = !g.done; }); render(); return true;
      case 'del-fgoal': S.mutate(function () { st.wealth.goals = st.wealth.goals.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true;

      case 'toggle-commit': S.mutate(function () { const c = (st.love.commitments || []).find(function (x) { return x.id === el.getAttribute('data-id'); }); if (c) c.done = !c.done; }); render(); return true;
      case 'add-commit': quickAdd('A new intention', 'I will…', function (t) { ensure(st.love, 'commitments', []); st.love.commitments.push({ id: S.uid(), text: t, done: false }); }); return true;
      case 'del-commit': S.mutate(function () { st.love.commitments = (st.love.commitments || []).filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true;

      case 'add-person': openSheet({ title: 'Someone you love', fields: [{ name: 'name', label: 'Name' }, { name: 'relation', label: 'Relationship', type: 'select', options: ['Family', 'Friend', 'Partner', 'Mentor', 'Other'] }, { name: 'birthday', label: 'Birthday (optional)', type: 'date' }, { name: 'cadence', label: 'Reach out every … days', type: 'number', value: 14 }], submitLabel: 'Add', onSubmit: function (v) { if (v.name) S.mutate(function () { ensure(st, 'people', []); st.people.push({ id: S.uid(), name: v.name, relation: v.relation, birthday: v.birthday || '', cadence: num(v.cadence) || 14, lastContacted: null }); }); closeSheet(); render(); } }); return true;
      case 'edit-person': { const pn = (st.people || []).find(function (x) { return x.id === el.getAttribute('data-id'); }); if (!pn) return true; openSheet({ title: pn.name, fields: [{ name: 'name', label: 'Name', value: pn.name }, { name: 'relation', label: 'Relationship', type: 'select', options: ['Family', 'Friend', 'Partner', 'Mentor', 'Other'], value: pn.relation }, { name: 'birthday', label: 'Birthday', type: 'date', value: pn.birthday }, { name: 'cadence', label: 'Reach out every … days', type: 'number', value: pn.cadence || 14 }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { pn.name = v.name || pn.name; pn.relation = v.relation; pn.birthday = v.birthday || ''; pn.cadence = num(v.cadence) || 14; }); closeSheet(); render(); } }); return true; }
      case 'del-person': S.mutate(function () { st.people = (st.people || []).filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true;
      case 'reached': { const id = el.getAttribute('data-id'); S.mutate(function () { const pn = (st.people || []).find(function (x) { return x.id === id; }); if (pn) pn.lastContacted = Dates.today(); }); toast('Lovely. Connection kept. 🤍'); render(); return true; }

      case 'set-happy': S.mutate(function () { st.softlife.happiness[Dates.today()] = parseInt(el.getAttribute('data-n'), 10); }); render(); return true;
      case 'add-rest': quickAdd('Rest & sleep', 'What restored you?', function (t) { st.softlife.weekendReset.push({ id: S.uid(), date: Dates.today(), text: t }); }); return true;
      case 'add-solo': quickAdd('Solo date', 'What did you do, just for you?', function (t) { st.softlife.soloDates.push({ id: S.uid(), date: Dates.today(), text: t }); }); return true;
      case 'add-moment': quickAdd('Travel / moment', 'A place or a small joy', function (t) { st.softlife.moments.push({ id: S.uid(), date: Dates.today(), text: t }); }); return true;

      case 'toggle-forever': S.mutate(function () { const g = st.forever.goals.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (g) g.done = !g.done; }); render(); return true;
      case 'add-forever': quickAdd('Project Forever', 'What’s next for her?', function (t) { st.forever.goals.push({ id: S.uid(), text: t, done: false }); }); return true;
      case 'del-forever': S.mutate(function () { st.forever.goals = st.forever.goals.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true;

      default:
        if (act.indexOf('add-love:') === 0) { const key = act.split(':')[1];
          if (key === 'boundaries') openPicker({ title: 'Boundaries', suggestions: SUGGEST.boundaries, onAdd: function (t) { S.mutate(function () { st.love.boundaries.push({ id: S.uid(), date: Dates.today(), text: t }); }); } });
          else quickAdd('Add to ' + key, 'What would you like to keep?', function (t) { st.love[key].push({ id: S.uid(), date: Dates.today(), text: t }); });
          return true; }
        if (act === 'del-love') { const key = el.getAttribute('data-key'); S.mutate(function () { st.love[key] = st.love[key].filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true; }
        if (act.indexOf('add-beautiful:') === 0) { const key = act.split(':')[1];
          if (key === 'gratitude') openPicker({ title: 'Gratitude', subtitle: 'Tap what’s true today.', suggestions: SUGGEST.gratitude, onAdd: function (t) { S.mutate(function () { st.beautiful.gratitude.push({ id: S.uid(), date: Dates.today(), text: t }); }); } });
          else quickAdd('Add', 'Write it down', function (t) { st.beautiful[key].push({ id: S.uid(), date: Dates.today(), text: t }); });
          return true; }
        if (act === 'del-beautiful') { const key = el.getAttribute('data-key'); S.mutate(function () { st.beautiful[key] = st.beautiful[key].filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); return true; }
        return false;
    }
  }

  function handleVaultAndSettings(act, el) {
    const st = S.get();
    switch (act) {
      case 'add-journal': openSheet({ title: 'New journal entry', fields: [{ name: 'title', label: 'Title (optional)' }, { name: 'body', label: 'Today…', type: 'textarea', rows: 7 }], submitLabel: 'Keep it', onSubmit: function (v) { if (v.body || v.title) S.mutate(function () { st.vault.journals.push({ id: S.uid(), date: Dates.today(), title: v.title, body: v.body }); }); closeSheet(); render(); toast('Held safely.'); } }); break;
      case 'open-journal': { const j = st.vault.journals.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (j) openSheet({ title: j.title || 'Journal', subtitle: Dates.prettyLong(j.date), bodyHTML: `<div class="reader">${esc(j.body || '').replace(/\n/g, '<br>')}</div>`, submitLabel: 'Close', onSubmit: closeSheet }); break; }
      case 'add-letter': openSheet({ title: 'Letter to future me', fields: [{ name: 'title', label: 'Title', placeholder: 'To future me' }, { name: 'body', label: 'Dear her…', type: 'textarea', rows: 8 }], submitLabel: 'Seal it', onSubmit: function (v) { if (v.body) S.mutate(function () { st.vault.letters.push({ id: S.uid(), date: Dates.today(), title: v.title, body: v.body }); }); closeSheet(); render(); toast('Sealed with love. 💌'); } }); break;
      case 'open-letter': { const l = st.vault.letters.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (l) openSheet({ title: l.title || 'To future me', subtitle: Dates.prettyLong(l.date), bodyHTML: `<div class="reader letter">${esc(l.body || '').replace(/\n/g, '<br>')}</div>`, submitLabel: 'Close', onSubmit: closeSheet }); break; }
      case 'add-dream': quickAdd('A dream', 'Name it out loud', function (t) { st.vault.dreams.push({ id: S.uid(), date: Dates.today(), text: t }); }); break;
      case 'del-dream': S.mutate(function () { st.vault.dreams = st.vault.dreams.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); st.vault.goals = st.vault.goals.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;
      case 'rec-toggle': toggleRecord(); break;
      case 'play-voice': Media.url(el.getAttribute('data-mid')).then(function (u) { if (u) { new Audio(u).play(); toast('Playing…'); } }); break;
      case 'del-voice': confirmSheet('Delete this note?', '', 'Delete', function () { Media.del(el.getAttribute('data-mid')); S.mutate(function () { st.vault.voice = st.vault.voice.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); }, true); break;
      case 'add-vault-photo': pickImage(async function (blob) { const mid = await Media.put(blob, { type: blob.type }); S.mutate(function () { ensure(st.vault, 'photos', []); st.vault.photos.push({ id: S.uid(), date: Dates.today(), mediaId: mid }); }); render(); }); break;
      case 'del-vault-photo': confirmSheet('Remove this photo?', '', 'Remove', function () { Media.del(el.getAttribute('data-mid')); S.mutate(function () { st.vault.photos = st.vault.photos.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); }, true); break;

      case 'report': { const out = $('#report-out'); if (out) { out.innerHTML = generateReport(el.getAttribute('data-kind')); out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } break; }

      case 'edit-profile': openSheet({ title: 'You', fields: [{ name: 'name', label: 'Name', value: st.profile.name }, { name: 'heightCm', label: 'Height (cm)', type: 'number', value: st.profile.heightCm }, { name: 'goalWeight', label: 'Goal weight (kg)', type: 'number', step: '0.1', value: st.profile.goalWeight }, { name: 'targetMonths', label: 'Timeline (months)', type: 'number', value: st.profile.targetMonths || 6 }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { st.profile.name = v.name || st.profile.name; st.profile.heightCm = num(v.heightCm) || st.profile.heightCm; st.profile.goalWeight = num(v.goalWeight) || st.profile.goalWeight; st.profile.targetMonths = num(v.targetMonths) || st.profile.targetMonths; }); closeSheet(); render(); } }); break;
      case 'set-theme': S.mutate(function () { st.settings.theme = el.getAttribute('data-val'); }); applyTheme(); render(); break;
      case 'set-skin': S.mutate(function () { st.settings.skin = el.getAttribute('data-val'); }); applyTheme(); render(); break;
      case 'choose-bg': pickImage(async function (blob) { const mid = await Media.put(blob, { type: blob.type }); S.mutate(function () { st.settings.bgMediaId = mid; }); render(); toast('Home background set. 🤍'); }); break;
      case 'remove-bg': { const old = st.settings.bgMediaId; S.mutate(function () { st.settings.bgMediaId = null; }); if (old) Media.del(old); render(); toast('Background removed.'); break; }
      case 'toggle-reminders': toggleReminders(); break;
      case 'export-data': Data.download(); toast('Backup downloaded.'); break;
      case 'import-data': doImport(); break;
      case 'reset-data': confirmSheet('Start the space fresh?', 'This clears entries on this device. Export a backup first if unsure.', 'Start fresh', function () { Data.reset(); Media.all().then(function (all) { all.forEach(function (r) { Media.del(r.id); }); }); go('today'); }, true); break;
      case 'sheet-cancel': closeSheet(); break;
    }
  }

  /* ============================ Theme, reminders, import, onboarding ============================ */
  function applyTheme() {
    const t = S.get().settings.theme;
    const dark = t === 'dark' || (t === 'system' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-skin', S.get().settings.skin || 'rose');
    const meta = $('#theme-color'); if (meta) meta.setAttribute('content', dark ? '#171215' : '#fbf7f4');
  }
  function toggleReminders() {
    const st = S.get();
    if (!st.settings.reminders) {
      if (global.Notification && Notification.permission !== 'granted') {
        Notification.requestPermission().then(function (perm) { S.mutate(function () { st.settings.reminders = perm === 'granted'; }); if (perm === 'granted') new Notification('Project 75', { body: 'I’ll gently remind you. Welcome home. 🤍' }); else toast('Notifications are off in your browser settings.'); render(); });
        return;
      }
      S.mutate(function () { st.settings.reminders = true; });
    } else { S.mutate(function () { st.settings.reminders = false; }); }
    render();
  }
  function fireReminder(r) {
    try { if (global.Notification && Notification.permission === 'granted') new Notification(r.title, { body: r.body, tag: r.id }); } catch (e) {}
    if (document.visibilityState === 'visible') toast(r.title);
  }
  function checkReminders() {
    const st = S.get();
    if (!st.settings.reminders) return;
    const now = new Date(), today = Dates.today(); let due = [];
    REMINDERS.forEach(function (r) {
      const parts = r.time.split(':').map(Number), flag = 'p75:rem:' + r.id + ':' + today;
      if (localStorage.getItem(flag)) return;
      if (now.getHours() > parts[0] || (now.getHours() === parts[0] && now.getMinutes() >= parts[1])) { localStorage.setItem(flag, '1'); due.push(r); }
    });
    if (due.length) fireReminder(due[due.length - 1]); // only the most recent — no pile-up
  }
  function doImport() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', function () { const f = inp.files && inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = function () { try { Data.import(r.result); applyTheme(); go('today'); toast('Your data is back. Welcome home.'); } catch (e) { toast('That file couldn’t be read.'); } }; r.readAsText(f); }); inp.click();
  }
  function maybeOnboard() {
    const st = S.get(); if (st.settings.onboarded) return;
    openSheet({ title: 'Welcome home.', subtitle: 'Project 75 — Returning to Her',
      bodyHTML: `<p class="ob-copy">This is not a weight-loss app. It’s a soft place to become a healthier, steadier, more intentional woman — over years, not weeks. Let’s set your anchors. You can change these anytime.</p>`,
      fields: [{ name: 'name', label: 'What should I call you?', value: st.profile.name }, { name: 'startWeight', label: 'Starting weight (kg)', type: 'number', step: '0.1', value: 96 }, { name: 'goalWeight', label: 'Goal weight (kg)', type: 'number', step: '0.1', value: 75 }, { name: 'heightCm', label: 'Height (cm)', type: 'number', value: 183 }],
      submitLabel: 'Begin, gently', onSubmit: function (v) { S.mutate(function () { st.profile.name = v.name || 'Her'; st.profile.startWeight = num(v.startWeight) || 96; st.profile.goalWeight = num(v.goalWeight) || 75; st.profile.heightCm = num(v.heightCm) || 183; st.settings.onboarded = true; st.weights = [{ date: st.profile.startDate, kg: st.profile.startWeight }]; }); closeSheet(); render(); } });
    const cancel = $('#sheet-form .btn.ghost'); if (cancel) cancel.textContent = 'Skip for now';
  }
  function confetti() {
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('div'); c.className = 'confetti';
    const colors = ['#F3B7C6', '#E38AA0', '#D8B36A', '#C7E6C9', '#B7A6C4', '#F7D9C7'];
    for (let i = 0; i < 48; i++) { const p = document.createElement('i'); p.style.left = (Math.random() * 100) + '%'; p.style.background = colors[i % colors.length]; p.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's'; p.style.setProperty('--r', (Math.random() * 360) + 'deg'); c.appendChild(p); }
    document.body.appendChild(c); setTimeout(function () { c.remove(); }, 3200);
  }
  function showUnlock(list) {
    const a = list[0]; confetti();
    openSheet({ title: 'A milestone, softly', bodyHTML: `<div class="unlock"><div class="unlock-icon">${a.icon}</div><div class="unlock-title">${esc(a.title)}</div><div class="unlock-note">${esc(a.note)}</div>${list.length > 1 ? `<div class="muted small">+${list.length - 1} more earned</div>` : ''}</div>`, submitLabel: 'Beautiful', onSubmit: closeSheet });
  }

  /* Draw a soft-luxury progress card and share/save it as an image. */
  function shareProgress() {
    const W = 1080, H = 1350, cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
    const x = cvs.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#FCE9EC'); g.addColorStop(1, '#F7D9C7'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center';
    x.fillStyle = '#C6798A'; x.font = '700 64px Georgia, serif'; x.fillText('PROJECT 75', W / 2, 155);
    x.font = 'italic 40px Georgia, serif'; x.fillText('Returning to Her', W / 2, 214);
    const cx = W / 2, cy = 520, r = 190, pct = M.percentToGoal();
    x.lineWidth = 34; x.lineCap = 'round';
    x.strokeStyle = 'rgba(198,121,138,0.18)'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    const grd = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r); grd.addColorStop(0, '#F3B7C6'); grd.addColorStop(1, '#E38AA0');
    x.strokeStyle = grd; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pct / 100)); x.stroke();
    x.fillStyle = '#3B2F31'; x.font = '700 100px -apple-system, Arial, sans-serif'; x.fillText(pct + '%', cx, cy + 22);
    x.fillStyle = '#6E5E62'; x.font = '400 34px -apple-system, Arial, sans-serif'; x.fillText('to goal', cx, cy + 76);
    const stats = [['Current', M.currentWeight() + 'kg'], ['Lost', M.totalLost() + 'kg'], ['Promise', M.promiseScore(30) + '%']];
    stats.forEach(function (s, i) { const sx = W / 2 + (i - 1) * 310; x.fillStyle = '#C6798A'; x.font = '700 60px -apple-system, Arial, sans-serif'; x.fillText(s[1], sx, 900); x.fillStyle = '#6E5E62'; x.font = '400 30px -apple-system, Arial, sans-serif'; x.fillText(s[0], sx, 948); });
    x.fillStyle = '#3B2F31'; x.font = 'italic 40px Georgia, serif'; x.fillText(M.streak() + '-day streak, gently counted', W / 2, 1050);
    x.fillStyle = '#C6798A'; x.font = 'italic 46px Georgia, serif'; x.fillText('A beautiful life is also a goal.', W / 2, 1240);
    cvs.toBlob(function (blob) {
      if (!blob) { toast('Could not create the card.'); return; }
      const file = new File([blob], 'project-75-progress.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Project 75', text: 'My progress 🤍' }).catch(function () {}); }
      else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'project-75-progress.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); toast('Saved your progress card. 🤍'); }
    }, 'image/png');
  }

  /* ============================ Boot ============================ */
  function bindEvents() {
    document.addEventListener('click', function (e) { const el = e.target.closest('[data-act]'); if (!el) return; handleAction(el.getAttribute('data-act'), el); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'food-input') { e.preventDefault(); runFoodCheck(e.target.value); } });
    document.addEventListener('change', function (e) { if (e.target && e.target.getAttribute && e.target.getAttribute('data-act') === 'set-remind-time') { S.mutate(function (st) { st.settings.reminderTime = e.target.value; }); toast('Reminder time updated.'); } });
    global.addEventListener('p75:unlocked', function (e) { showUnlock(e.detail); });
    if (global.matchMedia) { const mq = global.matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { if (S.get().settings.theme === 'system') applyTheme(); }); }
  }
  function boot() {
    S.load(); applyTheme(); renderHeader(); bindEvents(); Ach.evaluate(); render(); maybeOnboard();
    // Ask the browser not to evict our data — keeps history through storage pressure.
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
    setTimeout(function () { S.mutate(function (st) { st.settings.lastOpen = Dates.today(); }); }, 800);
    checkReminders();
    setInterval(checkReminders, 300000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkReminders(); else S.save(); });
    window.addEventListener('pagehide', function () { S.save(); });
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('service-worker.js').catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  global.P75.App = { go: go, render: render };
})(window);
