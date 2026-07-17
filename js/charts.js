/* =====================================================================
   PROJECT 75 — charts.js
   Hand-drawn SVG charts. No external libraries (so it works offline):
     • ring()        Apple-style animated progress ring
     • weightChart() Apple Health-style smooth line + gradient + forecast
     • miniBars()    weekly promise bars
   All return SVG strings. animateIn() plays them after insertion.
   ===================================================================== */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  let gradSeed = 0;

  function esc(s) { return String(s).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
  }); }

  /* ---------- Progress ring ----------
     opts: { percent, size, stroke, label, sub, gradient:[c1,c2], track } */
  function ring(opts) {
    opts = opts || {};
    const size = opts.size || 160;
    const stroke = opts.stroke || 14;
    const p = Math.max(0, Math.min(100, opts.percent || 0));
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const cx = size / 2, cy = size / 2;
    const gid = 'rg' + (gradSeed++);
    const g = opts.gradient || ['#F3B7C6', '#E38AA0'];
    const track = opts.track || 'rgba(0,0,0,0.06)';
    const offset = c * (1 - p / 100);

    return `
      <div class="ring" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(opts.aria || (p + ' percent'))}">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="${g[0]}"/>
              <stop offset="1" stop-color="${g[1]}"/>
            </linearGradient>
          </defs>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
          <circle class="ring-fill" cx="${cx}" cy="${cy}" r="${r}" fill="none"
            stroke="url(#${gid})" stroke-width="${stroke}" stroke-linecap="round"
            stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}"
            data-target="${offset.toFixed(2)}"
            transform="rotate(-90 ${cx} ${cy})"/>
        </svg>
        <div class="ring-center">
          ${opts.label != null ? `<div class="ring-label">${opts.label}</div>` : ''}
          ${opts.sub != null ? `<div class="ring-sub">${esc(opts.sub)}</div>` : ''}
        </div>
      </div>`;
  }

  /* ---------- Catmull-Rom -> cubic bezier smoothing ---------- */
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  /* ---------- Weight chart ----------
     data: [{date, kg}] sorted ; opts: {goal, forecast:{arrivalKey,slope,intercept,base}} */
  function weightChart(data, opts) {
    opts = opts || {};
    const W = 680, H = 260;
    const padL = 38, padR = 16, padT = 18, padB = 26;
    const iw = W - padL - padR, ih = H - padT - padB;
    const Dates = global.P75.Dates;

    if (!data || data.length === 0) {
      return `<div class="chart-empty">Log a weight to see your line take shape.</div>`;
    }

    // Build x domain across data (+ forecast arrival if present)
    let keys = data.map(function (d) { return d.date; });
    let endKey = keys[keys.length - 1];
    if (opts.forecast && opts.forecast.arrivalKey) endKey = opts.forecast.arrivalKey;
    const startKey = keys[0];
    const spanDays = Math.max(1, Dates.diffDays(startKey, endKey));

    // y domain
    let ys = data.map(function (d) { return d.kg; });
    let lo = Math.min.apply(null, ys.concat([opts.goal || Infinity]));
    let hi = Math.max.apply(null, ys);
    lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1);
    if (hi - lo < 4) { hi = lo + 4; }

    function X(k) { return padL + (Dates.diffDays(startKey, k) / spanDays) * iw; }
    function Y(kg) { return padT + (1 - (kg - lo) / (hi - lo)) * ih; }

    const pts = data.map(function (d) { return { x: X(d.date), y: Y(d.kg) }; });
    const line = smoothPath(pts);
    const area = line + ` L ${pts[pts.length - 1].x} ${padT + ih} L ${pts[0].x} ${padT + ih} Z`;

    // gridlines (4)
    let grid = '';
    for (let i = 0; i <= 3; i++) {
      const val = lo + (hi - lo) * (i / 3);
      const y = Y(val);
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="grid"/>`;
      grid += `<text x="6" y="${(y + 3).toFixed(1)}" class="axis-y">${Math.round(val)}</text>`;
    }

    // goal line
    let goalLine = '';
    if (opts.goal != null && opts.goal >= lo && opts.goal <= hi) {
      const gy = Y(opts.goal);
      goalLine = `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" class="goal-line"/>
        <text x="${W - padR}" y="${(gy - 6).toFixed(1)}" text-anchor="end" class="goal-label">Goal ${opts.goal}kg</text>`;
    }

    // forecast dashed segment from last point to goal @ arrival
    let forecast = '';
    if (opts.forecast && opts.forecast.arrivalKey && opts.goal != null) {
      const last = pts[pts.length - 1];
      const fx = X(opts.forecast.arrivalKey);
      const fy = Y(opts.goal);
      forecast = `<path d="M ${last.x} ${last.y} L ${fx.toFixed(1)} ${fy.toFixed(1)}" class="forecast"/>
        <circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="4.5" class="forecast-dot"/>`;
    }

    const dots = pts.map(function (p, i) {
      const big = (i === pts.length - 1);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${big ? 5 : 3}" class="dot${big ? ' dot-now' : ''}"/>`;
    }).join('');

    // x labels (first & last)
    const xLabels =
      `<text x="${padL}" y="${H - 6}" class="axis-x">${esc(Dates.prettyShort(startKey))}</text>
       <text x="${W - padR}" y="${H - 6}" text-anchor="end" class="axis-x">${esc(Dates.prettyShort(endKey))}</text>`;

    const gid = 'wg' + (gradSeed++);
    const len = Math.max(1, line.length); // used to animate stroke

    return `
      <svg class="weight-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Weight over time">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="rgba(227,138,160,0.34)"/>
            <stop offset="1" stop-color="rgba(227,138,160,0.02)"/>
          </linearGradient>
        </defs>
        ${grid}
        ${goalLine}
        <path d="${area}" fill="url(#${gid})" stroke="none" class="area"/>
        ${forecast}
        <path d="${line}" fill="none" class="wline" data-len="${len}"/>
        ${dots}
        ${xLabels}
      </svg>`;
  }

  /* ---------- Mini weekly bars (promise kept 0..6 per day) ---------- */
  function miniBars(values, labels, opts) {
    opts = opts || {};
    const max = opts.max || 6;
    return `<div class="mini-bars">` + values.map(function (v, i) {
      const pct = Math.round((v / max) * 100);
      return `<div class="mb-col">
        <div class="mb-track"><div class="mb-fill" style="height:0" data-h="${pct}"></div></div>
        <div class="mb-lab">${esc(labels[i] || '')}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  /* ---------- Play entrance animations after DOM insertion ---------- */
  function animateIn(root, instant) {
    root = root || document;
    if (instant || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      root.querySelectorAll('.ring-fill').forEach(function (el) {
        el.style.transition = 'none';
        el.style.strokeDashoffset = el.getAttribute('data-target');
      });
      root.querySelectorAll('.mb-fill').forEach(function (el) { el.style.height = el.getAttribute('data-h') + '%'; });
      root.querySelectorAll('.wline').forEach(function (el) { el.style.strokeDasharray = 'none'; el.style.strokeDashoffset = '0'; });
      return;
    }
    // rings
    root.querySelectorAll('.ring-fill').forEach(function (el) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.style.strokeDashoffset = el.getAttribute('data-target'); });
      });
    });
    // bars
    root.querySelectorAll('.mb-fill').forEach(function (el, i) {
      setTimeout(function () { el.style.height = el.getAttribute('data-h') + '%'; }, 60 + i * 40);
    });
    // weight line draw-on
    root.querySelectorAll('.wline').forEach(function (el) {
      try {
        const L = el.getTotalLength();
        el.style.strokeDasharray = L;
        el.style.strokeDashoffset = L;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            el.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1)';
            el.style.strokeDashoffset = '0';
          });
        });
      } catch (e) { /* getTotalLength unsupported */ }
    });
  }

  global.P75 = global.P75 || {};
  global.P75.Charts = { ring: ring, weightChart: weightChart, miniBars: miniBars, animateIn: animateIn };

})(window);
