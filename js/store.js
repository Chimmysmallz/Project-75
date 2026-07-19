/* =====================================================================
   PROJECT 75 — RETURNING TO HER
   store.js — State, persistence, metrics, media & data portability.

   Structured state -> localStorage.  Photos / voice -> IndexedDB.
   This module never touches the DOM. It is the single source of truth.
   ===================================================================== */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'project75:v1';

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function round(n, d) { const f = Math.pow(10, d || 0); return Math.round(n * f) / f; }

  /* ---------------- Dates (local, YYYY-MM-DD) ---------------- */
  const Dates = {
    key(d) { d = d || new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    today() { return Dates.key(new Date()); },
    parse(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); },
    addDays(k, n) { const d = Dates.parse(k); d.setDate(d.getDate() + n); return Dates.key(d); },
    addMonths(k, n) { const d = Dates.parse(k); d.setMonth(d.getMonth() + n); return Dates.key(d); },
    diffDays(a, b) { return Math.round((Dates.parse(b) - Dates.parse(a)) / 86400000); },
    monthKey(k) { return k.slice(0, 7); },
    startOfWeek(k) { const d = Dates.parse(k); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return Dates.key(d); },
    prettyLong(k) { return Dates.parse(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); },
    prettyShort(k) { return Dates.parse(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); },
    prettyFull(k) { return Dates.parse(k).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); },
    prettyMonth(mk) { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
  };

  /* ---------------- The daily promise (her agreement) ---------------- */
  const PROMISE_KEYS = ['diet', 'noSnacks', 'noSoda', 'water', 'fruit', 'protein', 'walked', 'weighed', 'slept', 'create', 'peace', 'cont'];

  /* ---------------- Seed content ---------------- */
  const LETTER_TEXT =
    'Dear Future Me,\n\n' +
    'Thank you for not giving up.\n' +
    'Thank you for continuing when nobody was watching.\n' +
    'Thank you for choosing consistency over perfection.\n' +
    'Thank you for becoming healthier.\n' +
    'Thank you for writing the books.\n' +
    'Thank you for launching the businesses.\n' +
    'Thank you for keeping your promises.\n\n' +
    'Missing one day never became missing one year.\n' +
    'You continued.\n\n' +
    'Love,\n' +
    'The woman you were becoming.';

  /* ---------------- Default state ---------------- */
  function defaults() {
    const start = Dates.today();
    return {
      version: 1,
      profile: { name: 'Chiamaka', heightCm: 183, startWeight: 96, goalWeight: 75, startDate: start, targetMonths: 6 },
      weights: [{ date: start, kg: 96 }],
      measurements: [],
      photos: [],
      promises: {},
      water: {},
      meals: {},
      diet: {
        breakfast: ['Coffee + milk', '2 boiled eggs', '1 apple'],
        lunch: ['2 boiled eggs', '1 pear'],
        dinner: ['150g chicken', 'Greek yogurt', '2 eggs'],
        unlimited: ['Water', 'Ginger tea', 'Green tea', 'Zero-calorie drinks'],
        cal: { breakfast: 285, lunch: 240, dinner: 250 }
      },
      nonNegotiables: [
        { id: uid(), text: 'No soda', active: true },
        { id: uid(), text: 'No office snacks', active: true },
        { id: uid(), text: 'Protein first', active: true },
        { id: uid(), text: 'Follow today’s plan', active: true },
        { id: uid(), text: 'Continue', active: true }
      ],
      foodLog: [],
      people: [],  // {id,name,relation,birthday,lastContacted,cadence,note}
      content: {
        videos: 0, posts: 0, pagesWritten: 0, coursesCompleted: 0,
        books: [], apps: [], games: [], projects: [],
        writing: [], podcasts: [], courses: [], publishing: []
      },
      wealth: {
        salary: null, rentGoal: null, rentSavings: 0, emergencyFund: 0, monthlyBudget: 0, investments: 0,
        transport: 0, food: 0, gifts: 0, carFund: 0, perfumeFund: 0,
        subscriptions: [], goals: [], spending: [], expenses: []
      },
      love: {
        commitments: [
          { id: uid(), text: 'Call my parents', done: false },
          { id: uid(), text: 'Spend time with friends', done: false },
          { id: uid(), text: 'Go on one intentional date', done: false },
          { id: uid(), text: 'Communicate honestly', done: false },
          { id: uid(), text: 'Protect my peace', done: false }
        ],
        friendships: [], family: [], dating: [], goals: [], boundaries: [], memories: [],
        dating2: {
          standards: [
            { id: uid(), text: 'Emotionally available and consistent' },
            { id: uid(), text: 'Shares my core values' },
            { id: uid(), text: 'Adds peace, not stress' },
            { id: uid(), text: 'Communicates honestly' }
          ],
          green: [
            { id: uid(), text: 'Follows through on what they say' },
            { id: uid(), text: 'Curious about my world' }
          ],
          red: [
            { id: uid(), text: 'Hot and cold / inconsistent' },
            { id: uid(), text: 'Makes me feel anxious or small' }
          ],
          people: [],
          dates: [],
          goal: 2
        }
      },
      softlife: { travel: [], soloDates: [], moments: [], weekendReset: [], happiness: {} },
      beautiful: { gratitude: [], memories: [], smiles: [], wins: [] },
      vault: { journals: [], letters: [], dreams: [], goals: [], voice: [], photos: [] },
      monthly: {},
      forever: {
        goals: [
          { id: uid(), text: 'Maintain my weight', done: false },
          { id: uid(), text: 'Write my first book', done: false },
          { id: uid(), text: 'Build my business', done: false },
          { id: uid(), text: 'Travel', done: false },
          { id: uid(), text: 'Build a beautiful life', done: false }
        ]
      },
      office: {},
      cycle: { periods: [], avgCycle: 28, avgPeriod: 5 },
      vision: [],
      achievements: {},
      settings: { theme: 'system', reminders: false, reminderTime: '07:30', lastOpen: start, onboarded: false, seeded: false }
    };
  }

  /* ---------------- Load / save ---------------- */
  let state = null;

  function deepMerge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (over && typeof over === 'object' && !Array.isArray(over)) {
      Object.keys(over).forEach(function (k) {
        if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) &&
            base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
          out[k] = deepMerge(base[k], over[k]);
        } else if (over[k] !== undefined) { out[k] = over[k]; }
      });
    }
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? deepMerge(defaults(), JSON.parse(raw)) : defaults();
    } catch (e) { state = defaults(); }
    ensureSeeds();
    return state;
  }

  /* One-time seeding of the Letter and her real creative projects
     (so they appear even for installs saved before this version). */
  function ensureSeeds() {
    let dirty = false;
    if (!state.settings.seeded) {
      state.vault.letters = state.vault.letters || [];
      if (!state.vault.letters.some(function (l) { return l.seed === 'letter1'; })) {
        state.vault.letters.unshift({ id: uid(), seed: 'letter1', date: state.profile.startDate, title: 'The Letter', body: LETTER_TEXT });
      }
      state.settings.seeded = true; dirty = true;
    }
    if (!state.settings.seededProjects) {
      const c = state.content;
      c.books = c.books || []; c.apps = c.apps || []; c.games = c.games || []; c.projects = c.projects || [];
      const PLACEHOLDERS = ['My first book', 'My business', 'Content creator journey'];
      c.books = c.books.filter(function (b) { return PLACEHOLDERS.indexOf(b.title) === -1; });
      c.projects = c.projects.filter(function (p) { return PLACEHOLDERS.indexOf(p.title) === -1; });
      const addBook = function (title, subtitle, desc) { if (!c.books.some(function (b) { return b.title === title; })) c.books.push({ id: uid(), title: title, subtitle: subtitle || '', stage: 'Idea', description: desc || '', progress: 0, done: false, notes: '' }); };
      const addItem = function (arr, title) { if (!arr.some(function (x) { return x.title === title; })) arr.push({ id: uid(), title: title, progress: 0, done: false, note: '' }); };
      addBook('The Anatomy of Fear', '', 'Fear · why people freeze · behavioural psychology · emotional responses to fear · understanding fear · overcoming fear · intentional living');
      addBook('Victim No More', 'Why You Should Stop Playing The Victim And Other Ways To Manipulate', 'Victim mentality · manipulation · emotional manipulation · taking responsibility · unhealthy behavioural patterns · intentional living');
      addBook('My ebook', '', '');
      ['Beliyona Travels app', 'Beliyona Learn app', 'My fitness app'].forEach(function (t) { addItem(c.apps, t); });
      ['Office Hours', 'Go Slow', 'Mamah Put', 'Dinosaur Doodle'].forEach(function (t) { addItem(c.games, t); });
      ['Project management course / website', 'Children comic book'].forEach(function (t) { addItem(c.projects, t); });
      state.settings.seededProjects = true; dirty = true;
    }
    if (dirty) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
  }

  /* Synchronous write — guarantees data is persisted immediately, so nothing
     is lost when the app is closed or backgrounded right after an edit. */
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    global.dispatchEvent(new CustomEvent('p75:saved'));
  }

  function get() { return state || load(); }

  function mutate(fn) {
    fn(get());
    Achievements.evaluate();
    save();
    global.dispatchEvent(new CustomEvent('p75:changed'));
  }

  /* ---------------- IndexedDB media ---------------- */
  const Media = (function () {
    const DB = 'project75-media', STORE = 'media';
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      return dbp;
    }
    function tx(mode) { return open().then(function (db) { return db.transaction(STORE, mode).objectStore(STORE); }); }
    return {
      async put(blob, meta) {
        const rec = { id: uid(), blob: blob, type: (meta && meta.type) || blob.type, created: Date.now() };
        const store = await tx('readwrite');
        return new Promise(function (resolve, reject) { const r = store.put(rec); r.onsuccess = function () { resolve(rec.id); }; r.onerror = function () { reject(r.error); }; });
      },
      async get(id) { const store = await tx('readonly'); return new Promise(function (resolve) { const r = store.get(id); r.onsuccess = function () { resolve(r.result || null); }; r.onerror = function () { resolve(null); }; }); },
      async url(id) { const rec = await Media.get(id); return rec ? URL.createObjectURL(rec.blob) : null; },
      async del(id) { const store = await tx('readwrite'); return new Promise(function (resolve) { const r = store.delete(id); r.onsuccess = function () { resolve(true); }; r.onerror = function () { resolve(false); }; }); },
      async all() { const store = await tx('readonly'); return new Promise(function (resolve) { const out = []; const r = store.openCursor(); r.onsuccess = function () { const c = r.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); }; r.onerror = function () { resolve(out); }; }); }
    };
  })();

  /* ---------------- Metrics ---------------- */
  const Metrics = {
    heightM() { return get().profile.heightCm / 100; },
    sortedWeights() { return get().weights.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }); },
    currentWeight() { const w = Metrics.sortedWeights(); return w.length ? w[w.length - 1].kg : get().profile.startWeight; },
    startWeight() { return get().profile.startWeight; },
    goalWeight() { return get().profile.goalWeight; },
    totalLost() { return round(Metrics.startWeight() - Metrics.currentWeight(), 1); },
    remaining() { return round(Metrics.currentWeight() - Metrics.goalWeight(), 1); },
    percentToGoal() {
      const total = Metrics.startWeight() - Metrics.goalWeight();
      if (total <= 0) return 100;
      return clamp(Math.round(((Metrics.startWeight() - Metrics.currentWeight()) / total) * 100), 0, 100);
    },
    bmi(kg) { kg = (kg == null) ? Metrics.currentWeight() : kg; const h = Metrics.heightM(); return round(kg / (h * h), 1); },
    bmiLabel(bmi) { bmi = bmi == null ? Metrics.bmi() : bmi; if (bmi < 18.5) return 'Underweight'; if (bmi < 25) return 'Healthy range'; if (bmi < 30) return 'Above range'; return 'High range'; },

    dayKept(k) { const p = get().promises[k]; return p ? PROMISE_KEYS.some(function (x) { return !!p[x]; }) : false; },
    dayScore(k) { const p = get().promises[k] || {}; let n = 0; PROMISE_KEYS.forEach(function (x) { if (p[x]) n++; }); return n; },
    promiseTotal() { return PROMISE_KEYS.length; },

    streak() {
      const today = Dates.today();
      let cursor = Metrics.dayKept(today) ? today : Dates.addDays(today, -1);
      let n = 0; const floor = get().profile.startDate;
      while (Dates.diffDays(floor, cursor) >= 0) { if (Metrics.dayKept(cursor)) { n++; cursor = Dates.addDays(cursor, -1); } else break; }
      return n;
    },
    daysElapsed() { return Math.max(1, Dates.diffDays(get().profile.startDate, Dates.today()) + 1); },
    promiseScore(win) {
      win = win || 30; const today = Dates.today(); const span = Math.min(win, Metrics.daysElapsed());
      let kept = 0; for (let i = 0; i < span; i++) { if (Metrics.dayKept(Dates.addDays(today, -i))) kept++; }
      return Math.round((kept / span) * 100);
    },
    consistencyScore() { return Metrics.promiseScore(30); },
    keptDaysTotal() { return Object.keys(get().promises).filter(function (d) { return Metrics.dayKept(d); }).length; },
    waterToday() { return get().water[Dates.today()] || 0; },

    currentMonthKey() { return Dates.today().slice(0, 7); },
    monthly(mk) {
      mk = mk || Metrics.currentMonthKey(); const st = get(); st.monthly = st.monthly || {};
      if (!st.monthly[mk]) st.monthly[mk] = { identity: null, focus: [], intentionalSpend: null };
      return st.monthly[mk];
    },
    lastKeptDay() {
      const days = Object.keys(get().promises).filter(function (d) { return Metrics.dayKept(d); }).sort();
      return days.length ? days[days.length - 1] : get().profile.startDate;
    },
    inactiveDays() { return Dates.diffDays(Metrics.lastKeptDay(), Dates.today()); },
    daysCreated() { const p = get().promises; return Object.keys(p).filter(function (d) { return p[d] && p[d].create; }).length; },
    goalReached() { return Metrics.currentWeight() <= Metrics.goalWeight(); },

    targetDate() { return Dates.addMonths(get().profile.startDate, get().profile.targetMonths || 6); },
    requiredWeeklyRate() {
      const months = get().profile.targetMonths || 6;
      return round((Metrics.startWeight() - Metrics.goalWeight()) / (months * 4.345), 2);
    },

    trend() {
      const w = Metrics.sortedWeights(); if (w.length < 2) return null;
      const base = Dates.parse(w[0].date).getTime();
      const xs = w.map(function (p) { return (Dates.parse(p.date).getTime() - base) / 86400000; });
      const ys = w.map(function (p) { return p.kg; });
      const n = xs.length, sx = xs.reduce(function (a, b) { return a + b; }, 0), sy = ys.reduce(function (a, b) { return a + b; }, 0);
      const sxx = xs.reduce(function (a, b) { return a + b * b; }, 0), sxy = xs.reduce(function (a, b, i) { return a + b * ys[i]; }, 0);
      const denom = (n * sxx - sx * sx); if (denom === 0) return null;
      const slope = (n * sxy - sx * sy) / denom;
      return { slope: slope, weeklyRate: round(slope * 7, 2) };
    },
    forecast() {
      const t = Metrics.trend(), cur = Metrics.currentWeight(), goal = Metrics.goalWeight();
      if (cur <= goal) return { arrived: true };
      if (!t || t.slope >= -0.0005) return { unknown: true, weeklyRate: t ? t.weeklyRate : 0 };
      const daysNeeded = (goal - cur) / t.slope;
      const arrival = Dates.addDays(Dates.today(), Math.ceil(daysNeeded));
      return { arrived: false, weeklyRate: t.weeklyRate, daysNeeded: Math.ceil(daysNeeded), arrivalKey: arrival, arrivalPretty: Dates.prettyFull(arrival) };
    },
    weightChangeSince(k) {
      const w = Metrics.sortedWeights().filter(function (p) { return p.date >= k; });
      if (!w.length) return null;
      const earlier = Metrics.sortedWeights().filter(function (p) { return p.date < k; });
      const from = earlier.length ? earlier[earlier.length - 1].kg : w[0].kg;
      return round(w[w.length - 1].kg - from, 1);
    }
  };

  /* ---------------- Achievements ---------------- */
  const Achievements = {
    catalog: [
      { id: 'consistent7', title: '7 Consistent Days', note: 'You kept coming home.', icon: '🌱', test: function () { return Metrics.keptDaysTotal() >= 7; } },
      { id: 'lost5', title: 'First 5kg Lighter', note: 'Softly, surely.', icon: '🕊️', test: function () { return Metrics.totalLost() >= 5; } },
      { id: 'lost10', title: 'First 10kg Lighter', note: 'Look how far.', icon: '✨', test: function () { return Metrics.totalLost() >= 10; } },
      { id: 'w90', title: 'Hello, 90kg', note: 'A quiet milestone.', icon: '🤍', test: function () { return Metrics.currentWeight() <= 90 && Metrics.startWeight() > 90; } },
      { id: 'w85', title: 'Hello, 85kg', note: 'Still going.', icon: '🌸', test: function () { return Metrics.currentWeight() <= 85; } },
      { id: 'w80', title: 'Hello, 80kg', note: 'Almost her.', icon: '💗', test: function () { return Metrics.currentWeight() <= 80; } },
      { id: 'w75', title: '75kg — Welcome Home', note: 'You returned to her.', icon: '👑', test: function () { return Metrics.currentWeight() <= 75; } },
      { id: 'book1', title: 'First Book Finished', note: 'A whole world, made.', icon: '📖', test: function () { return get().content.books.some(function (b) { return b.done; }); } },
      { id: 'biz1', title: 'First Business Goal', note: 'She builds things.', icon: '🏛️', test: function () { return get().content.projects.some(function (b) { return b.done; }) || get().wealth.goals.some(function (g) { return g.done; }); } },
      { id: 'posts100', title: '100 Pieces Created', note: 'A body of work.', icon: '🎬', test: function () { return ((get().content.videos || 0) + (get().content.posts || 0)) >= 100; } },
      { id: 'year1', title: 'One Year, Consistent', note: 'A softer, steadier woman.', icon: '🌷', test: function () { return Metrics.daysElapsed() >= 365 && Metrics.consistencyScore() >= 60; } }
    ],
    evaluate() {
      if (!state) return;
      const today = Dates.today(); let unlocked = [];
      Achievements.catalog.forEach(function (a) { if (!state.achievements[a.id] && a.test()) { state.achievements[a.id] = today; unlocked.push(a); } });
      if (unlocked.length) global.dispatchEvent(new CustomEvent('p75:unlocked', { detail: unlocked }));
    }
  };

  /* ---------------- Export / Import ---------------- */
  const Data = {
    exportJSON() { return JSON.stringify({ app: 'Project 75 — Returning to Her', exportedAt: new Date().toISOString(), state: get() }, null, 2); },
    download() {
      const blob = new Blob([Data.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'project-75-backup-' + Dates.today() + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },
    import(text) { const parsed = JSON.parse(text); state = deepMerge(defaults(), parsed.state || parsed); save(); global.dispatchEvent(new CustomEvent('p75:changed')); return true; },
    reset() { state = defaults(); state.settings.seeded = false; ensureSeeds(); save(); global.dispatchEvent(new CustomEvent('p75:changed')); }
  };

  global.P75 = global.P75 || {};
  global.P75.Store = { load: load, get: get, save: save, mutate: mutate, uid: uid, round: round, clamp: clamp, PROMISE_KEYS: PROMISE_KEYS };
  global.P75.Dates = Dates;
  global.P75.Metrics = Metrics;
  global.P75.Media = Media;
  global.P75.Achievements = Achievements;
  global.P75.Data = Data;

})(window);
