'use strict';

/* ================= Daten ================= */
const KEY = 'meinTag.v1';
const MEALS = [
  ['fruehstueck', 'Frühstück', '🥐'],
  ['mittag', 'Mittag', '🥗'],
  ['abend', 'Abend', '🍝'],
  ['snack', 'Snack', '🍎']
];
const MEAL = Object.fromEntries(MEALS.map(([k, label, icon]) => [k, { label, icon }]));
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const defaults = () => ({
  settings: {
    kcalGoal: 1900, waterGoal: 2000, gymGoal: 2,
    startWeight: 81.9, targetWeight: 70,
    waterFrom: '06:35', waterTo: '22:00'
  },
  days: {},      // "2026-11-08": { food: [...], water: [...] }
  gym: [],       // ["2026-11-08", ...]
  weights: [],   // [{ id, date, kg }]
  favorites: []  // [{ id, name, kcal, meal }]
});

function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...d, ...p, settings: { ...d.settings, ...(p.settings || {}) } };
    }
  } catch (e) { /* kaputte Daten -> Standardwerte */ }
  return d;
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Konnte nicht speichern'); }
}

/* ================= Hilfen ================= */
const now = () => new Date();
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => dkey(now());
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.round(n).toLocaleString('de-DE');
const fmtKg = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v) => parseFloat(String(v).replace(',', '.'));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeLabel = (t) => t.replace(/^0/, '') + ' Uhr';
const dateLong = (d) => d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const dateShort = (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y) / 86400000 + 1) / 7);
}
function relDay(k) {
  const t = todayKey();
  if (k === t) return 'Heute';
  if (k === dkey(addDays(now(), -1))) return 'Gestern';
  return dateShort(parseKey(k));
}

const day = (k) => S.days[k] || { food: [], water: [] };
function dayRW(k) {
  if (!S.days[k]) S.days[k] = { food: [], water: [] };
  S.days[k].food = S.days[k].food || [];
  S.days[k].water = S.days[k].water || [];
  return S.days[k];
}
const kcalOf = (k) => (day(k).food || []).reduce((a, e) => a + (+e.kcal || 0), 0);
const waterOf = (k) => (day(k).water || []).reduce((a, e) => a + (+e.ml || 0), 0);
const byTime = (a, b) => toMin(a.time) - toMin(b.time);
function guessMeal(t) {
  const m = toMin(t);
  if (m >= 4 * 60 && m < 10 * 60 + 30) return 'fruehstueck';
  if (m >= 11 * 60 && m < 15 * 60) return 'mittag';
  if (m >= 17 * 60 && m < 22 * 60) return 'abend';
  return 'snack';
}
function ringClass(eaten, goal) {
  const p = goal > 0 ? eaten / goal : 0;
  return p > 1 ? 'red' : p >= 0.9 ? 'orange' : 'green';
}
const gymWeek = (monday) => WD.map((_, i) => S.gym.includes(dkey(addDays(monday, i))));

/* ================= Navigation ================= */
const TITLES = {
  heute: 'Mein Tag', essen: 'Essen', wasser: 'Wasser', gym: 'Gym', gewicht: 'Gewicht',
  verlauf: 'Verlauf', erinnerungen: 'Erinnerungen', einstellungen: 'Einstellungen'
};
let view = (location.hash || '#heute').slice(1);
if (!TITLES[view]) view = 'heute';
let essenDate = null;   // null = heute
let favEdit = false;
const $app = document.getElementById('app');

function go(v) {
  view = v;
  if (v !== 'essen') essenDate = null;
  favEdit = false;
  history.replaceState(null, '', '#' + v);
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.getElementById('title').textContent = TITLES[view];
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  $app.innerHTML = VIEWS[view]();
}

/* ================= Bausteine ================= */
function ring(eaten, goal, small) {
  const r = 90, c = 2 * Math.PI * r;
  const p = goal > 0 ? eaten / goal : 0;
  const dash = Math.min(p, 1) * c;
  const left = goal - eaten;
  return `
  <div class="ring ${ringClass(eaten, goal)} ${small ? 'small' : ''}">
    <svg viewBox="0 0 220 220" aria-hidden="true">
      <circle class="ring-bg" cx="110" cy="110" r="${r}"/>
      <circle class="ring-fg" cx="110" cy="110" r="${r}" stroke-dasharray="${dash} ${c}"
        transform="rotate(-90 110 110)" style="opacity:${dash > 0 ? 1 : 0}"/>
    </svg>
    <div class="ring-c">
      <div class="ring-big">${fmt(eaten)}</div>
      <div class="ring-sub">kcal gegessen</div>
      <div class="ring-left">${left >= 0 ? `noch <b>${fmt(left)}</b> übrig` : `<b>${fmt(-left)}</b> drüber`}</div>
    </div>
  </div>`;
}

function kcalMotivation(eaten, goal) {
  if (eaten === 0) return 'Noch nichts eingetragen – guten Appetit! 🍽️';
  const p = eaten / goal;
  if (p > 1) return 'Etwas drüber – kein Problem, morgen ist ein neuer Tag 💚';
  if (p >= 0.9) return 'Fast am Ziel – gut aufpassen 🧡';
  if (p >= 0.5) return 'Du bist super im Plan 👍';
  return 'Guter Start in den Tag ✨';
}

