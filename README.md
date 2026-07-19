# Project 75 — Returning to Her

> *A beautiful life is also a goal.*

A premium, offline-first Progressive Web App. Not a weight-loss app — a soft, accountable **life operating system** built for one woman: to become healthier, softer, more disciplined, and more intentional over the next ten years.

It never says *you failed*, *you cheated*, or *start again*. It says **Continue. Tomorrow still counts. Welcome home.**
And it holds the line: if the plan says no soda, it answers *"Soda is not part of today's agreement."* It does not negotiate.

---

## What's inside

- **Today** — a morning home screen: *Good morning. Welcome home.* Today's Plan (Drink water · Follow today's diet · Create something · Protect your peace · Continue), water tracker, and a gentle *"That is enough."*
- **Body**
  - **Weight** — starting / current / goal / remaining / total lost, an Apple Health-style line chart, BMI, weekly-only weigh-ins, a **weight forecast** with an estimated arrival date, measurements, and private progress photos.
  - **Food** — *Should I Eat This?* (firm yes/no), **Wait 20 Minutes** (mood check → water → timer), and your **Non-negotiables**.
  - **Future Her** — *What would 75kg her do?*
- **Resets** — Content, Wealth, Love, Soft Life, and The Beautiful Life.
- **The Vault** — journals, letters to future me, dreams, voice notes, and photos.
- **Progress** — the **Promise Score** (the app's primary metric), streak, consistency, this-week bars, weekly / monthly / quarterly reports, and gentle achievements.
- **Settings** — light / dark / system theme, reminders, data export & import.

**The one question it asks:** *Did you keep at least one promise to yourself today?* If yes — today counts.

---

## Technology

- Vanilla HTML, CSS, and JavaScript — **zero dependencies**, so it runs fully offline.
- **localStorage** for structured data, **IndexedDB** for photos and voice notes.
- A **service worker** caches the app shell for offline use.
- Installable PWA (manifest + icons), responsive, with dark mode.

Everything stays **on the device**. Nothing is uploaded anywhere.

## Files

```
index.html            App shell + full design system (inline CSS)
manifest.json         PWA manifest
service-worker.js     Offline caching
js/store.js           State, metrics, forecasting, export/import
js/charts.js          Progress rings + weight chart (hand-drawn SVG)
js/food.js            "Should I Eat This?" accountability logic
js/app.js             Screens, routing, all interactions
icons/                App icons (192, 512, maskable, apple-touch)
```

---

## Run it locally

Because it uses a service worker, open it through a small web server (not `file://`):

```bash
cd project-75
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `project-75`).
2. Upload the **contents** of this folder to the repo root (so `index.html` sits at the top level).
3. In the repo: **Settings → Pages → Build and deployment**.
4. Set **Source: Deploy from a branch**, **Branch: `main` / `root`**, then **Save**.
5. After a minute your app is live at `https://<your-username>.github.io/project-75/`.

All paths are relative, so it works from that sub-folder automatically.

### Install on your phone
- **iPhone (Safari):** open the link → Share → **Add to Home Screen**.
- **Android (Chrome):** open the link → menu → **Install app**.

Once installed it opens full-screen and works offline.

---

## Updating

If you change any core file, bump the cache name in `service-worker.js` (e.g. `project75-v1` → `project75-v2`) so devices pick up the new version.

## A note on reminders

Browser notifications fire while the app is open or installed. True scheduled push notifications need a server and aren't part of this fully-offline, on-device build — by design, nothing leaves your phone.

---

*You don't have to become her. You're returning to her.*
