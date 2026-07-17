/* =====================================================================
   PROJECT 75 — app.js
   Views, routing, sheets, and every interaction.
   Depends on: store.js, charts.js, food.js
   ===================================================================== */
(function (global) {
  'use strict';

  const S = global.P75.Store;
  const Dates = global.P75.Dates;
  const M = global.P75.Metrics;
  const Charts = global.P75.Charts;
  const Media = global.P75.Media;
  const Food = global.P75.Food;
  const Ach = global.P75.Achievements;
  const Data = global.P75.Data;

  /* ---------------- tiny DOM helpers ---------------- */
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ensure(o, k, def) { if (o[k] === undefined) o[k] = def; return o[k]; }
  function money(n) {
    if (n == null || n === '') return '—';
    return '₦' + Number(n).toLocaleString();
  }

  /* ---------------- gentle language ---------------- */
  const RETURN_LINES = [
    'Welcome home. Nothing is lost. Today still counts.',
    'You’re back. That’s the whole thing. Continue.',
    'No catching up needed. One intentional decision still counts.',
    'Welcome home. Let’s keep the promise, softly.'
  ];
  const SOFT_LINES = [
    'Progress still counts.',
    'Keep going.',
    'Tomorrow still counts.',
    'One intentional decision still counts.',
    'Continue.'
  ];
  function pick(arr, seed) { return arr[Math.abs(seed || Date.now()) % arr.length]; }

  const App = { route: 'today', seg: {}, rec: null };

  /* ================================================================
     Toasts, sheets & modals
     ================================================================ */
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function closeSheet() {
    const o = $('#sheet-overlay');
    if (o) { o.classList.remove('open'); setTimeout(function () { o.remove(); }, 240); }
  }

  /* openSheet({title, subtitle, fields, submitLabel, onSubmit, bodyHTML}) */
  function openSheet(cfg) {
    closeSheet();
    const overlay = document.createElement('div');
    overlay.id = 'sheet-overlay';
    overlay.className = 'sheet-overlay';
    const fieldsHTML = (cfg.fields || []).map(function (f) {
      const val = f.value == null ? '' : f.value;
      if (f.type === 'textarea') {
        return `<label class="fld"><span>${esc(f.label)}</span>
          <textarea name="${f.name}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea></label>`;
      }
      if (f.type === 'select') {
        return `<label class="fld"><span>${esc(f.label)}</span>
          <select name="${f.name}">${(f.options || []).map(function (o) {
            const v = o.value != null ? o.value : o; const t = o.label != null ? o.label : o;
            return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`;
          }).join('')}</select></label>`;
      }
      return `<label class="fld"><span>${esc(f.label)}</span>
        <input name="${f.name}" type="${f.type || 'text'}" ${f.step ? 'step="' + f.step + '"' : ''}
          ${f.min != null ? 'min="' + f.min + '"' : ''} placeholder="${esc(f.placeholder || '')}" value="${esc(val)}"></label>`;
    }).join('');

    overlay.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet-grip"></div>
        <div class="sheet-head">
          <h3>${esc(cfg.title || '')}</h3>
          ${cfg.subtitle ? `<p>${esc(cfg.subtitle)}</p>` : ''}
        </div>
        <form id="sheet-form" class="sheet-body">
          ${cfg.bodyHTML || ''}
          ${fieldsHTML}
          <div class="sheet-actions">
            <button type="button" class="btn ghost" data-act="sheet-cancel">Not now</button>
            <button type="submit" class="btn primary">${esc(cfg.submitLabel || 'Save')}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('open'); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSheet(); });
    $('#sheet-form', overlay).addEventListener('submit', function (e) {
      e.preventDefault();
      const values = {};
      $$('input,textarea,select', overlay).forEach(function (el) {
        if (el.name) values[el.name] = el.value.trim();
      });
      if (cfg.onSubmit) cfg.onSubmit(values, overlay);
    });
    if (cfg.afterOpen) cfg.afterOpen(overlay);
    return overlay;
  }

  function confirmSheet(title, subtitle, okLabel, onOk, danger) {
    openSheet({
      title: title, subtitle: subtitle, submitLabel: okLabel || 'Yes',
      onSubmit: function () { closeSheet(); onOk(); }
    });
    if (danger) { const b = $('#sheet-form .btn.primary'); if (b) b.classList.add('danger'); }
  }

  /* ================================================================
     Rendering primitives
     ================================================================ */
  function card(inner, cls) { return `<section class="card ${cls || ''}">${inner}</section>`; }
  function tile(label, value, sub, cls) {
    return `<div class="tile ${cls || ''}"><div class="tile-val">${value}</div>
      <div class="tile-label">${esc(label)}</div>${sub ? `<div class="tile-sub">${esc(sub)}</div>` : ''}</div>`;
  }
  function sectionTitle(t, action) {
    return `<div class="sec-title"><h2>${esc(t)}</h2>${action || ''}</div>`;
  }
  function addBtn(act, extra) { return `<button class="add-btn" data-act="${act}" ${extra || ''}>＋</button>`; }
  function listEmpty(msg) { return `<div class="empty">${esc(msg)}</div>`; }

  /* ================================================================
     Header + greeting
     ================================================================ */
  function greeting() {
    const h = new Date().getHours();
    let big = 'Good evening.';
    if (h < 12) big = 'Good morning.'; else if (h < 17) big = 'Good afternoon.';
    return big;
  }

  function renderHeader() {
    const st = S.get();
    const gap = Dates.diffDays(st.settings.lastOpen, Dates.today());
    const returning = gap >= 2;
    $('#appbar').innerHTML = `
      <div class="brand">
        <div class="brand-mark">75</div>
        <div class="brand-text"><b>Project 75</b><span>Returning to Her</span></div>
      </div>
      <button class="icon-btn" data-act="go-settings" aria-label="Settings">⚙︎</button>`;
    return returning;
  }

  /* ================================================================
     VIEW: TODAY (home)
     ================================================================ */
  const PLAN = [
    { key: 'water',  title: 'Drink Water',         hint: 'Half your body, mostly water.' },
    { key: 'diet',   title: "Follow Today's Diet",  hint: 'Protein first. As agreed.' },
    { key: 'create', title: 'Create Something',     hint: 'A sentence. A post. Anything.' },
    { key: 'peace',  title: 'Protect Your Peace',   hint: 'Say no to one draining thing.' },
    { key: 'cont',   title: 'Continue',             hint: 'That is the whole practice.' }
  ];

  function viewToday() {
    const st = S.get();
    const today = Dates.today();
    const p = st.promises[today] || {};
    const kept = M.dayScore(today);
    const score = M.promiseScore(30);
    const streak = M.streak();
    const cups = st.water[today] || 0;
    const gap = Dates.diffDays(st.settings.lastOpen, Dates.today());
    const returning = gap >= 2;

    const planRows = PLAN.map(function (item) {
      const on = !!p[item.key];
      return `<button class="plan-row ${on ? 'done' : ''}" data-act="toggle-promise" data-key="${item.key}">
        <span class="check">${on ? '✓' : ''}</span>
        <span class="plan-text"><b>${esc(item.title)}</b><i>${esc(item.hint)}</i></span>
      </button>`;
    }).join('');

    const ringHTML = Charts.ring({
      percent: Math.round((kept / 6) * 100), size: 148, stroke: 13,
      gradient: ['#F3B7C6', '#E38AA0'],
      label: `<b>${kept}<span>/6</span></b>`, sub: 'promises kept'
    });

    return `
      <div class="view today">
        <header class="hero">
          <h1 class="hero-big">${esc(greeting())}</h1>
          <p class="hero-small">Welcome home.</p>
          ${returning ? `<div class="return-banner">${esc(pick(RETURN_LINES, gap))}</div>` : ''}
        </header>

        ${card(`
          <div class="today-top">
            ${ringHTML}
            <div class="today-stats">
              ${tile('Promise Score', score + '%', 'last 30 days')}
              ${tile('Streak', streak + (streak === 1 ? ' day' : ' days'), 'gently counted')}
            </div>
          </div>
        `, 'today-hero')}

        ${card(`
          <div class="sec-title"><h2>Today’s Plan</h2></div>
          <div class="plan-list">${planRows}</div>
          <div class="water-row">
            <div class="water-label">Water <b>${cups}</b> / 8 cups</div>
            <div class="water-actions">
              <button class="chip-btn" data-act="water-minus">－</button>
              <button class="chip-btn strong" data-act="water-plus">＋ cup</button>
            </div>
          </div>
          <label class="mini-toggle ${p.noSnacks ? 'on' : ''}" data-act="toggle-promise" data-key="noSnacks">
            <span class="check">${p.noSnacks ? '✓' : ''}</span> I avoided office snacks today
          </label>
          <p class="enough">That is enough.</p>
        `)}

        ${card(`
          <div class="quick-grid">
            <button class="quick" data-act="go-food"><span>🍽️</span>Should I eat this?</button>
            <button class="quick" data-act="wait20"><span>⏳</span>Wait 20 minutes</button>
            <button class="quick" data-act="future-her"><span>🤍</span>What would 75kg her do?</button>
            <button class="quick" data-act="quick-gratitude"><span>🌸</span>One good thing</button>
          </div>
        `, 'quiet')}

        <p class="soft-close">${esc(pick(SOFT_LINES, kept + streak))}</p>
      </div>`;
  }

  /* ================================================================
     VIEW: BODY  (segmented: Weight / Food / Future Her)
     ================================================================ */
  function viewBody() {
    const seg = App.seg.body || 'weight';
    const inner = seg === 'food' ? bodyFood() : seg === 'future' ? bodyFuture() : bodyWeight();
    return `
      <div class="view">
        <header class="page-head"><h1>Your Body</h1><p>Kind, honest, unhurried.</p></header>
        <div class="segmented" data-seg="body">
          <button class="${seg === 'weight' ? 'on' : ''}" data-act="seg" data-group="body" data-val="weight">Weight</button>
          <button class="${seg === 'food' ? 'on' : ''}" data-act="seg" data-group="body" data-val="food">Food</button>
          <button class="${seg === 'future' ? 'on' : ''}" data-act="seg" data-group="body" data-val="future">Future Her</button>
        </div>
        ${inner}
      </div>`;
  }

  function bodyWeight() {
    const st = S.get();
    const cur = M.currentWeight(), start = M.startWeight(), goal = M.goalWeight();
    const remaining = M.remaining(), lost = M.totalLost();
    const bmi = M.bmi(), bmiLabel = M.bmiLabel(bmi);
    const fc = M.forecast();
    const pct = M.percentToGoal();

    const chart = Charts.weightChart(M.sortedWeights(), {
      goal: goal,
      forecast: (fc && !fc.arrived && !fc.unknown) ? { arrivalKey: fc.arrivalKey } : null
    });

    let forecastLine;
    if (fc.arrived) forecastLine = 'You’ve arrived at her. 🤍';
    else if (fc.unknown) forecastLine = 'Your forecast appears once your line has a direction. Keep logging weekly.';
    else forecastLine = `At about ${Math.abs(fc.weeklyRate)}kg / week, 75kg her arrives around <b>${fc.arrivalPretty}</b>.`;

    const ringHTML = Charts.ring({
      percent: pct, size: 128, stroke: 12, gradient: ['#F3B7C6', '#E38AA0'],
      label: `<b>${pct}<span>%</span></b>`, sub: 'to goal'
    });

    const photos = st.photos.slice().reverse();
    const measures = st.measurements.slice().reverse();

    return `
      ${card(`
        <div class="weight-hero">
          ${ringHTML}
          <div class="weight-grid">
            ${tile('Current', cur + 'kg')}
            ${tile('Goal', goal + 'kg')}
            ${tile('Remaining', remaining + 'kg')}
            ${tile('Lost', lost + 'kg', 'from ' + start + 'kg')}
          </div>
        </div>
        <div class="cta-row">
          <button class="btn primary" data-act="log-weight">Log weight</button>
          <span class="cta-note">Weigh weekly only — the scale isn’t the story.</span>
        </div>
      `, 'weight-summary')}

      ${card(`${sectionTitle('Your line')}${chart}
        <div class="forecast-note">${forecastLine}</div>`)}

      ${card(`
        <div class="bmi-row">
          <div>${tile('BMI', bmi, bmiLabel)}</div>
          <div class="bmi-bar"><div class="bmi-fill" style="width:${Math.min(100, (bmi / 40) * 100)}%"></div></div>
        </div>`)}

      ${card(`${sectionTitle('Measurements', addBtn('add-measurement'))}
        ${measures.length ? `<div class="rows">` + measures.map(function (m) {
          const parts = ['waist', 'hips', 'bust', 'thigh', 'arm'].filter(function (k) { return m[k]; })
            .map(function (k) { return k + ' ' + m[k] + 'cm'; }).join(' · ');
          return `<div class="row"><div><b>${esc(Dates.prettyShort(m.date))}</b><i>${esc(parts || '—')}</i></div></div>`;
        }).join('') + `</div>` : listEmpty('Optional — a tape measure tells the truth the scale hides.')}`)}

      ${card(`${sectionTitle('Progress photos', addBtn('add-photo'))}
        ${photos.length ? `<div class="gallery" id="gal-progress">` + photos.map(function (ph) {
          return `<figure class="shot" data-mid="${ph.mediaId}"><img alt="progress" data-load="${ph.mediaId}">
            <figcaption>${esc(Dates.prettyShort(ph.date))}</figcaption>
            <button class="shot-del" data-act="del-photo" data-id="${ph.id}" data-mid="${ph.mediaId}">✕</button></figure>`;
        }).join('') + `</div>` : listEmpty('Private to this device. A gentle before, for future her to smile at.')}`)}
    `;
  }

  function bodyFood() {
    const st = S.get();
    const nn = st.nonNegotiables;
    const log = st.foodLog.slice().reverse().slice(0, 12);
    return `
      ${card(`
        <div class="sec-title"><h2>Should I eat this?</h2></div>
        <p class="muted">Ask before, not after. I’ll be honest — I won’t negotiate.</p>
        <div class="food-check">
          <input id="food-input" type="text" placeholder="e.g. office cake, chicken, soda…" autocomplete="off">
          <button class="btn primary" data-act="food-check">Ask</button>
        </div>
        <div class="food-quick">
          ${['Office cake', 'Soda', 'Chocolate', 'Office snacks', 'Chicken', 'Greek yogurt'].map(function (x) {
            return `<button class="tag" data-act="food-quick" data-q="${esc(x)}">${esc(x)}</button>`;
          }).join('')}
        </div>
        <div id="food-verdict" class="food-verdict"></div>
      `)}

      ${card(`${sectionTitle('Non-negotiables', addBtn('add-nn'))}
        <div class="nn-list">${nn.map(function (n) {
          return `<div class="nn-row ${n.active ? 'on' : ''}">
            <button class="nn-toggle" data-act="toggle-nn" data-id="${n.id}">${n.active ? '◆' : '◇'}</button>
            <span>${esc(n.text)}</span>
            <button class="nn-del" data-act="del-nn" data-id="${n.id}">✕</button></div>`;
        }).join('')}</div>
        <p class="muted small">These aren’t rules to break. They’re agreements you already made with her.</p>`)}

      ${card(`${sectionTitle('Today’s food notes')}
        ${log.length ? `<div class="rows">` + log.map(function (f) {
          return `<div class="row"><div><b>${esc(f.item)}</b><i>${esc(Dates.prettyShort(f.date))}</i></div>
            <span class="verdict-pill ${f.verdict}">${f.verdict === 'yes' ? 'Aligned' : f.verdict === 'no' ? 'Off-plan' : 'Noted'}</span></div>`;
        }).join('') + `</div>` : listEmpty('Nothing logged yet. Every honest note counts.')}`)}
    `;
  }

  function bodyFuture() {
    return `
      ${card(`
        <div class="future-her">
          <div class="fh-halo">🤍</div>
          <h2>What would 75kg her do?</h2>
          <ul class="fh-list">
            <li>Eats intentionally.</li>
            <li>Doesn’t negotiate with herself.</li>
            <li>Drinks water.</li>
            <li>Sleeps properly.</li>
            <li>Protects her peace.</li>
            <li>Continues.</li>
          </ul>
          <p class="fh-close">You don’t have to become her. You’re returning to her.</p>
        </div>
      `, 'future-card')}
      ${card(`${sectionTitle('A letter waiting for you')}
        <p class="muted">When it’s hard, open the Vault and read what you wrote to yourself.</p>
        <button class="btn ghost" data-act="go-vault">Open the Vault</button>`)}
    `;
  }

  /* ================================================================
     VIEW: RESETS  (Content / Wealth / Love / Soft Life / Beautiful)
     ================================================================ */
  function viewResets() {
    const seg = App.seg.resets || 'content';
    const tabs = [
      ['content', 'Content'], ['wealth', 'Wealth'], ['love', 'Love'],
      ['soft', 'Soft Life'], ['beautiful', 'Beautiful']
    ];
    const inner = ({
      content: resetContent, wealth: resetWealth, love: resetLove,
      soft: resetSoft, beautiful: resetBeautiful
    })[seg]();
    return `
      <div class="view">
        <header class="page-head"><h1>Resets</h1><p>A whole life, not just a body.</p></header>
        <div class="segmented scroll" data-seg="resets">
          ${tabs.map(function (t) {
            return `<button class="${seg === t[0] ? 'on' : ''}" data-act="seg" data-group="resets" data-val="${t[0]}">${t[1]}</button>`;
          }).join('')}
        </div>
        ${inner}
      </div>`;
  }

  function listBlock(title, addAct, items, renderItem, emptyMsg) {
    return card(`${sectionTitle(title, addBtn(addAct))}
      ${items.length ? `<div class="rows">` + items.map(renderItem).join('') + `</div>` : listEmpty(emptyMsg)}`);
  }

  function resetContent() {
    const c = S.get().content;
    ensure(c, 'posts', 0);
    return `
      ${card(`
        <div class="sec-title"><h2>Content created</h2></div>
        <div class="counter">
          <button class="chip-btn" data-act="posts-minus">－</button>
          <div class="counter-num">${c.posts}<span>pieces</span></div>
          <button class="chip-btn strong" data-act="posts-plus">＋</button>
        </div>
        <p class="muted small">TikToks, posts, essays — anything you made and shared. 100 unlocks a milestone.</p>
      `)}
      ${listBlock('Books', 'add-book', c.books, function (b) {
        return `<div class="row"><label class="row-check ${b.done ? 'done' : ''}" data-act="toggle-book" data-id="${b.id}">
          <span class="check">${b.done ? '✓' : ''}</span><b>${esc(b.title)}</b></label>
          <button class="nn-del" data-act="del-book" data-id="${b.id}">✕</button></div>`;
      }, 'Add a book you’re reading or want to.')}
      ${listBlock('Writing & book progress', 'add-writing', c.writing, function (w) {
        return `<div class="row"><div><b>${esc(w.title)}</b>${w.note ? `<i>${esc(w.note)}</i>` : ''}</div>
          <button class="nn-del" data-act="del-writing" data-id="${w.id}">✕</button></div>`;
      }, 'Chapters, drafts, publishing goals.')}
      ${listBlock('Businesses & ideas', 'add-biz', c.businesses, function (b) {
        return `<div class="row"><label class="row-check ${b.done ? 'done' : ''}" data-act="toggle-biz" data-id="${b.id}">
          <span class="check">${b.done ? '✓' : ''}</span><b>${esc(b.title)}</b></label>
          <button class="nn-del" data-act="del-biz" data-id="${b.id}">✕</button></div>`;
      }, 'One small business goal at a time.')}
      ${listBlock('Courses & podcasts', 'add-course', c.courses.concat(c.podcasts), function (x) {
        return `<div class="row"><div><b>${esc(x.title)}</b><i>${x.kind || 'course'}</i></div></div>`;
      }, 'Things you’re learning from.')}
    `;
  }

  function resetWealth() {
    const w = S.get().wealth;
    const subsTotal = (w.subscriptions || []).reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    return `
      ${card(`${sectionTitle('The numbers', `<button class="add-btn" data-act="edit-wealth">✎</button>`)}
        <div class="weight-grid four">
          ${tile('Salary', money(w.salary))}
          ${tile('Rent savings', money(w.rentSavings))}
          ${tile('Emergency fund', money(w.emergencyFund))}
          ${tile('Investments', money(w.investments))}
        </div>
        ${tile('Monthly budget', money(w.monthlyBudget), 'your soft ceiling', 'wide')}
      `)}
      ${listBlock('Subscriptions', 'add-sub', w.subscriptions, function (s) {
        return `<div class="row"><div><b>${esc(s.name)}</b><i>monthly</i></div>
          <span class="amt">${money(s.amount)}</span>
          <button class="nn-del" data-act="del-sub" data-id="${s.id}">✕</button></div>`;
      }, 'Track what quietly leaves each month.') }
      ${subsTotal ? `<p class="muted small center">Subscriptions total about ${money(subsTotal)} / month.</p>` : ''}
      ${listBlock('Financial goals', 'add-fgoal', w.goals, function (g) {
        return `<div class="row"><label class="row-check ${g.done ? 'done' : ''}" data-act="toggle-fgoal" data-id="${g.id}">
          <span class="check">${g.done ? '✓' : ''}</span><b>${esc(g.title)}</b>${g.target ? `<i>${money(g.target)}</i>` : ''}</label>
          <button class="nn-del" data-act="del-fgoal" data-id="${g.id}">✕</button></div>`;
      }, 'Save first. Spend on purpose.')}
    `;
  }

  function loveList(key, title, addAct, emptyMsg) {
    const arr = S.get().love[key];
    return listBlock(title, addAct, arr, function (x) {
      return `<div class="row"><div><b>${esc(x.text)}</b><i>${esc(Dates.prettyShort(x.date))}</i></div>
        <button class="nn-del" data-act="del-love" data-key="${key}" data-id="${x.id}">✕</button></div>`;
    }, emptyMsg);
  }
  function resetLove() {
    return `
      ${card(`<div class="quote-block">“Intentional relationships. Beautiful, chosen, protected.”</div>`, 'quote')}
      ${loveList('friendships', 'Friendships', 'add-love:friendships', 'Nurture the ones who feel like home.')}
      ${loveList('family', 'Family', 'add-love:family', 'A call. A visit. A soft memory.')}
      ${loveList('dating', 'Dating intentionally', 'add-love:dating', 'On purpose, never out of loneliness.')}
      ${loveList('boundaries', 'Boundaries', 'add-love:boundaries', 'A boundary is a form of self-love.')}
      ${loveList('memories', 'Beautiful memories', 'add-love:memories', 'The moments worth keeping.')}
    `;
  }

  function resetSoft() {
    const sl = S.get().softlife;
    const today = Dates.today();
    const hToday = sl.happiness[today];
    return `
      ${card(`
        <div class="sec-title"><h2>Happiness today</h2></div>
        <div class="happy-scale">
          ${[1,2,3,4,5,6,7,8,9,10].map(function (n) {
            return `<button class="happy-dot ${hToday === n ? 'on' : ''}" data-act="set-happy" data-n="${n}">${n}</button>`;
          }).join('')}
        </div>
        <p class="muted small">${hToday ? 'Noted, softly. Thank you for checking in.' : 'How full does today feel? No wrong answer.'}</p>
      `)}
      ${listBlock('Rest & sleep', 'add-rest', sl.weekendReset, function (r) {
        return `<div class="row"><div><b>${esc(r.text)}</b><i>${esc(Dates.prettyShort(r.date))}</i></div></div>`;
      }, 'Weekend resets, naps, slow mornings.')}
      ${listBlock('Solo dates', 'add-solo', sl.soloDates, function (r) {
        return `<div class="row"><div><b>${esc(r.text)}</b><i>${esc(Dates.prettyShort(r.date))}</i></div></div>`;
      }, 'A film, a café, a long walk — just you.')}
      ${listBlock('Travel & beautiful moments', 'add-moment', sl.moments, function (r) {
        return `<div class="row"><div><b>${esc(r.text)}</b><i>${esc(Dates.prettyShort(r.date))}</i></div></div>`;
      }, 'Places, plans, and small joys.')}
    `;
  }

  function beautifulList(key, title, addAct, emptyMsg) {
    const arr = S.get().beautiful[key];
    return listBlock(title, addAct, arr, function (x) {
      return `<div class="row"><div><b>${esc(x.text)}</b><i>${esc(Dates.prettyShort(x.date))}</i></div>
        <button class="nn-del" data-act="del-beautiful" data-key="${key}" data-id="${x.id}">✕</button></div>`;
    }, emptyMsg);
  }
  function resetBeautiful() {
    return `
      ${card(`<div class="quote-block">“A beautiful life is also a goal.”</div>`, 'quote')}
      ${beautifulList('gratitude', 'Gratitude', 'add-beautiful:gratitude', 'Three lines. Whatever is true today.')}
      ${beautifulList('smiles', 'Things that made me smile', 'add-beautiful:smiles', 'Ordinary Tuesdays count too.')}
      ${beautifulList('memories', 'Beautiful memories', 'add-beautiful:memories', 'Saturdays worth remembering.')}
      ${beautifulList('wins', 'Monthly wins', 'add-beautiful:wins', 'Small wins are still wins.')}
    `;
  }

  /* ================================================================
     VIEW: VAULT
     ================================================================ */
  function viewVault() {
    const v = S.get().vault;
    ensure(v, 'photos', []);
    const seg = App.seg.vault || 'journal';
    const tabs = [['journal', 'Journal'], ['letters', 'Letters'], ['dreams', 'Dreams'], ['voice', 'Voice'], ['photos', 'Photos']];
    let inner = '';
    if (seg === 'journal') {
      inner = listBlock('Journals', 'add-journal', v.journals.slice().reverse(), function (j) {
        return `<button class="row wide" data-act="open-journal" data-id="${j.id}">
          <div><b>${esc(j.title || 'Untitled')}</b><i>${esc(Dates.prettyShort(j.date))} · ${esc((j.body || '').slice(0, 60))}</i></div></button>`;
      }, 'A soft place to put the day down.');
    } else if (seg === 'letters') {
      inner = listBlock('Letters to future me', 'add-letter', v.letters.slice().reverse(), function (l) {
        return `<button class="row wide" data-act="open-letter" data-id="${l.id}">
          <div><b>${esc(l.title || 'To future me')}</b><i>${esc(Dates.prettyShort(l.date))}</i></div><span>💌</span></button>`;
      }, 'Write to her. She’ll need your words later.');
    } else if (seg === 'dreams') {
      inner = listBlock('Dreams & goals', 'add-dream', v.dreams.concat(v.goals), function (d) {
        return `<div class="row"><div><b>${esc(d.text || d.title)}</b></div>
          <button class="nn-del" data-act="del-dream" data-id="${d.id}">✕</button></div>`;
      }, 'Name them so they stop being secrets.');
    } else if (seg === 'voice') {
      inner = card(`${sectionTitle('Voice notes')}
        <div class="voice-panel">
          <button class="btn primary" id="rec-btn" data-act="rec-toggle">● Record</button>
          <span id="rec-status" class="muted small">Speak kindly to yourself.</span>
        </div>
        ${v.voice.length ? `<div class="rows" id="voice-list">` + v.voice.slice().reverse().map(function (n) {
          return `<div class="row"><div><b>${esc(n.note || 'Voice note')}</b><i>${esc(Dates.prettyShort(n.date))}</i></div>
            <button class="chip-btn" data-act="play-voice" data-mid="${n.mediaId}">▶</button>
            <button class="nn-del" data-act="del-voice" data-id="${n.id}" data-mid="${n.mediaId}">✕</button></div>`;
        }).join('') + `</div>` : listEmpty('Record a note for the days words are hard to find.')}`);
    } else {
      inner = card(`${sectionTitle('Photos', addBtn('add-vault-photo'))}
        ${v.photos.length ? `<div class="gallery">` + v.photos.slice().reverse().map(function (ph) {
          return `<figure class="shot" data-mid="${ph.mediaId}"><img alt="memory" data-load="${ph.mediaId}">
            <button class="shot-del" data-act="del-vault-photo" data-id="${ph.id}" data-mid="${ph.mediaId}">✕</button></figure>`;
        }).join('') + `</div>` : listEmpty('Keep the moments that made you feel like her.')}`);
    }

    return `
      <div class="view">
        <header class="page-head"><h1>The Vault</h1><p>Everything precious, in one quiet place.</p></header>
        <div class="segmented scroll" data-seg="vault">
          ${tabs.map(function (t) {
            return `<button class="${seg === t[0] ? 'on' : ''}" data-act="seg" data-group="vault" data-val="${t[0]}">${t[1]}</button>`;
          }).join('')}
        </div>
        ${inner}
      </div>`;
  }

  /* ================================================================
     VIEW: PROGRESS (Promise, Achievements, Reports)
     ================================================================ */
  function viewProgress() {
    const st = S.get();
    const score = M.promiseScore(30), streak = M.streak();
    const consistency = M.consistencyScore();
    const today = Dates.today();

    // weekly promise bars (Mon..Sun of this week)
    const weekStart = Dates.startOfWeek(today);
    const days = [], labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    for (let i = 0; i < 7; i++) { days.push(M.dayScore(Dates.addDays(weekStart, i))); }
    const bars = Charts.miniBars(days, labels, { max: 6 });

    const unlocked = Ach.catalog.filter(function (a) { return st.achievements[a.id]; });
    const locked = Ach.catalog.filter(function (a) { return !st.achievements[a.id]; });

    const badges = Ach.catalog.map(function (a) {
      const on = !!st.achievements[a.id];
      return `<div class="badge ${on ? 'on' : ''}">
        <div class="badge-icon">${a.icon}</div>
        <div class="badge-title">${esc(a.title)}</div>
        <div class="badge-note">${on ? esc(a.note) : 'Coming, gently.'}</div>
      </div>`;
    }).join('');

    return `
      <div class="view">
        <header class="page-head"><h1>Progress</h1><p>Consistency, not perfection.</p></header>

        ${card(`
          <div class="promise-hero">
            ${Charts.ring({ percent: score, size: 156, stroke: 14, gradient: ['#F3B7C6', '#E38AA0'],
              label: `<b>${score}<span>%</span></b>`, sub: 'Promise Score' })}
            <div class="today-stats">
              ${tile('Streak', streak + (streak === 1 ? ' day' : ' days'))}
              ${tile('Consistency', consistency + '%', '30 days')}
              ${tile('Days kept', M.keptDaysTotal())}
            </div>
          </div>
          <p class="muted small center">Did you keep at least one promise to yourself today? If yes — today counts.</p>
        `)}

        ${card(`${sectionTitle('This week')}${bars}
          <p class="muted small center">Each bar is a day you showed up. Empty days are just rest, not failure.</p>`)}

        ${card(`${sectionTitle('Reports')}
          <div class="report-btns">
            <button class="btn ghost" data-act="report" data-kind="weekly">Weekly</button>
            <button class="btn ghost" data-act="report" data-kind="monthly">Monthly</button>
            <button class="btn ghost" data-act="report" data-kind="quarterly">Quarterly</button>
          </div>
          <div id="report-out" class="report-out"></div>`)}

        ${card(`${sectionTitle('Achievements')}
          <p class="muted small">${unlocked.length} of ${Ach.catalog.length} earned so far.</p>
          <div class="badge-grid">${badges}</div>`)}
      </div>`;
  }

  /* ================================================================
     VIEW: SETTINGS
     ================================================================ */
  function viewSettings() {
    const st = S.get();
    const s = st.settings;
    return `
      <div class="view">
        <header class="page-head"><h1>Settings</h1><p>Make it feel like yours.</p></header>
        ${card(`${sectionTitle('You')}
          <div class="rows">
            <div class="row"><div><b>Name</b><i>${esc(st.profile.name)}</i></div>
              <button class="chip-btn" data-act="edit-profile">Edit</button></div>
            <div class="row"><div><b>Height</b><i>${st.profile.heightCm} cm</i></div></div>
            <div class="row"><div><b>Journey</b><i>${st.profile.startWeight}kg → ${st.profile.goalWeight}kg</i></div></div>
          </div>`)}

        ${card(`${sectionTitle('Appearance')}
          <div class="segmented" data-seg="theme">
            ${['system', 'light', 'dark'].map(function (t) {
              return `<button class="${s.theme === t ? 'on' : ''}" data-act="set-theme" data-val="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`;
            }).join('')}
          </div>`)}

        ${card(`${sectionTitle('Gentle reminders')}
          <label class="switch-row">
            <span>Daily check-in reminder</span>
            <button class="switch ${s.reminders ? 'on' : ''}" data-act="toggle-reminders" role="switch" aria-checked="${s.reminders}"></button>
          </label>
          <label class="fld inline"><span>Time</span><input type="time" value="${s.reminderTime}" data-act="set-remind-time"></label>
          <p class="muted small">Reminders show while the app is open or installed. Install to your home screen for the best experience.</p>`)}

        ${card(`${sectionTitle('Your data')}
          <div class="report-btns">
            <button class="btn ghost" data-act="export-data">Export backup</button>
            <button class="btn ghost" data-act="import-data">Import backup</button>
          </div>
          <p class="muted small">Everything stays on this device. Back up whenever you like.</p>
          <button class="btn ghost danger" data-act="reset-data">Start the space fresh</button>`)}

        <p class="soft-close">A beautiful life is also a goal.</p>
      </div>`;
  }

  /* ================================================================
     Router
     ================================================================ */
  const VIEWS = {
    today: viewToday, body: viewBody, resets: viewResets,
    vault: viewVault, progress: viewProgress, settings: viewSettings
  };
  const TABS = [
    ['today', 'Today', '🏠'], ['body', 'Body', '🤍'], ['resets', 'Resets', '✨'],
    ['vault', 'Vault', '🔐'], ['progress', 'Progress', '📈']
  ];

  function renderTabs() {
    $('#tabbar').innerHTML = TABS.map(function (t) {
      const on = App.route === t[0];
      return `<button class="tab ${on ? 'on' : ''}" data-act="go" data-route="${t[0]}">
        <span class="tab-ico">${t[2]}</span><span class="tab-lab">${t[1]}</span></button>`;
    }).join('');
  }

  function render() {
    const view = $('#view');
    view.classList.remove('enter');
    view.innerHTML = (VIEWS[App.route] || viewToday)();
    // lazy-load media images
    loadMediaImages(view);
    renderTabs();
    requestAnimationFrame(function () {
      view.classList.add('enter');
      Charts.animateIn(view);
    });
    // reflect settings gear active on settings route handled by header only
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function go(route) {
    App.route = route;
    render();
  }

  function loadMediaImages(root) {
    $$('img[data-load]', root).forEach(function (img) {
      const id = img.getAttribute('data-load');
      img.removeAttribute('data-load');
      Media.url(id).then(function (u) { if (u) img.src = u; });
    });
  }

  /* ================================================================
     Food verdict rendering
     ================================================================ */
  function runFoodCheck(q) {
    const res = Food.classify(q);
    const box = $('#food-verdict');
    if (!box) return;
    const cls = res.verdict;
    box.className = 'food-verdict show ' + cls;
    box.innerHTML = `
      <div class="fv-title">${esc(res.title)}</div>
      <div class="fv-msg">${esc(res.message)}</div>
      <div class="fv-reason">${esc(res.reason || '')}</div>
      <div class="fv-actions">
        <button class="btn ghost small" data-act="food-log" data-item="${esc(res.item)}" data-verdict="${cls}">Note it</button>
        ${cls === 'no' ? `<button class="btn primary small" data-act="wait20">I really want it →</button>` : ''}
      </div>`;
    // log automatically-ish? No — let her choose to note it.
  }

  /* ================================================================
     Wait 20 minutes flow
     ================================================================ */
  function startWait20() {
    let step = 0;
    const answers = {};
    const Q = Food.CRAVING_QUESTIONS;

    function stepQuestion() {
      const cur = Q[step];
      openSheet({
        title: 'Before you decide',
        subtitle: (step + 1) + ' of ' + Q.length,
        bodyHTML: `<div class="wait-q">${esc(cur.q)}</div>
          <div class="wait-choices">
            <button type="button" class="btn ghost" data-w="no">No</button>
            <button type="button" class="btn primary" data-w="yes">Yes</button>
          </div>`,
        afterOpen: function (ov) {
          $$('[data-w]', ov).forEach(function (b) {
            b.addEventListener('click', function () {
              answers[cur.key] = b.getAttribute('data-w') === 'yes';
              step++;
              if (step < Q.length) stepQuestion(); else stepWater();
            });
          });
        }
      });
      // hide default submit row
      const act = $('#sheet-form .sheet-actions'); if (act) act.style.display = 'none';
    }

    function stepWater() {
      const emotional = answers.bored || answers.stressed || answers.emotional || answers.tired;
      openSheet({
        title: 'Drink water first',
        subtitle: emotional ? 'This might not be hunger.' : 'Let’s be sure it’s hunger.',
        bodyHTML: `<div class="wait-water">
            <div class="wait-emoji">💧</div>
            <p>${emotional
              ? 'It sounds like your body is asking for something food won’t fix. Drink a full glass of water, then wait twenty minutes.'
              : 'Drink a full glass of water. Set this down for twenty minutes. Then we’ll ask again.'}</p>
          </div>`,
        submitLabel: 'Start 20 minutes',
        onSubmit: function () { closeSheet(); startTimer(); }
      });
    }

    function startTimer() {
      let secs = 20 * 60;
      const ov = openSheet({
        title: 'Twenty minutes',
        subtitle: 'You’re allowed to just breathe.',
        bodyHTML: `<div class="timer-wrap"><div id="w20-time" class="timer">20:00</div>
          <p class="muted small">Distract gently — a walk, a text to a friend, a song. I’ll wait with you.</p></div>`,
        submitLabel: 'I’m still hungry',
        onSubmit: function () { clearInterval(tk); closeSheet(); stepAfter(); }
      });
      // add a "craving passed" button
      const actions = $('.sheet-actions', ov);
      const passed = document.createElement('button');
      passed.type = 'button'; passed.className = 'btn ghost'; passed.textContent = 'It passed 🤍';
      passed.addEventListener('click', function () { clearInterval(tk); closeSheet(); cravingPassed(); });
      actions.insertBefore(passed, actions.firstChild);

      const tk = setInterval(function () {
        secs--;
        const el = $('#w20-time');
        if (el) el.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
        if (secs <= 0) { clearInterval(tk); if (el) el.textContent = '00:00'; }
      }, 1000);
    }

    function cravingPassed() {
      S.mutate(function (st) { st.promises[Dates.today()] = st.promises[Dates.today()] || {}; st.promises[Dates.today()].diet = true; });
      openSheet({
        title: 'That was her.',
        subtitle: 'The waiting was the win.',
        bodyHTML: `<div class="wait-water"><div class="wait-emoji">🤍</div>
          <p>You just made one intentional decision. That still counts — it always counts.</p></div>`,
        submitLabel: 'Continue', onSubmit: function () { closeSheet(); if (App.route === 'today' || App.route === 'body') render(); }
      });
    }

    function stepAfter() {
      openSheet({
        title: 'Still hungry?',
        subtitle: 'Then eat — intentionally.',
        bodyHTML: `<div class="wait-water"><div class="wait-emoji">🍽️</div>
          <p>Real hunger deserves real food. Choose protein first, something on today’s plan. No guilt — you waited, you listened, you chose. That’s the practice.</p></div>`,
        submitLabel: 'Okay', onSubmit: function () { closeSheet(); }
      });
    }

    stepQuestion();
  }

  /* ================================================================
     Reports
     ================================================================ */
  function generateReport(kind) {
    const st = S.get();
    const today = Dates.today();
    const spanDays = kind === 'weekly' ? 7 : kind === 'monthly' ? 30 : 91;
    const startKey = Dates.addDays(today, -(spanDays - 1));

    let keptDays = 0, waterSum = 0, waterDays = 0, scoreSum = 0;
    for (let i = 0; i < spanDays; i++) {
      const d = Dates.addDays(startKey, i);
      if (M.dayKept(d)) keptDays++;
      scoreSum += M.dayScore(d);
      if (st.water[d] != null) { waterSum += st.water[d]; waterDays++; }
    }
    const consistency = Math.round((keptDays / spanDays) * 100);
    const weightChange = M.weightChangeSince(startKey);
    const waterAvg = waterDays ? S.round(waterSum / waterDays, 1) : null;

    const unlockedInRange = Ach.catalog.filter(function (a) {
      const u = st.achievements[a.id]; return u && u >= startKey;
    });

    let weightLine;
    if (weightChange == null) weightLine = 'No new weigh-in this period — and that’s okay.';
    else if (weightChange < 0) weightLine = `Down ${Math.abs(weightChange)}kg. Softly, surely.`;
    else if (weightChange === 0) weightLine = 'Weight held steady. Maintenance is mastery too.';
    else weightLine = `Up ${weightChange}kg. Bodies fluctuate — the line matters more than the day. Continue.`;

    const closing = consistency >= 70 ? 'You kept coming home. She’s proud of you.'
      : consistency >= 30 ? 'You showed up more than you think. Keep the thread.'
      : 'A quiet season. Nothing is lost — today still counts.';

    return `
      <div class="report">
        <div class="report-title">${kind[0].toUpperCase() + kind.slice(1)} report</div>
        <div class="report-range">${Dates.prettyShort(startKey)} – ${Dates.prettyShort(today)}</div>
        <div class="report-grid">
          ${tile('Promise days', keptDays + '/' + spanDays)}
          ${tile('Consistency', consistency + '%')}
          ${tile('Water avg', waterAvg != null ? waterAvg + ' cups' : '—')}
        </div>
        <div class="report-line">🕊️ ${weightLine}</div>
        ${unlockedInRange.length ? `<div class="report-line">🏅 Earned: ${unlockedInRange.map(function (a) { return esc(a.title); }).join(', ')}.</div>` : ''}
        <div class="report-close">${closing}</div>
      </div>`;
  }

  /* ================================================================
     Media capture (photos, voice)
     ================================================================ */
  function pickImage(onBlob) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', function () {
      const file = inp.files && inp.files[0];
      if (file) onBlob(file);
    });
    inp.click();
  }

  async function toggleRecord() {
    const btn = $('#rec-btn'); const status = $('#rec-status');
    if (App.rec) {
      App.rec.stop();
      return;
    }
    if (!navigator.mediaDevices || !global.MediaRecorder) {
      // fallback to file upload
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*';
      inp.addEventListener('change', async function () {
        const f = inp.files && inp.files[0];
        if (f) { const mid = await Media.put(f, { type: f.type }); saveVoice(mid); }
      });
      inp.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const mid = await Media.put(blob, { type: 'audio/webm' });
        App.rec = null;
        saveVoice(mid);
      };
      App.rec = rec;
      rec.start();
      if (btn) { btn.textContent = '■ Stop'; btn.classList.add('recording'); }
      if (status) status.textContent = 'Recording… speak kindly.';
    } catch (e) {
      toast('Microphone unavailable — try uploading instead.');
    }
  }
  function saveVoice(mid) {
    openSheet({
      title: 'Name this note', fields: [{ name: 'note', label: 'A short label', placeholder: 'e.g. For hard days' }],
      submitLabel: 'Keep it',
      onSubmit: function (v) {
        S.mutate(function (st) { ensure(st.vault, 'voice', []); st.vault.voice.push({ id: S.uid(), date: Dates.today(), mediaId: mid, note: v.note || 'Voice note' }); });
        closeSheet(); render(); toast('Saved to your Vault.');
      }
    });
  }

  /* ================================================================
     Event handling (delegation)
     ================================================================ */
  function todayP() { const st = S.get(); const t = Dates.today(); st.promises[t] = st.promises[t] || {}; return st.promises[t]; }

  function handleAction(act, el, e) {
    const st = S.get();
    switch (act) {
      case 'go': go(el.getAttribute('data-route')); break;
      case 'go-settings': go('settings'); break;
      case 'go-food': go('body'); App.seg.body = 'food'; render(); break;
      case 'go-vault': go('vault'); break;
      case 'future-her': go('body'); App.seg.body = 'future'; render(); break;
      case 'seg': App.seg[el.getAttribute('data-group')] = el.getAttribute('data-val'); render(); break;

      /* promises */
      case 'toggle-promise': {
        const key = el.getAttribute('data-key');
        S.mutate(function () { const p = todayP(); p[key] = !p[key]; });
        celebrateMaybe(key);
        render();
        break;
      }
      case 'water-plus':
        S.mutate(function () { const t = Dates.today(); st.water[t] = (st.water[t] || 0) + 1; if (st.water[t] >= 8) { todayP().water = true; } });
        render(); break;
      case 'water-minus':
        S.mutate(function () { const t = Dates.today(); st.water[t] = Math.max(0, (st.water[t] || 0) - 1); });
        render(); break;

      /* quick actions */
      case 'wait20': startWait20(); break;
      case 'quick-gratitude':
        openSheet({ title: 'One good thing', subtitle: 'That’s all today asks.', fields: [{ name: 'text', label: 'Today I’m grateful for…', type: 'textarea', rows: 3 }], submitLabel: 'Keep it',
          onSubmit: function (v) { if (v.text) { S.mutate(function () { st.beautiful.gratitude.push({ id: S.uid(), date: Dates.today(), text: v.text }); }); } closeSheet(); toast('Kept. 🌸'); if (App.route === 'today') render(); } });
        break;

      /* food */
      case 'food-check': { const q = $('#food-input') ? $('#food-input').value : ''; runFoodCheck(q); break; }
      case 'food-quick': { const q = el.getAttribute('data-q'); const inp = $('#food-input'); if (inp) inp.value = q; runFoodCheck(q); break; }
      case 'food-log':
        S.mutate(function () { st.foodLog.push({ id: S.uid(), date: Dates.today(), item: el.getAttribute('data-item'), verdict: el.getAttribute('data-verdict') }); });
        toast('Noted honestly.'); render(); App.seg.body = 'food'; render(); break;

      /* non-negotiables */
      case 'toggle-nn': S.mutate(function () { const n = st.nonNegotiables.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (n) n.active = !n.active; }); render(); break;
      case 'del-nn': S.mutate(function () { st.nonNegotiables = st.nonNegotiables.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;
      case 'add-nn': openSheet({ title: 'A new agreement', fields: [{ name: 'text', label: 'Non-negotiable', placeholder: 'e.g. No late-night scrolling' }], submitLabel: 'Add',
          onSubmit: function (v) { if (v.text) S.mutate(function () { st.nonNegotiables.push({ id: S.uid(), text: v.text, active: true }); }); closeSheet(); render(); } }); break;

      /* weight */
      case 'log-weight':
        openSheet({ title: 'Log weight', subtitle: 'Weigh weekly only — kindly.', fields: [
          { name: 'kg', label: 'Weight (kg)', type: 'number', step: '0.1', value: M.currentWeight() },
          { name: 'date', label: 'Date', type: 'date', value: Dates.today() }], submitLabel: 'Save',
          onSubmit: function (v) {
            const kg = parseFloat(v.kg); if (!kg) { toast('Enter a number.'); return; }
            S.mutate(function () {
              const d = v.date || Dates.today();
              const ex = st.weights.find(function (w) { return w.date === d; });
              if (ex) ex.kg = kg; else st.weights.push({ date: d, kg: kg });
            });
            closeSheet(); render(); toast('Logged. The line matters more than the number.');
          } });
        break;
      case 'add-measurement':
        openSheet({ title: 'Measurements', subtitle: 'Only what you want.', fields: [
          { name: 'waist', label: 'Waist (cm)', type: 'number', step: '0.1' },
          { name: 'hips', label: 'Hips (cm)', type: 'number', step: '0.1' },
          { name: 'bust', label: 'Bust (cm)', type: 'number', step: '0.1' },
          { name: 'thigh', label: 'Thigh (cm)', type: 'number', step: '0.1' },
          { name: 'arm', label: 'Arm (cm)', type: 'number', step: '0.1' }], submitLabel: 'Save',
          onSubmit: function (v) {
            S.mutate(function () { st.measurements.push({ date: Dates.today(), waist: num(v.waist), hips: num(v.hips), bust: num(v.bust), thigh: num(v.thigh), arm: num(v.arm) }); });
            closeSheet(); render();
          } });
        break;
      case 'add-photo':
        pickImage(async function (blob) { const mid = await Media.put(blob, { type: blob.type }); S.mutate(function () { st.photos.push({ id: S.uid(), date: Dates.today(), mediaId: mid, note: '' }); }); render(); toast('A gentle before. 🤍'); });
        break;
      case 'del-photo':
        confirmSheet('Remove this photo?', 'It’s only on this device.', 'Remove', function () {
          Media.del(el.getAttribute('data-mid')); S.mutate(function () { st.photos = st.photos.filter(function (p) { return p.id !== el.getAttribute('data-id'); }); }); render();
        }, true); break;

      /* content */
      case 'posts-plus': S.mutate(function () { ensure(st.content, 'posts', 0); st.content.posts++; }); render(); break;
      case 'posts-minus': S.mutate(function () { st.content.posts = Math.max(0, (st.content.posts || 0) - 1); }); render(); break;
      case 'add-book': quickAdd('Add a book', 'Title', function (t) { st.content.books.push({ id: S.uid(), title: t, done: false }); }); break;
      case 'toggle-book': S.mutate(function () { const b = st.content.books.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (b) b.done = !b.done; }); render(); break;
      case 'del-book': S.mutate(function () { st.content.books = st.content.books.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;
      case 'add-writing': openSheet({ title: 'Writing / progress', fields: [{ name: 'title', label: 'What' }, { name: 'note', label: 'Note (optional)' }], submitLabel: 'Add', onSubmit: function (v) { if (v.title) S.mutate(function () { st.content.writing.push({ id: S.uid(), title: v.title, note: v.note }); }); closeSheet(); render(); } }); break;
      case 'del-writing': S.mutate(function () { st.content.writing = st.content.writing.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;
      case 'add-biz': quickAdd('Business goal', 'Goal', function (t) { st.content.businesses.push({ id: S.uid(), title: t, done: false }); }); break;
      case 'toggle-biz': S.mutate(function () { const b = st.content.businesses.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (b) b.done = !b.done; }); render(); break;
      case 'del-biz': S.mutate(function () { st.content.businesses = st.content.businesses.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;
      case 'add-course': openSheet({ title: 'Course / podcast', fields: [{ name: 'title', label: 'Title' }, { name: 'kind', label: 'Type', type: 'select', options: ['course', 'podcast'] }], submitLabel: 'Add', onSubmit: function (v) { if (v.title) S.mutate(function () { (v.kind === 'podcast' ? st.content.podcasts : st.content.courses).push({ id: S.uid(), title: v.title, kind: v.kind }); }); closeSheet(); render(); } }); break;

      /* wealth */
      case 'edit-wealth':
        openSheet({ title: 'The numbers', fields: [
          { name: 'salary', label: 'Salary (₦)', type: 'number', value: st.wealth.salary },
          { name: 'rentSavings', label: 'Rent savings (₦)', type: 'number', value: st.wealth.rentSavings },
          { name: 'emergencyFund', label: 'Emergency fund (₦)', type: 'number', value: st.wealth.emergencyFund },
          { name: 'investments', label: 'Investments (₦)', type: 'number', value: st.wealth.investments },
          { name: 'monthlyBudget', label: 'Monthly budget (₦)', type: 'number', value: st.wealth.monthlyBudget }], submitLabel: 'Save',
          onSubmit: function (v) { S.mutate(function () { st.wealth.salary = num(v.salary); st.wealth.rentSavings = num(v.rentSavings) || 0; st.wealth.emergencyFund = num(v.emergencyFund) || 0; st.wealth.investments = num(v.investments) || 0; st.wealth.monthlyBudget = num(v.monthlyBudget) || 0; }); closeSheet(); render(); } });
        break;
      case 'add-sub': openSheet({ title: 'Subscription', fields: [{ name: 'name', label: 'Name' }, { name: 'amount', label: 'Monthly (₦)', type: 'number' }], submitLabel: 'Add', onSubmit: function (v) { if (v.name) S.mutate(function () { st.wealth.subscriptions.push({ id: S.uid(), name: v.name, amount: num(v.amount) || 0 }); }); closeSheet(); render(); } }); break;
      case 'del-sub': S.mutate(function () { st.wealth.subscriptions = st.wealth.subscriptions.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;
      case 'add-fgoal': openSheet({ title: 'Financial goal', fields: [{ name: 'title', label: 'Goal' }, { name: 'target', label: 'Target (₦, optional)', type: 'number' }], submitLabel: 'Add', onSubmit: function (v) { if (v.title) S.mutate(function () { st.wealth.goals.push({ id: S.uid(), title: v.title, target: num(v.target), done: false }); }); closeSheet(); render(); } }); break;
      case 'toggle-fgoal': S.mutate(function () { const g = st.wealth.goals.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (g) g.done = !g.done; }); render(); break;
      case 'del-fgoal': S.mutate(function () { st.wealth.goals = st.wealth.goals.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;

      /* love + soft + beautiful generic adds */
      case 'set-happy': S.mutate(function () { st.softlife.happiness[Dates.today()] = parseInt(el.getAttribute('data-n'), 10); }); render(); break;
      case 'add-rest': quickAdd('Rest & sleep', 'What restored you?', function (t) { st.softlife.weekendReset.push({ id: S.uid(), date: Dates.today(), text: t }); }); break;
      case 'add-solo': quickAdd('Solo date', 'What did you do, just for you?', function (t) { st.softlife.soloDates.push({ id: S.uid(), date: Dates.today(), text: t }); }); break;
      case 'add-moment': quickAdd('Travel / moment', 'A place or a small joy', function (t) { st.softlife.moments.push({ id: S.uid(), date: Dates.today(), text: t }); }); break;

      /* generic love/beautiful add + delete via data-act "add-love:key" */
      default:
        if (act.indexOf('add-love:') === 0) { const key = act.split(':')[1]; quickAdd('Add to ' + key, 'What would you like to keep?', function (t) { st.love[key].push({ id: S.uid(), date: Dates.today(), text: t }); }); }
        else if (act === 'del-love') { const key = el.getAttribute('data-key'); S.mutate(function () { st.love[key] = st.love[key].filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); }
        else if (act.indexOf('add-beautiful:') === 0) { const key = act.split(':')[1]; quickAdd('Add', 'Write it down', function (t) { st.beautiful[key].push({ id: S.uid(), date: Dates.today(), text: t }); }); }
        else if (act === 'del-beautiful') { const key = el.getAttribute('data-key'); S.mutate(function () { st.beautiful[key] = st.beautiful[key].filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); }
        else handleVaultAndSettings(act, el);
        break;

      /* vault handled below to keep switch readable */
    }
  }

  function handleVaultAndSettings(act, el) {
    const st = S.get();
    switch (act) {
      case 'add-journal':
        openSheet({ title: 'New journal entry', fields: [{ name: 'title', label: 'Title (optional)' }, { name: 'body', label: 'Today…', type: 'textarea', rows: 7 }], submitLabel: 'Keep it',
          onSubmit: function (v) { if (v.body || v.title) S.mutate(function () { st.vault.journals.push({ id: S.uid(), date: Dates.today(), title: v.title, body: v.body }); }); closeSheet(); render(); toast('Held safely.'); } });
        break;
      case 'open-journal': { const j = st.vault.journals.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (j) openSheet({ title: j.title || 'Journal', subtitle: Dates.prettyLong(j.date), bodyHTML: `<div class="reader">${esc(j.body || '').replace(/\n/g, '<br>')}</div>`, submitLabel: 'Close', onSubmit: closeSheet }); break; }
      case 'add-letter':
        openSheet({ title: 'Letter to future me', fields: [{ name: 'title', label: 'Title', placeholder: 'To future me' }, { name: 'body', label: 'Dear her…', type: 'textarea', rows: 8 }], submitLabel: 'Seal it',
          onSubmit: function (v) { if (v.body) S.mutate(function () { st.vault.letters.push({ id: S.uid(), date: Dates.today(), title: v.title, body: v.body }); }); closeSheet(); render(); toast('Sealed with love. 💌'); } });
        break;
      case 'open-letter': { const l = st.vault.letters.find(function (x) { return x.id === el.getAttribute('data-id'); }); if (l) openSheet({ title: l.title || 'To future me', subtitle: Dates.prettyLong(l.date), bodyHTML: `<div class="reader letter">${esc(l.body || '').replace(/\n/g, '<br>')}</div>`, submitLabel: 'Close', onSubmit: closeSheet }); break; }
      case 'add-dream': quickAdd('A dream', 'Name it out loud', function (t) { st.vault.dreams.push({ id: S.uid(), date: Dates.today(), text: t }); }); break;
      case 'del-dream': S.mutate(function () { st.vault.dreams = st.vault.dreams.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); st.vault.goals = st.vault.goals.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); break;
      case 'rec-toggle': toggleRecord(); break;
      case 'play-voice': Media.url(el.getAttribute('data-mid')).then(function (u) { if (u) { const a = new Audio(u); a.play(); toast('Playing…'); } }); break;
      case 'del-voice': confirmSheet('Delete this note?', '', 'Delete', function () { Media.del(el.getAttribute('data-mid')); S.mutate(function () { st.vault.voice = st.vault.voice.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); }, true); break;
      case 'add-vault-photo': pickImage(async function (blob) { const mid = await Media.put(blob, { type: blob.type }); S.mutate(function () { ensure(st.vault, 'photos', []); st.vault.photos.push({ id: S.uid(), date: Dates.today(), mediaId: mid }); }); render(); }); break;
      case 'del-vault-photo': confirmSheet('Remove this photo?', '', 'Remove', function () { Media.del(el.getAttribute('data-mid')); S.mutate(function () { st.vault.photos = st.vault.photos.filter(function (x) { return x.id !== el.getAttribute('data-id'); }); }); render(); }, true); break;

      /* progress + reports */
      case 'report': { const out = $('#report-out'); if (out) { out.innerHTML = generateReport(el.getAttribute('data-kind')); out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } break; }

      /* settings */
      case 'edit-profile': openSheet({ title: 'You', fields: [{ name: 'name', label: 'Name', value: st.profile.name }, { name: 'heightCm', label: 'Height (cm)', type: 'number', value: st.profile.heightCm }, { name: 'goalWeight', label: 'Goal weight (kg)', type: 'number', step: '0.1', value: st.profile.goalWeight }], submitLabel: 'Save', onSubmit: function (v) { S.mutate(function () { st.profile.name = v.name || st.profile.name; st.profile.heightCm = num(v.heightCm) || st.profile.heightCm; st.profile.goalWeight = num(v.goalWeight) || st.profile.goalWeight; }); closeSheet(); render(); } }); break;
      case 'set-theme': S.mutate(function () { st.settings.theme = el.getAttribute('data-val'); }); applyTheme(); render(); break;
      case 'toggle-reminders': toggleReminders(); break;
      case 'set-remind-time': /* handled on change */ break;
      case 'export-data': Data.download(); toast('Backup downloaded.'); break;
      case 'import-data': doImport(); break;
      case 'reset-data': confirmSheet('Start the space fresh?', 'This clears entries on this device. Export a backup first if unsure.', 'Start fresh', function () { Data.reset(); Media.all().then(function (all) { all.forEach(function (r) { Media.del(r.id); }); }); go('today'); }, true); break;

      case 'sheet-cancel': closeSheet(); break;
    }
  }

  function quickAdd(title, label, apply) {
    openSheet({ title: title, fields: [{ name: 'text', label: label, type: 'textarea', rows: 3 }], submitLabel: 'Add',
      onSubmit: function (v) { if (v.text) S.mutate(function () { apply(v.text); }); closeSheet(); render(); } });
  }
  function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

  function celebrateMaybe(key) {
    if (todayP()[key]) {
      // a gentle affirmation only when turning ON
      const lines = { cont: 'Continue. That was the whole practice today.', peace: 'Peace protected. 🤍', create: 'You made something. That counts.', diet: 'Aligned with 75kg her.', water: 'Water — your body says thank you.', noSnacks: 'You kept the agreement.' };
      if (lines[key]) toast(lines[key]);
    }
  }

  /* ================================================================
     Theme, reminders, import, onboarding
     ================================================================ */
  function applyTheme() {
    const t = S.get().settings.theme;
    const dark = t === 'dark' || (t === 'system' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = $('#theme-color'); if (meta) meta.setAttribute('content', dark ? '#1a1518' : '#fbf7f4');
  }

  function toggleReminders() {
    const st = S.get();
    if (!st.settings.reminders) {
      if (global.Notification && Notification.permission !== 'granted') {
        Notification.requestPermission().then(function (perm) {
          S.mutate(function () { st.settings.reminders = perm === 'granted'; });
          if (perm === 'granted') { new Notification('Project 75', { body: 'I’ll gently remind you. Welcome home. 🤍' }); }
          else toast('Notifications are off in your browser settings.');
          render();
        });
        return;
      }
      S.mutate(function () { st.settings.reminders = true; });
    } else {
      S.mutate(function () { st.settings.reminders = false; });
    }
    render();
  }

  function maybeRemindNow() {
    const st = S.get();
    if (!st.settings.reminders || !global.Notification || Notification.permission !== 'granted') return;
    const now = new Date();
    const [rh, rm] = (st.settings.reminderTime || '07:30').split(':').map(Number);
    const flag = 'p75:reminded:' + Dates.today();
    if (localStorage.getItem(flag)) return;
    if (now.getHours() > rh || (now.getHours() === rh && now.getMinutes() >= rm)) {
      localStorage.setItem(flag, '1');
      try { new Notification('Good morning. Welcome home.', { body: 'Drink water. Follow today’s plan. Continue.' }); } catch (e) {}
    }
  }

  function doImport() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', function () {
      const f = inp.files && inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = function () { try { Data.import(r.result); applyTheme(); go('today'); toast('Your data is back. Welcome home.'); } catch (e) { toast('That file couldn’t be read.'); } };
      r.readAsText(f);
    });
    inp.click();
  }

  function maybeOnboard() {
    const st = S.get();
    if (st.settings.onboarded) return;
    openSheet({
      title: 'Welcome home.',
      subtitle: 'Project 75 — Returning to Her',
      bodyHTML: `<p class="ob-copy">This is not a weight-loss app. It’s a soft place to become a healthier, steadier, more intentional woman — over years, not weeks. Let’s set your anchors. You can change these anytime.</p>`,
      fields: [
        { name: 'name', label: 'What should I call you?', value: '' },
        { name: 'startWeight', label: 'Starting weight (kg)', type: 'number', step: '0.1', value: 96 },
        { name: 'goalWeight', label: 'Goal weight (kg)', type: 'number', step: '0.1', value: 75 },
        { name: 'heightCm', label: 'Height (cm)', type: 'number', value: 183 }
      ],
      submitLabel: 'Begin, gently',
      onSubmit: function (v) {
        S.mutate(function () {
          st.profile.name = v.name || 'Her';
          st.profile.startWeight = num(v.startWeight) || 96;
          st.profile.goalWeight = num(v.goalWeight) || 75;
          st.profile.heightCm = num(v.heightCm) || 183;
          st.settings.onboarded = true;
          // reseed the baseline weight to the confirmed start
          st.weights = [{ date: st.profile.startDate, kg: st.profile.startWeight }];
        });
        closeSheet(); render();
      }
    });
    const cancel = $('#sheet-form .btn.ghost'); if (cancel) cancel.textContent = 'Skip for now';
  }

  /* ================================================================
     Achievement celebration
     ================================================================ */
  function showUnlock(list) {
    const a = list[0];
    openSheet({
      title: 'A milestone, softly',
      bodyHTML: `<div class="unlock"><div class="unlock-icon">${a.icon}</div>
        <div class="unlock-title">${esc(a.title)}</div>
        <div class="unlock-note">${esc(a.note)}</div>
        ${list.length > 1 ? `<div class="muted small">+${list.length - 1} more earned</div>` : ''}</div>`,
      submitLabel: 'Beautiful', onSubmit: closeSheet
    });
  }

  /* ================================================================
     Boot
     ================================================================ */
  function bindEvents() {
    document.addEventListener('click', function (e) {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.getAttribute('data-act');
      // let native switches on inputs behave; we handle our own
      handleAction(act, el, e);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'food-input') { e.preventDefault(); runFoodCheck(e.target.value); }
    });
    document.addEventListener('change', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-act') === 'set-remind-time') {
        S.mutate(function (st) { st.settings.reminderTime = e.target.value; });
        toast('Reminder time updated.');
      }
    });
    global.addEventListener('p75:unlocked', function (e) { showUnlock(e.detail); });
    if (global.matchMedia) {
      const mq = global.matchMedia('(prefers-color-scheme: dark)');
      (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { if (S.get().settings.theme === 'system') { applyTheme(); } });
    }
  }

  function boot() {
    S.load();
    applyTheme();
    renderHeader();
    bindEvents();
    Ach.evaluate();
    render();
    maybeOnboard();
    // update lastOpen AFTER computing the returning banner in first render
    setTimeout(function () { S.mutate(function (st) { st.settings.lastOpen = Dates.today(); }); }, 800);
    maybeRemindNow();
    // service worker
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('service-worker.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.P75.App = { go: go, render: render };
})(window);