function waterTimeline() {
  const g = S.settings.waterGoal;
  const drunk = waterOf(todayKey());
  const from = toMin(S.settings.waterFrom), to = Math.max(toMin(S.settings.waterTo), from + 60);
  const n = now();
  const m = n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
  const tf = clamp((m - from) / (to - from), 0, 1);
  const soll = Math.round((g * tf) / 10) * 10;
  const fill = clamp(drunk / g, 0, 1);
  const diff = drunk - soll;

  let status, cls = '';
  if (drunk >= g) { status = 'Tagesziel erreicht – stark! 🎉'; cls = 'ok'; }
  else if (m < from) status = `Dein Wassertag startet um ${timeLabel(S.settings.waterFrom)} 🌅`;
  else if (diff >= 100) { status = `Super, ${fmt(diff)} ml vor dem Plan 👍`; cls = 'ok'; }
  else if (diff > -100) { status = 'Genau im Plan 👌'; cls = 'ok'; }
  else { status = `${fmt(-diff)} ml hinterher – Zeit für ein Glas! 🚰`; cls = 'behind'; }

  const hours = [];
  const pos = (min) => ((min - from) / (to - from)) * 100;
  for (let h = Math.ceil(from / 60); h * 60 < to; h++) {
    if (h % 3 === 0 && pos(h * 60) > 12 && pos(h * 60) < 88) hours.push(h);
  }
  const edge = tf < 0.15 ? 'l' : tf > 0.85 ? 'r' : '';

  return `
  <div class="wt-top">
    <div class="wt-amount">${fmt(drunk)} <small>/ ${fmt(g)} ml</small></div>
    <div class="muted small">${Math.round((drunk / g) * 100)} %</div>
  </div>
  <div class="wt" role="img" aria-label="Getrunken ${fmt(drunk)} ml, Soll jetzt ${fmt(soll)} ml">
    <div class="wt-bar">
      <div class="wt-fill" style="width:${fill * 100}%"></div>
      <div class="wt-marker ${edge}" style="left:${tf * 100}%"><span>Soll jetzt<br>${fmt(soll)} ml</span></div>
    </div>
    <div class="wt-scale">
      <span style="left:0">${S.settings.waterFrom.replace(/^0/, '')}</span>
      ${hours.map((h) => `<span style="left:${pos(h * 60)}%">${h}:00</span>`).join('')}
      <span style="left:100%">${S.settings.waterTo.replace(/^0/, '')}</span>
    </div>
  </div>
  <div class="wt-status ${cls}">${status}</div>
  ${drunk >= g ? '<div class="done-badge">Geschafft! 💧</div>' : ''}`;
}

function gymBlock() {
  const n = now();
  const mon = mondayOf(n);
  const wk = gymWeek(mon);
  const count = wk.filter(Boolean).length;
  const goal = S.settings.gymGoal;
  const tIdx = (n.getDay() + 6) % 7;
  return `
  <div class="week">
    ${WD.map((w, i) => {
      const k = dkey(addDays(mon, i));
      const cls = [wk[i] ? 'yes' : '', i === tIdx ? 'today' : '', i > tIdx ? 'future' : ''].join(' ');
      return `<button class="wd ${cls}" data-act="gym-toggle" data-date="${k}" ${i > tIdx ? 'disabled' : ''}
        aria-label="${w}${wk[i] ? ' – im Gym gewesen' : ''}">${w}<i>${wk[i] ? '✓' : ''}</i></button>`;
    }).join('')}
  </div>
  <div class="gym-count">${count >= goal
    ? `<span class="ok">${count} von ${goal} geschafft – Wochenziel erreicht! 🏆</span>`
    : `${count} von ${goal} geschafft`}</div>`;
}

function gymButton() {
  const done = S.gym.includes(todayKey());
  return done
    ? `<button class="btn done" data-act="gym-today">✓ Heute erledigt – Rückgängig</button>`
    : `<button class="btn gym" data-act="gym-today">💪 Heute im Gym gewesen</button>`;
}

function gymBanner() {
  const n = now();
  const dow = (n.getDay() + 6) % 7; // Mo = 0
  const count = gymWeek(mondayOf(n)).filter(Boolean).length;
  const goal = S.settings.gymGoal;
  if (dow >= 3 && count === 0) {
    const txt = `Diese Woche noch ${goal} ${goal === 1 ? 'Training' : 'Trainings'}, plane heute oder morgen eins ein 💪`;
    return `<div class="banner"><span class="em">🏋️</span><span>${txt}</span></div>`;
  }
  return '';
}

function foodItem(e, dateKey) {
  return `<li class="item tap" data-act="food-edit" data-id="${e.id}" data-date="${dateKey}">
    <div class="ico">${MEAL[e.meal]?.icon || '🍽️'}</div>
    <div class="txt"><b>${esc(e.name)}</b><small>${timeLabel(e.time)} · ${MEAL[e.meal]?.label || ''}</small></div>
    <div class="val">${fmt(e.kcal)} kcal</div>
  </li>`;
}
function waterItem(e, dateKey) {
  return `<li class="item">
    <div class="ico w">💧</div>
    <div class="txt"><b>Wasser</b><small>${timeLabel(e.time)}</small></div>
    <div class="val">${fmt(e.ml)} ml</div>
    <button class="del" data-act="water-del" data-id="${e.id}" data-date="${dateKey}" aria-label="Löschen">✕</button>
  </li>`;
}

