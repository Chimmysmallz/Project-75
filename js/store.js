/* =====================================================================
   PROJECT 75 — RETURNING TO HER
   store.js — State, persistence, metrics, media & data portability.

   Everything lives on the device:
     • Structured state  -> localStorage (small, fast, synchronous)
     • Photos / voice     -> IndexedDB (blobs, larger, async)

   This module never mutates the DOM. It is the single source of truth.
   ===================================================================== */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'project75:v1';

  /* -----------------------------------------------------------------
     Small utilities
     ----------------------------------------------------------------- */
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function round(n, d) { const f = Math.pow(10, d || 0); return Math.round(n * f) / f; }

  /* -----------------------------------------------------------------
     Date helpers — all local-time, keyed as YYYY-MM-DD
     ----------------------------------------------------------------- */
  const Dates = {
    now() { return new Date(); },
    key(d) {
      d = d || new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },
    today() { return Dates.key(new Date()); },
    parse(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); },
    addDays(k, n) { const d = Dates.parse(k); d.setDate(d.getDate() + n); return Dates.key(d); },
    diffDays(a, b) { return Math.round((Dates.parse(b) - Dates.parse(a)) / 86400000); },
    monthKey(k) { return k.slice(0, 7); },
    startOfWeek(k) { // Monday-based
      const d = Dates.parse(k);
      const day = (d.getDay() + 6) % 7; // 0 = Monday
      d.setDate(d.getDate() - day);
      return Dates.key(d);
    },
    prettyLong(k) {
      return Dates.parse(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    },
    prettyShort(k) {
      return Dates.parse(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },
    prettyMonth(mk) {
      const [y, m] = mk.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
  };

  /* -----------------------------------------------------------------
     Default state — seeded from the user's real profile.
     A baseline weight entry is seeded so charts have an anchor.
     ----------------------------------------------------------------- */
  function defaults() {
    const start = Dates.today();
    return {
      version: 1,
      profile: {
        name: 'Her',
        heightCm: 183,
        startWeight: 96,
        goalWeight: 75,
        startDate: start
      },
      weights: [{ date: start, kg: 96 }],       // {date, kg}
      measurements: [],                          // {date, waist, hips, bust, thigh, arm}
      photos: [],                                // {id, date, mediaId, note}
      promises: {},                              // 'date': {water,diet,noSnacks,create,peace,cont}
      water: {},                                 // 'date': cups(number)
      nonNegotiables: [
        { id: uid(), text: 'No soda', active: true },
        { id: uid(), text: 'No office snacks', active: true },
        { id: uid(), text: "Follow today's plan", active: true },
        { id: uid(), text: 'Weigh weekly only', active: true },
        { id: uid(), text: 'Protein first', active: true },
        { id: uid(), text: 'Continue', active: true }
      ],
      foodLog: [],                               // {id, date, item, verdict}
      content: {
        posts: 0,
        books: [], writing: [], apps: [], courses: [],
        businesses: [], podcasts: [], publishing: []
      },
      wealth: {
        salary: null, rentSavings: 0, emergencyFund: 0, monthlyBudget: 0, investments: 0,
        subscriptions: [], goals: [], spending: []
      },
      love: { friendships: [], family: [], dating: [], goals: [], boundaries: [], memories: [] },
      softlife: { travel: [], soloDates: [], moments: [], weekendReset: [], happiness: {} }, // happiness: {date:score}
      beautiful: { gratitude: [], memories: [], smiles: [], wins: [] },
      vault: { journals: [], letters: [], dreams: [], goals: [], voice: [] },
      achievements: {},                          // id: unlockedDate
      settings: {
        theme: 'system',                         // system | light | dark
        reminders: false,
        reminderTime: '07:30',
        lastOpen: start,
        onboarded: false
      }
    };
  }

  /* -----------------------------------------------------------------
     Load / save (localStorage), with forgiving merge for upgrades.
     ----------------------------------------------------------------- */
  let state = null;

  function deepMerge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (over && typeof over === 'object' && !Array.isArray(over)) {
      Object.keys(over).forEach(function (k) {
        if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) &&
            base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
          out[k] = deepMerge(base[k], over[k]);
        } else if (over[k] !== undefined) {
          out[k] = over[k];
        }
      });
    }
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = deepMerge(defaults(), JSON.parse(raw));
      } else {
        state = defaults();
      }
    } catch (e) {
      state = defaults();
    }
    return state;
  }

  let saveTimer = null;
  function save() {
    // Debounced so rapid edits don't thrash storage.
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (e) { /* storage full — media lives in IndexedDB, so this is rare */ }
      global.dispatchEvent(new CustomEvent('p75:saved'));
    }, 120);
  }

  function get() { return state || load(); }

  /* mutate(fn): apply a change, persist, re-check achievements, notify UI */
  function mutate(fn) {
    fn(get());
    Achievements.evaluate();
    save();
    global.dispatchEvent(new CustomEvent('p75:changed'));
  }

  /* -----------------------------------------------------------------
     IndexedDB — media (progress photos, voice notes)
     ----------------------------------------------------------------- */
  const Media = (function () {
    const DB = 'project75-media';
    const STORE = 'media';
    let dbp = null;

    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        };
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
        return new Promise(function (resolve, reject) {
          const r = store.put(rec);
          r.onsuccess = function () { resolve(rec.id); };
          r.onerror = function () { reject(r.error); };
        });
      },
      async get(id) {
        const store = await tx('readonly');
        return new Promise(function (resolve) {
          const r = store.get(id);
          r.onsuccess = function () { resolve(r.result || null); };
          r.onerror = function () { resolve(null); };
        });
      },
      async url(id) {
        const rec = await Media.get(id);
        return rec ? URL.createObjectURL(rec.blob) : null;
      },
      async del(id) {
        const store = await tx('readwrite');
        return new Promise(function (resolve) {
          const r = store.delete(id);
          r.onsuccess = function () { resolve(true); };
          r.onerror = function () { resolve(false); };
        });
      },
      async all() {
        const store = await tx('readonly');
        return new Promise(function (resolve) {
          const out = [];
          const r = store.openCursor();
          r.onsuccess = function () {
            const c = r.result;
            if (c) { out.push(c.value); c.continue(); } else resolve(out);
          };
          r.onerror = function () { resolve(out); };
        });
      }
    };
  })();

  /* -----------------------------------------------------------------
     Metrics — the heart of the app. Nothing here shames a gap.
     ----------------------------------------------------------------- */
  const PROMISE_KEYS = ['water', 'diet', 'noSnacks', 'create', 'peace', 'cont'];

  const Metrics = {
    heightM() { return get().profile.heightCm / 100; },

    sortedWeights() {
      return get().weights.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    },

    currentWeight() {
      const w = Metrics.sortedWeights();
      return w.length ? w[w.length - 1].kg : get().profile.startWeight;
    },

    startWeight() { return get().profile.startWeight; },
    goalWeight() { return get().profile.goalWeight; },

    totalLost() { return round(Metrics.startWeight() - Metrics.currentWeight(), 1); },
    remaining() { return round(Metrics.currentWeight() - Metrics.goalWeight(), 1); },

    percentToGoal() {
      const total = Metrics.startWeight() - Metrics.goalWeight();
      if (total <= 0) return 100;
      const done = Metrics.startWeight() - Metrics.currentWeight();
      return clamp(Math.round((done / total) * 100), 0, 100);
    },

    bmi(kg) {
      kg = (kg == null) ? Metrics.currentWeight() : kg;
      const h = Metrics.heightM();
      return round(kg / (h * h), 1);
    },
    bmiLabel(bmi) {
      bmi = bmi == null ? Metrics.bmi() : bmi;
      if (bmi < 18.5) return 'Underweight';
      if (bmi < 25) return 'Healthy range';
      if (bmi < 30) return 'Above range';
      return 'High range';
    },

    /* did she keep at least one promise that day? */
    dayKept(dateKey) {
      const p = get().promises[dateKey];
      if (!p) return false;
      return PROMISE_KEYS.some(function (k) { return !!p[k]; });
    },
    dayScore(dateKey) {
      const p = get().promises[dateKey] || {};
      let n = 0; PROMISE_KEYS.forEach(function (k) { if (p[k]) n++; });
      return n; // 0..6
    },

    /* Current streak — consecutive days with >=1 promise kept.
       An unlogged *today* does NOT break the streak (tomorrow still counts). */
    streak() {
      const today = Dates.today();
      let cursor = Metrics.dayKept(today) ? today : Dates.addDays(today, -1);
      let n = 0;
      // hard stop so we never loop past the journey's start
      const floor = get().profile.startDate;
      while (Dates.diffDays(floor, cursor) >= 0) {
        if (Metrics.dayKept(cursor)) { n++; cursor = Dates.addDays(cursor, -1); }
        else break;
      }
      return n;
    },

    daysElapsed() {
      return Math.max(1, Dates.diffDays(get().profile.startDate, Dates.today()) + 1);
    },

    /* Promise Score = consistency over a rolling window (rewards showing up,
       not perfection). % of the last N days with at least one promise kept. */
    promiseScore(windowDays) {
      windowDays = windowDays || 30;
      const today = Dates.today();
      const span = Math.min(windowDays, Metrics.daysElapsed());
      let kept = 0;
      for (let i = 0; i < span; i++) {
        if (Metrics.dayKept(Dates.addDays(today, -i))) kept++;
      }
      return Math.round((kept / span) * 100);
    },

    consistencyScore() { return Metrics.promiseScore(30); },

    keptDaysTotal() {
      return Object.keys(get().promises).filter(function (d) { return Metrics.dayKept(d); }).length;
    },

    waterToday() { return get().water[Dates.today()] || 0; },

    /* Linear regression on weight -> slope (kg/day) for forecasting */
    trend() {
      const w = Metrics.sortedWeights();
      if (w.length < 2) return null;
      const base = Dates.parse(w[0].date).getTime();
      const xs = w.map(function (p) { return (Dates.parse(p.date).getTime() - base) / 86400000; });
      const ys = w.map(function (p) { return p.kg; });
      const n = xs.length;
      const sx = xs.reduce(function (a, b) { return a + b; }, 0);
      const sy = ys.reduce(function (a, b) { return a + b; }, 0);
      const sxx = xs.reduce(function (a, b) { return a + b * b; }, 0);
      const sxy = xs.reduce(function (a, b, i) { return a + b * ys[i]; }, 0);
      const denom = (n * sxx - sx * sx);
      if (denom === 0) return null;
      const slope = (n * sxy - sx * sy) / denom;   // kg per day
      const intercept = (sy - slope * sx) / n;
      return { slope: slope, intercept: intercept, base: w[0].date, weeklyRate: round(slope * 7, 2) };
    },

    forecast() {
      const t = Metrics.trend();
      const cur = Metrics.currentWeight();
      const goal = Metrics.goalWeight();
      if (cur <= goal) return { arrived: true };
      if (!t || t.slope >= -0.0005) {
        return { unknown: true, weeklyRate: t ? t.weeklyRate : 0 };
      }
      const daysNeeded = (goal - cur) / t.slope; // slope negative -> positive days
      const arrival = Dates.addDays(Dates.today(), Math.ceil(daysNeeded));
      return {
        arrived: false,
        weeklyRate: t.weeklyRate,
        daysNeeded: Math.ceil(daysNeeded),
        arrivalKey: arrival,
        arrivalPretty: Dates.parse(arrival).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
      };
    },

    /* Weight change across a window (returns null when not enough data) */
    weightChangeSince(dateKey) {
      const w = Metrics.sortedWeights().filter(function (p) { return p.date >= dateKey; });
      if (!w.length) return null;
      const earlier = Metrics.sortedWeights().filter(function (p) { return p.date < dateKey; });
      const from = earlier.length ? earlier[earlier.length - 1].kg : w[0].kg;
      const to = w[w.length - 1].kg;
      return round(to - from, 1);
    }
  };

  /* -----------------------------------------------------------------
     Achievements engine — gentle, consistency-first.
     ----------------------------------------------------------------- */
  const Achievements = {
    catalog: [
      { id: 'consistent7', title: '7 Consistent Days', note: 'You kept coming home.', icon: '🌱',
        test: function () { return Metrics.keptDaysTotal() >= 7; } },
      { id: 'lost5', title: 'First 5kg Lighter', note: 'Softly, surely.', icon: '🕊️',
        test: function () { return Metrics.totalLost() >= 5; } },
      { id: 'lost10', title: 'First 10kg Lighter', note: 'Look how far.', icon: '✨',
        test: function () { return Metrics.totalLost() >= 10; } },
      { id: 'w90', title: 'Hello, 90kg', note: 'A quiet milestone.', icon: '🤍',
        test: function () { return Metrics.currentWeight() <= 90 && Metrics.startWeight() > 90; } },
      { id: 'w85', title: 'Hello, 85kg', note: 'Still going.', icon: '🌸',
        test: function () { return Metrics.currentWeight() <= 85; } },
      { id: 'w80', title: 'Hello, 80kg', note: 'Almost her.', icon: '💗',
        test: function () { return Metrics.currentWeight() <= 80; } },
      { id: 'w75', title: '75kg — Welcome Home', note: 'You returned to her.', icon: '👑',
        test: function () { return Metrics.currentWeight() <= 75; } },
      { id: 'book1', title: 'First Book Finished', note: 'A whole world, read.', icon: '📖',
        test: function () { return get().content.books.some(function (b) { return b.done; }); } },
      { id: 'biz1', title: 'First Business Goal', note: 'She builds things.', icon: '🏛️',
        test: function () {
          return get().content.businesses.some(function (b) { return b.done; }) ||
                 get().wealth.goals.some(function (g) { return g.done; });
        } },
      { id: 'posts100', title: '100 Pieces Created', note: 'A body of work.', icon: '🎬',
        test: function () { return (get().content.posts || 0) >= 100; } },
      { id: 'year1', title: 'One Year, Consistent', note: 'A softer, steadier woman.', icon: '🌷',
        test: function () { return Metrics.daysElapsed() >= 365 && Metrics.consistencyScore() >= 60; } }
    ],
    evaluate() {
      if (!state) return;
      const today = Dates.today();
      let unlocked = [];
      Achievements.catalog.forEach(function (a) {
        if (!state.achievements[a.id] && a.test()) {
          state.achievements[a.id] = today;
          unlocked.push(a);
        }
      });
      if (unlocked.length) {
        global.dispatchEvent(new CustomEvent('p75:unlocked', { detail: unlocked }));
      }
    }
  };

  /* -----------------------------------------------------------------
     Export / Import — data belongs to her.
     ----------------------------------------------------------------- */
  const Data = {
    exportJSON() {
      const payload = { app: 'Project 75 — Returning to Her', exportedAt: new Date().toISOString(), state: get() };
      return JSON.stringify(payload, null, 2);
    },
    download() {
      const blob = new Blob([Data.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project-75-backup-' + Dates.today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },
    import(text) {
      const parsed = JSON.parse(text);
      const incoming = parsed.state || parsed;
      state = deepMerge(defaults(), incoming);
      save();
      global.dispatchEvent(new CustomEvent('p75:changed'));
      return true;
    },
    reset() {
      state = defaults();
      save();
      global.dispatchEvent(new CustomEvent('p75:changed'));
    }
  };

  /* -----------------------------------------------------------------
     Public API
     ----------------------------------------------------------------- */
  global.P75 = global.P75 || {};
  global.P75.Store = {
    load: load, get: get, save: save, mutate: mutate,
    uid: uid, round: round, clamp: clamp,
    PROMISE_KEYS: PROMISE_KEYS
  };
  global.P75.Dates = Dates;
  global.P75.Metrics = Metrics;
  global.P75.Media = Media;
  global.P75.Achievements = Achievements;
  global.P75.Data = Data;

})(window);