function barChart(items, goal, unit) {
  const W = 320, H = 150, top = 16, bottom = 24, left = 4, right = 4;
  const max = Math.max(goal * 1.2, ...items.map((i) => i.v), 1);
  const ch = H - top - bottom;
  const bw = (W - left - right) / items.length;
  const y = (v) => top + ch - (v / max) * ch;
  const bars = items.map((it, i) => {
    const h = Math.max((it.v / max) * ch, it.v > 0 ? 3 : 0);
    const x = left + i * bw + bw * 0.18;
    const w = bw * 0.64;
    return `
      <rect x="${x}" y="${top + ch - h}" width="${w}" height="${h}" rx="5" fill="${it.color}"/>
      ${it.v > 0 ? `<text x="${x + w / 2}" y="${top + ch - h - 4}" text-anchor="middle" style="font-size:9.5px">${it.v >= 1000 ? (it.v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k' : fmt(it.v)}</text>` : ''}
      <text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" class="${it.today ? 'lbl-today' : ''}">${it.label}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf der letzten 7 Tage">
    <line class="grid" x1="0" x2="${W}" y1="${top + ch}" y2="${top + ch}"/>
    ${bars}
    <line class="goal" x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}"/>
    <text x="${W - 2}" y="${y(goal) - 4}" text-anchor="end">Ziel ${fmt(goal)} ${unit}</text>
  </svg>`;
}

function last7(fn, colorFn) {
  const t = now();
  const items = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(t, -i);
    const k = dkey(d);
    const v = fn(k);
    items.push({ label: i === 0 ? 'Heute' : WD[(d.getDay() + 6) % 7], v, color: colorFn(v), today: i === 0 });
  }
  return items;
}
const css = (name) => `var(--${name})`;
function kcalChart() {
  const g = S.settings.kcalGoal;
  const items = last7(kcalOf, (v) => css(ringClass(v, g)));
  const withData = items.filter((i) => i.v > 0);
  const avg = withData.length ? withData.reduce((a, i) => a + i.v, 0) / withData.length : 0;
  return `<div class="card">
    <div class="card-head"><h2>Letzte 7 Tage</h2><span class="muted small">${avg ? `Ø ${fmt(avg)} kcal` : ''}</span></div>
    ${barChart(items, g, 'kcal')}
  </div>`;
}
function waterChart() {
  const g = S.settings.waterGoal;
  const items = last7(waterOf, (v) => (v >= g ? css('water') : css('water-2')));
  return `<div class="card">
    <div class="card-head"><h2>Letzte 7 Tage</h2><span class="muted small">${items.filter((i) => i.v >= g).length} von 7 Tagen geschafft</span></div>
    ${barChart(items, g, 'ml')}
  </div>`;
}

/* ================= Ansichten ================= */
const VIEWS = {
  heute() {
    const k = todayKey();
    const eaten = kcalOf(k);
    const g = S.settings.kcalGoal;
    const h = now().getHours();
    const hello = h < 5 ? 'Gute Nacht 🌙' : h < 11 ? 'Guten Morgen ☀️' : h < 17 ? 'Hallo 👋' : 'Guten Abend 🌆';
    const d = day(k);
    const entries = [
      ...(d.food || []).map((e) => ({ ...e, _t: 'f' })),
      ...(d.water || []).map((e) => ({ ...e, _t: 'w' }))
    ].sort(byTime);

    return `
    <div class="hello"><b>${hello}</b><span class="muted">${dateLong(now())}</span></div>
    ${gymBanner()}
    <section class="card">
      <div class="card-head"><h2>🍽️ Kalorien</h2><button class="link" data-act="go" data-view="essen">Details ›</button></div>
      ${ring(eaten, g)}
      <div class="goal-line">${kcalMotivation(eaten, g)} · Ziel ${fmt(g)} kcal</div>
      <button class="btn primary" data-act="food-new">＋ Essen eintragen</button>
    </section>
    <section class="card">
      <div class="card-head"><h2>💧 Wasser</h2><button class="link" data-act="go" data-view="wasser">Details ›</button></div>
      ${waterTimeline()}
      <div class="row" style="margin-top:14px">
        <button class="btn water" data-act="water-add" data-ml="250">+250 ml</button>
        <button class="btn water" data-act="water-add" data-ml="500">+500 ml</button>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>💪 Gym diese Woche</h2><button class="link" data-act="go" data-view="gym">Details ›</button></div>
      ${gymBlock()}
      ${gymButton()}
    </section>
    <section class="card">
      <div class="card-head"><h2>📝 Heute eingetragen</h2></div>
      ${entries.length
        ? `<ul class="list">${entries.map((e) => (e._t === 'f' ? foodItem(e, k) : waterItem(e, k))).join('')}</ul>`
        : '<div class="empty">Noch keine Einträge. Los geht’s! 🌱</div>'}
    </section>`;
  },

  essen() {
    const k = essenDate || todayKey();
    const isToday = k === todayKey();
    const eaten = kcalOf(k);
    const g = S.settings.kcalGoal;
    const food = [...(day(k).food || [])].sort(byTime);
    const groups = MEALS.map(([key, label, icon]) => {
      const list = food.filter((e) => e.meal === key);
      if (!list.length) return '';
      const sum = list.reduce((a, e) => a + (+e.kcal || 0), 0);
      return `<div class="meal-head"><span>${icon} ${label}</span><span class="muted">${fmt(sum)} kcal</span></div>
        <ul class="list">${list.map((e) => foodItem(e, k)).join('')}</ul>`;
    }).join('');

    return `
    <div class="daynav">
      <button data-act="day-prev" aria-label="Vorheriger Tag">‹</button>
      <b>${isToday ? 'Heute' : relDay(k)}, ${parseKey(k).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</b>
      <button data-act="day-next" aria-label="Nächster Tag" ${isToday ? 'disabled' : ''}>›</button>
    </div>
    <section class="card">
      ${ring(eaten, g)}
      <div class="goal-line">Ziel ${fmt(g)} kcal</div>
      <button class="btn primary" data-act="food-new">＋ Essen eintragen</button>
    </section>
    <section class="card">
      <div class="card-head"><h2>⭐ Favoriten</h2>
        ${S.favorites.length ? `<button class="link" data-act="fav-edit">${favEdit ? 'Fertig' : 'Bearbeiten'}</button>` : ''}</div>
      ${favChips(favEdit ? 'fav-del' : 'fav-add', k)}
    </section>
    <section class="card">
      <div class="card-head"><h2>Einträge</h2><span class="muted small">Tippen zum Bearbeiten</span></div>
      ${groups || '<div class="empty">Noch nichts eingetragen.</div>'}
    </section>
    ${kcalChart()}`;
  },

  wasser() {
    const k = todayKey();
    const list = [...(day(k).water || [])].sort(byTime).reverse();
    return `
    <section class="card">${waterTimeline()}</section>
    <section class="card">
      <div class="grid3">
        <button class="qbtn" data-act="water-add" data-ml="250">+250 ml<small>Glas 🥛</small></button>
        <button class="qbtn" data-act="water-add" data-ml="330">+330 ml<small>Dose 🥤</small></button>
        <button class="qbtn" data-act="water-add" data-ml="500">+500 ml<small>Flasche 🍶</small></button>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" data-act="water-custom">✏️ Eigene Menge</button>
        <button class="btn" data-act="water-undo" ${list.length ? '' : 'disabled'}>↩️ Rückgängig</button>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Heute getrunken</h2></div>
      ${list.length ? `<ul class="list">${list.map((e) => waterItem(e, k)).join('')}</ul>` : '<div class="empty">Noch nichts getrunken – Prost! 🥂</div>'}
    </section>
    ${waterChart()}`;
  },

  gym() {
    const goal = S.settings.gymGoal;
    const mon = mondayOf(now());
    let hist = '';
    for (let w = 1; w <= 8; w++) {
      const m = addDays(mon, -7 * w);
      const c = gymWeek(m).filter(Boolean).length;
      hist += `<li class="item">
        <div class="ico">${c >= goal ? '🏆' : c > 0 ? '💪' : '😴'}</div>
        <div class="txt"><b>KW ${isoWeek(m)}</b><small>${m.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${addDays(m, 6).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</small></div>
        <div class="val">${c} / ${goal}</div>
      </li>`;
    }
    return `
    ${gymBanner()}
    <section class="card">
      <div class="card-head"><h2>Diese Woche (KW ${isoWeek(now())})</h2></div>
      ${gymBlock()}
      ${gymButton()}
      <p class="muted small center" style="margin:12px 0 0">Vergessen einzutragen? Tippe auf einen vergangenen Tag.</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>Letzte Wochen</h2></div>
      <ul class="list">${hist}</ul>
    </section>`;
  },

  gewicht() {
    const st = S.settings;
    const ws = [...S.weights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const cur = ws.length ? ws[ws.length - 1].kg : st.startWeight;
    const total = st.startWeight - st.targetWeight;
    const doneKg = st.startWeight - cur;
    const p = total !== 0 ? clamp(doneKg / total, 0, 1) : 0;
    const left = cur - st.targetWeight;
    return `
    <section class="card">
      <div class="stats">
        <div><b>${fmtKg(st.startWeight)}</b><small>Start (kg)</small></div>
        <div><b>${fmtKg(cur)}</b><small>Aktuell (kg)</small></div>
        <div><b>${fmtKg(st.targetWeight)}</b><small>Ziel (kg)</small></div>
      </div>
      <div class="pbar"><div style="width:${p * 100}%"></div></div>
      <p style="margin:10px 0 0;font-weight:600">${left <= 0
        ? 'Ziel erreicht! Du kannst richtig stolz sein 🎉'
        : `${doneKg > 0 ? `${fmtKg(doneKg)} kg geschafft (${Math.round(p * 100)} %) · ` : ''}noch ${fmtKg(left)} kg bis zum Ziel`}</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>Gewicht eintragen</h2></div>
      <div class="row">
        <label class="f">Datum<input type="date" id="w-date" value="${todayKey()}" max="${todayKey()}"></label>
        <label class="f">Gewicht (kg)<input type="text" inputmode="decimal" id="w-kg" placeholder="z. B. 80,5"></label>
      </div>
      <button class="btn primary" data-act="weight-add">Speichern</button>
      <p class="muted small" style="margin:10px 0 0">Tipp: 1× pro Woche morgens nach dem Aufstehen wiegen.</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>Verlauf</h2></div>
      ${ws.length ? weightChart(ws) : '<div class="empty">Trag dein erstes Gewicht ein, dann erscheint hier dein Verlauf 📈</div>'}
      ${ws.length ? `<ul class="list" style="margin-top:8px">${[...ws].reverse().map((w, i, arr) => {
        const prev = arr[i + 1];
        const diff = prev ? w.kg - prev.kg : null;
        return `<li class="item"><div class="ico">⚖️</div>
          <div class="txt"><b>${fmtKg(w.kg)} kg</b><small>${dateShort(parseKey(w.date))}${diff !== null && diff !== 0 ? ` · ${diff < 0 ? '▼' : '▲'} ${fmtKg(Math.abs(diff))} kg` : ''}</small></div>
          <button class="del" data-act="weight-del" data-id="${w.id}" aria-label="Löschen">✕</button></li>`;
      }).join('')}</ul>` : ''}
    </section>`;
  },

  verlauf() {
    const keys = new Set([...Object.keys(S.days), ...S.gym]);
    keys.add(todayKey());
    const list = [...keys].filter((k) => k <= todayKey()).sort().reverse();
    return `
    <section class="card">
      <p class="muted small" style="margin:0 0 6px">Alle Tage bleiben hier gespeichert. Tippe auf einen Tag, um die Mahlzeiten anzusehen oder zu ändern.</p>
      <ul class="list">${list.map((k) => {
        const kc = kcalOf(k), w = waterOf(k);
        return `<li class="item tap" data-act="open-day" data-date="${k}">
          <div class="ico">${S.gym.includes(k) ? '💪' : '📅'}</div>
          <div class="txt"><b>${relDay(k)}</b><small>${fmt(kc)} kcal · ${fmt(w)} ml${w >= S.settings.waterGoal ? ' 💧' : ''}</small></div>
          <div class="val" style="color:${css(ringClass(kc, S.settings.kcalGoal))}">●</div>
        </li>`;
      }).join('')}</ul>
    </section>`;
  },

  erinnerungen() {
    const hours = [];
    for (let h = 7; h <= 22; h++) hours.push(`${h}:00`);
    return `
    <section class="card guide">
      <div class="note">📱 Web-Apps können auf dem iPhone ohne Server keine zuverlässigen Erinnerungen schicken. Deshalb nutzen wir die vorinstallierte Apple-App <b>„Kurzbefehle“</b>. Das musst du nur einmal einrichten.</div>

      <h3>Vorher: Mitteilungen erlauben</h3>
      <ol>
        <li>Öffne <b>Einstellungen</b> → <b>Mitteilungen</b> → <b>Kurzbefehle</b>.</li>
        <li>Schalte <b>„Mitteilungen erlauben“</b> ein.</li>
      </ol>

      <h3>💧 Trink-Erinnerung (stündlich)</h3>
      <ol>
        <li>Öffne die App <b>Kurzbefehle</b> (blaues Symbol mit zwei Rauten).</li>
        <li>Tippe unten auf <b>„Automation“</b>.</li>
        <li>Tippe oben rechts auf <b>„+“</b> (beim allerersten Mal: <b>„Neue Automation“</b>).</li>
        <li>Wähle <b>„Tageszeit“</b>.</li>
        <li>Stelle die Uhrzeit auf <b>7:00</b>. Lass <b>„Täglich“</b> ausgewählt.</li>
        <li>Wähle unten <b>„Sofort ausführen“</b> und schalte <b>„Bei Ausführung mitteilen“</b> aus. Tippe auf <b>„Weiter“</b>.</li>
        <li>Tippe auf <b>„Neue leere Automation“</b>.</li>
        <li>Tippe auf <b>„Aktion hinzufügen“</b>, gib oben in die Suche <code>Mitteilung</code> ein und wähle <b>„Mitteilung anzeigen“</b>.</li>
        <li>Tippe auf den blauen Text <b>„Hallo Welt!“</b>, lösche ihn und schreibe: <code>💧 Zeit zu trinken!</code></li>
        <li>Tippe oben rechts auf <b>„Fertig“</b>. ✅</li>
      </ol>
      <p>Wiederhole das für jede volle Stunde (insgesamt 16 Automationen):</p>
      <div class="times">${hours.map((h) => `<span>${h}</span>`).join('')}</div>
      <div class="note">💡 Das dauert ca. 10 Minuten – mach es gemütlich auf dem Sofa. Die Kurzbefehle-App kann leider keine „stündlich“-Wiederholung, darum eine Automation pro Uhrzeit.</div>

      <h3>💪 Gym-Erinnerung (Mi + Fr)</h3>
      <ol>
        <li>In Kurzbefehle → <b>„Automation“</b> → <b>„+“</b> → <b>„Tageszeit“</b>.</li>
        <li>Uhrzeit <b>17:00</b>, dann <b>„Wöchentlich“</b> wählen.</li>
        <li>Nur <b>Mittwoch</b> und <b>Freitag</b> anhaken (alle anderen Tage abwählen).</li>
        <li><b>„Sofort ausführen“</b> wählen, <b>„Bei Ausführung mitteilen“</b> ausschalten → <b>„Weiter“</b>.</li>
        <li><b>„Neue leere Automation“</b> → <b>„Aktion hinzufügen“</b> → <b>„Mitteilung anzeigen“</b>.</li>
        <li>Text: <code>Warst du diese Woche schon im Gym? 💪</code> → <b>„Fertig“</b>. ✅</li>
      </ol>

      <h3>Wichtig: Was passiert beim Tippen?</h3>
      <div class="note">Tippst du auf eine solche Mitteilung, öffnet Apple die <b>Kurzbefehle-App</b> – nicht direkt „Mein Tag“. Das ist eine Grenze von iOS für Web-Apps, die sich nicht umgehen lässt. Mein Tipp: Zieh das „Mein Tag“-Symbol <b>unten ins Dock</b>. Dann bist du nach der Erinnerung mit einem Tipp in der App.</div>

      <h3>Erinnerungen ändern oder löschen</h3>
      <ol>
        <li>Kurzbefehle → <b>„Automation“</b>.</li>
        <li>Zum Löschen eine Automation nach links wischen → <b>„Löschen“</b>.</li>
        <li>Zum Pausieren antippen und <b>„Ausführen“ → „Nicht ausführen“</b> wählen.</li>
      </ol>
    </section>`;
  },

  einstellungen() {
    const st = S.settings;
    return `
    <section class="card">
      <div class="card-head"><h2>Ziele</h2></div>
      <div class="set-row"><span>🍽️ Kalorien pro Tag</span><input type="number" inputmode="numeric" data-set="kcalGoal" value="${st.kcalGoal}"></div>
      <div class="set-row"><span>💧 Wasser pro Tag (ml)</span><input type="number" inputmode="numeric" data-set="waterGoal" value="${st.waterGoal}"></div>
      <div class="set-row"><span>⚖️ Startgewicht (kg)</span><input type="text" inputmode="decimal" data-set="startWeight" value="${fmtKg(st.startWeight)}"></div>
      <div class="set-row"><span>🎯 Zielgewicht (kg)</span><input type="text" inputmode="decimal" data-set="targetWeight" value="${fmtKg(st.targetWeight)}"></div>
      <div class="flabel" style="margin-top:14px">💪 Gym pro Woche</div>
      <div class="seg">${[1, 2, 3, 4].map((n) => `<button data-act="set-gym" data-val="${n}" class="${st.gymGoal === n ? 'on' : ''}">${n}×</button>`).join('')}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Wasser-Zeitstrahl</h2></div>
      <div class="set-row"><span>Start</span><input type="time" data-set="waterFrom" value="${st.waterFrom}"></div>
      <div class="set-row"><span>Ende</span><input type="time" data-set="waterTo" value="${st.waterTo}"></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Deine Daten</h2></div>
      <p class="muted small" style="margin:0 0 12px">Alles ist nur auf diesem iPhone gespeichert. Sichere ab und zu eine Kopie (z. B. in der Dateien-App), damit nichts verloren geht.</p>
      <button class="btn" data-act="export">📤 Sicherung exportieren</button>
      <label class="btn" style="margin-top:10px">📥 Sicherung laden<input type="file" accept="application/json,.json" id="import" hidden></label>
      <button class="btn danger" data-act="reset">Alle Daten löschen</button>
    </section>
    <p class="muted small center">Mein Tag · funktioniert auch offline</p>`;
  }
};

function weightChart(ws) {
  const st = S.settings;
  const W = 320, H = 170, pl = 34, pr = 10, pt = 12, pb = 24;
  const vals = ws.map((w) => w.kg).concat([st.targetWeight, st.startWeight]);
  const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1);
  const t0 = parseKey(ws[0].date).getTime(), t1 = parseKey(ws[ws.length - 1].date).getTime();
  const x = (d) => (ws.length === 1 || t1 === t0 ? pl + (W - pl - pr) / 2 : pl + ((parseKey(d).getTime() - t0) / (t1 - t0)) * (W - pl - pr));
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const pts = ws.map((w) => `${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`);
  const ticks = [];
  const step = Math.max(1, Math.round((max - min) / 4));
  for (let v = min; v <= max; v += step) ticks.push(v);
  const area = ws.length > 1 ? `<path class="area" d="M${pts[0]} L${pts.join(' L')} L${x(ws[ws.length - 1].date)},${H - pb} L${x(ws[0].date)},${H - pb} Z"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gewichtsverlauf">
    ${ticks.map((v) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    <line class="goal" x1="${pl}" x2="${W - pr}" y1="${y(st.targetWeight)}" y2="${y(st.targetWeight)}" style="stroke:var(--green)"/>
    <text x="${W - pr}" y="${y(st.targetWeight) - 4}" text-anchor="end" style="fill:var(--green)">Ziel ${fmtKg(st.targetWeight)}</text>
    ${area}
    ${ws.length > 1 ? `<polyline class="line" points="${pts.join(' ')}"/>` : ''}
    ${ws.map((w) => `<circle class="dot" cx="${x(w.date)}" cy="${y(w.kg)}" r="4"/>`).join('')}
    <text x="${pl}" y="${H - 6}">${parseKey(ws[0].date).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</text>
    ${ws.length > 1 ? `<text x="${W - pr}" y="${H - 6}" text-anchor="end">${parseKey(ws[ws.length - 1].date).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</text>` : ''}
  </svg>`;
}

function favChips(act, dateKey) {
  if (!S.favorites.length) {
    return '<div class="muted small">Noch keine Favoriten. Hake beim Eintragen „Als Favorit speichern“ an – dann kannst du die Mahlzeit hier mit einem Tipp erneut eintragen.</div>';
  }
  return `<div class="chips">${S.favorites.map((f) => `
    <button class="chip ${act === 'fav-del' ? 'editing' : ''}" data-act="${act}" data-id="${f.id}" data-date="${dateKey}">
      ${act === 'fav-del' ? '✕ ' : MEAL[f.meal]?.icon || ''} ${esc(f.name)} <small>${fmt(f.kcal)}</small>
    </button>`).join('')}</div>`;
}

/* ================= Sheets (Fenster von unten) ================= */
const $sheet = document.getElementById('sheet-root');
function openSheet(html) {
  $sheet.innerHTML = `<div class="backdrop" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
}
function closeSheet() { $sheet.innerHTML = ''; }
const sheetOpen = () => !!$sheet.firstChild;

function foodSheet(entry, dateKey) {
  const isNew = !entry;
  const t = entry ? entry.time : hhmm(now());
  const meal = entry ? entry.meal : guessMeal(t);
  openSheet(`
    <h2>${isNew ? 'Essen eintragen' : 'Eintrag bearbeiten'}</h2>
    ${isNew && S.favorites.length ? `<div class="flabel">⭐ Favoriten – ein Tipp genügt</div>${favChips('fav-add', dateKey)}<div style="height:16px"></div>` : ''}
    <label class="f">Was hast du gegessen?<input id="f-name" type="text" autocomplete="off" placeholder="z. B. Haferflocken mit Beeren" value="${entry ? esc(entry.name) : ''}"></label>
    <div class="row">
      <label class="f">Kalorien (kcal)<input id="f-kcal" type="number" inputmode="numeric" placeholder="350" value="${entry ? entry.kcal : ''}"></label>
      <label class="f">Uhrzeit<input id="f-time" type="time" value="${t}"></label>
    </div>
    <div class="flabel">Mahlzeit</div>
    <div class="seg" id="f-meal" data-touched="${isNew ? '' : '1'}">
      ${MEALS.map(([k, l]) => `<button data-act="meal" data-val="${k}" class="${k === meal ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <label class="check"><input type="checkbox" id="f-fav"> Als Favorit speichern ⭐</label>
    <button class="btn primary" data-act="food-save" data-id="${entry ? entry.id : ''}" data-date="${dateKey}">Speichern</button>
    ${isNew ? '' : `<button class="btn danger" data-act="food-del" data-id="${entry.id}" data-date="${dateKey}">🗑️ Löschen</button>`}
    <button class="btn ghost" data-act="close">Abbrechen</button>`);
  if (isNew && !S.favorites.length) setTimeout(() => document.getElementById('f-name')?.focus(), 300);
}

function addFood(dateKey, data, silent) {
  const e = { id: uid(), ...data };
  dayRW(dateKey).food.push(e);
  save();
  if (!silent) {
    toast(`✓ ${data.name} eingetragen`, () => {
      const d = dayRW(dateKey);
      d.food = d.food.filter((x) => x.id !== e.id);
      save(); render();
    });
  }
  return e;
}

function addWater(ml) {
  const k = todayKey();
  const before = waterOf(k);
  const e = { id: uid(), ml, time: hhmm(now()) };
  dayRW(k).water.push(e);
  save();
  render();
  const after = before + ml;
  if (before < S.settings.waterGoal && after >= S.settings.waterGoal) celebrate();
  else toast(`💧 +${fmt(ml)} ml`, () => {
    const d = dayRW(k);
    d.water = d.water.filter((x) => x.id !== e.id);
    save(); render();
  });
}

/* ================= Aktionen ================= */
const A = {
  go: (el) => go(el.dataset.view),
  menu: () => openSheet(`
    <h2>Menü</h2>
    <button class="menu-item" data-act="menu-go" data-view="erinnerungen"><span>🔔</span>Erinnerungen einrichten</button>
    <button class="menu-item" data-act="menu-go" data-view="verlauf"><span>📅</span>Verlauf</button>
    <button class="menu-item" data-act="menu-go" data-view="einstellungen"><span>⚙️</span>Einstellungen</button>
    <button class="btn ghost" data-act="close">Schließen</button>`),
  'menu-go': (el) => { closeSheet(); go(el.dataset.view); },
  close: closeSheet,
  backdrop: (el, ev) => { if (ev.target === el) closeSheet(); },

  'food-new': () => foodSheet(null, view === 'essen' ? (essenDate || todayKey()) : todayKey()),
  'food-edit': (el) => {
    const e = day(el.dataset.date).food.find((x) => x.id === el.dataset.id);
    if (e) foodSheet(e, el.dataset.date);
  },
  meal: (el) => {
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
    el.parentElement.dataset.touched = '1';
  },
  'food-save': (el) => {
    const name = document.getElementById('f-name').value.trim();
    const kcal = Math.round(num(document.getElementById('f-kcal').value));
    const time = document.getElementById('f-time').value || hhmm(now());
    const meal = document.querySelector('#f-meal .on')?.dataset.val || guessMeal(time);
    const fav = document.getElementById('f-fav').checked;
    if (!name) return shake('f-name', 'Bitte einen Namen eingeben');
    if (!Number.isFinite(kcal) || kcal < 0) return shake('f-kcal', 'Bitte Kalorien eingeben');
    const k = el.dataset.date;
    if (el.dataset.id) {
      const e = dayRW(k).food.find((x) => x.id === el.dataset.id);
      if (e) Object.assign(e, { name, kcal, time, meal });
      save();
      toast('✓ Gespeichert');
    } else {
      addFood(k, { name, kcal, time, meal });
    }
    if (fav && !S.favorites.some((f) => f.name.toLowerCase() === name.toLowerCase() && f.kcal === kcal)) {
      S.favorites.push({ id: uid(), name, kcal, meal });
      save();
    }
    closeSheet(); render();
  },
  'food-del': (el) => {
    const k = el.dataset.date;
    const d = dayRW(k);
    const e = d.food.find((x) => x.id === el.dataset.id);
    d.food = d.food.filter((x) => x.id !== el.dataset.id);
    save(); closeSheet(); render();
    toast('🗑️ Gelöscht', () => { dayRW(k).food.push(e); save(); render(); });
  },
  'fav-add': (el) => {
    const f = S.favorites.find((x) => x.id === el.dataset.id);
    if (!f) return;
    const k = el.dataset.date || todayKey();
    const t = k === todayKey() ? hhmm(now()) : '12:00';
    addFood(k, { name: f.name, kcal: f.kcal, time: t, meal: f.meal });
    closeSheet(); render();
  },
  'fav-edit': () => { favEdit = !favEdit; render(); },
  'fav-del': (el) => {
    const f = S.favorites.find((x) => x.id === el.dataset.id);
    if (!f) return;
    S.favorites = S.favorites.filter((x) => x.id !== f.id);
    if (!S.favorites.length) favEdit = false;
    save(); render();
    toast('Favorit entfernt', () => { S.favorites.push(f); save(); render(); });
  },
  'day-prev': () => { essenDate = dkey(addDays(parseKey(essenDate || todayKey()), -1)); render(); },
  'day-next': () => {
    const n = dkey(addDays(parseKey(essenDate || todayKey()), 1));
    essenDate = n >= todayKey() ? null : n; render();
  },
  'open-day': (el) => { go('essen'); essenDate = el.dataset.date === todayKey() ? null : el.dataset.date; render(); },

  'water-add': (el) => addWater(parseInt(el.dataset.ml, 10)),
  'water-custom': () => openSheet(`
    <h2>Eigene Menge</h2>
    <label class="f">Menge in ml<input id="c-ml" type="number" inputmode="numeric" placeholder="z. B. 200"></label>
    <div class="chips" style="margin-bottom:16px">
      ${[100, 150, 200, 400, 750, 1000].map((v) => `<button class="chip" data-act="water-pick" data-ml="${v}">${fmt(v)} ml</button>`).join('')}
    </div>
    <button class="btn water" data-act="water-custom-save">Hinzufügen</button>
    <button class="btn ghost" data-act="close">Abbrechen</button>`),
  'water-pick': (el) => { document.getElementById('c-ml').value = el.dataset.ml; },
  'water-custom-save': () => {
    const ml = Math.round(num(document.getElementById('c-ml').value));
    if (!Number.isFinite(ml) || ml <= 0 || ml > 5000) return shake('c-ml', 'Bitte eine Menge eingeben');
    closeSheet(); addWater(ml);
  },
  'water-undo': () => {
    const k = todayKey();
    const d = dayRW(k);
    if (!d.water.length) return;
    const e = d.water.pop();
    save(); render();
    toast(`↩️ ${fmt(e.ml)} ml entfernt`, () => { dayRW(k).water.push(e); save(); render(); });
  },
  'water-del': (el) => {
    const k = el.dataset.date;
    const d = dayRW(k);
    const e = d.water.find((x) => x.id === el.dataset.id);
    d.water = d.water.filter((x) => x.id !== el.dataset.id);
    save(); render();
    toast('🗑️ Gelöscht', () => { dayRW(k).water.push(e); save(); render(); });
  },

  'gym-today': () => toggleGym(todayKey()),
  'gym-toggle': (el) => toggleGym(el.dataset.date),

  'weight-add': () => {
    const kg = num(document.getElementById('w-kg').value);
    const date = document.getElementById('w-date').value || todayKey();
    if (!Number.isFinite(kg) || kg < 30 || kg > 300) return shake('w-kg', 'Bitte ein gültiges Gewicht eingeben');
    const existing = S.weights.find((w) => w.date === date);
    if (existing) existing.kg = Math.round(kg * 10) / 10;
    else S.weights.push({ id: uid(), date, kg: Math.round(kg * 10) / 10 });
    save(); render();
    toast(existing ? '✓ Gewicht aktualisiert' : '✓ Gewicht gespeichert – weiter so! 💚');
  },
  'weight-del': (el) => {
    const w = S.weights.find((x) => x.id === el.dataset.id);
    S.weights = S.weights.filter((x) => x.id !== el.dataset.id);
    save(); render();
    toast('🗑️ Gelöscht', () => { S.weights.push(w); save(); render(); });
  },

  'set-gym': (el) => { S.settings.gymGoal = parseInt(el.dataset.val, 10); save(); render(); toast('✓ Gespeichert'); },
  export: async () => {
    const data = JSON.stringify(S, null, 2);
    const name = `mein-tag-sicherung-${todayKey()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mein Tag – Sicherung' });
        return;
      }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  reset: () => {
    if (!confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
    S = defaults(); save(); go('heute'); toast('Alle Daten gelöscht');
  }
};

function toggleGym(k) {
  const was = S.gym.includes(k);
  S.gym = was ? S.gym.filter((x) => x !== k) : [...S.gym, k];
  save(); render();
  const isToday = k === todayKey();
  toast(was ? 'Training entfernt' : isToday ? 'Stark! Training eingetragen 💪' : `Training am ${dateShort(parseKey(k))} eingetragen 💪`,
    () => toggleGym(k));
}

/* ================= Rückmeldungen ================= */
let toastTimer;
function toast(msg, undo) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Rückgängig</button>' : ''}`;
  t.classList.toggle('has-btn', !!undo);
  if (undo) t.querySelector('button').onclick = () => { t.classList.remove('show'); undo(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 4500 : 2200);
}
function shake(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.focus(); el.style.borderColor = 'var(--red)'; }
  toast(msg);
}
function celebrate() {
  const p = document.getElementById('party');
  let html = '';
  for (let i = 0; i < 28; i++) {
    html += `<span class="drop" style="left:${Math.random() * 100}%;animation-duration:${1.6 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.6}s">${Math.random() < 0.8 ? '💧' : '✨'}</span>`;
  }
  p.innerHTML = html + '<div class="msg">Geschafft! 💧</div>';
  p.classList.add('on');
  setTimeout(() => { p.classList.remove('on'); p.innerHTML = ''; }, 3200);
}

/* ================= Ereignisse ================= */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) fn(el, ev);
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.set) {
    const key = el.dataset.set;
    let v = el.value;
    if (['kcalGoal', 'waterGoal'].includes(key)) {
      v = Math.round(num(v));
      if (!Number.isFinite(v) || v <= 0) { toast('Bitte eine gültige Zahl eingeben'); render(); return; }
    } else if (['startWeight', 'targetWeight'].includes(key)) {
      v = Math.round(num(v) * 10) / 10;
      if (!Number.isFinite(v) || v < 30 || v > 300) { toast('Bitte ein gültiges Gewicht eingeben'); render(); return; }
    } else if (!/^\d{2}:\d{2}$/.test(v)) { render(); return; }
    S.settings[key] = v;
    save(); toast('✓ Gespeichert');
  }
  if (el.id === 'f-time') {
    const seg = document.getElementById('f-meal');
    if (seg && !seg.dataset.touched) {
      const m = guessMeal(el.value);
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.val === m));
    }
  }
  if (el.id === 'import' && el.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(r.result);
        if (!p || typeof p !== 'object' || !p.settings) throw new Error('format');
        if (!confirm('Sicherung laden? Deine aktuellen Daten werden ersetzt.')) return;
        S = { ...defaults(), ...p, settings: { ...defaults().settings, ...p.settings } };
        save(); go('heute'); toast('✓ Sicherung geladen');
      } catch (e) { toast('⚠️ Diese Datei ist keine gültige Sicherung'); }
    };
    r.readAsText(el.files[0]);
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches('.sheet input')) {
    ev.preventDefault();
    document.querySelector('.sheet .btn.primary, .sheet .btn.water')?.click();
  }
  if (ev.key === 'Escape' && sheetOpen()) closeSheet();
});

/* Neuer Tag um Mitternacht + Soll-Markierung aktuell halten */
let lastDay = todayKey();
function tick() {
  const k = todayKey();
  if (k !== lastDay) {
    lastDay = k;
    essenDate = essenDate && essenDate >= k ? null : essenDate;
    render();
    return;
  }
  const typing = document.activeElement && document.activeElement.matches('input');
  if (!sheetOpen() && !typing && (view === 'heute' || view === 'wasser')) render();
}
setInterval(tick, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
window.addEventListener('pageshow', tick);

/* Start */
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
