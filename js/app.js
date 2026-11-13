import {
  DAY_TYPES, PERIODS, BELL_PDF, resolveDay, nextSchoolDay, nextMeeting, findDay,
  dateKey, parseKey, addDays, fmtTime, fmtTimeAP, fmtRange, setClock24,
} from './schedules.js';
import * as store from './store.js';

/* ───────────── state ───────────── */
let state = store.load();
let calendar = null;
let calendarFailed = false;
const VIEWS = ['today', 'calendar', 'homework', 'todos', 'classes', 'settings'];
const ui = {
  view: VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today',
  month: null, selected: null, hwFilter: 'all', showDone: false, liveKey: '',
};
const notified = new Set();

// ?now=2026-11-13T10:30 previews the app at another moment (handy for testing).
const fake = new Date(new URLSearchParams(location.search).get('now') || NaN).getTime();
const clockOffset = Number.isNaN(fake) ? 0 : fake - Date.now();
const now = () => new Date(Date.now() + clockOffset);
const todayKey = () => dateKey(now());

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const commit = () => { if (!store.save(state)) toast('Could not save — browser storage is full or blocked.'); };

/* ───────────── formatting ───────────── */
const fmtDate = (key, opts = { weekday: 'long', month: 'long', day: 'numeric' }) => parseKey(key).toLocaleDateString('en-US', opts);
const shortDate = (key) => fmtDate(key, { weekday: 'short', month: 'short', day: 'numeric' });
const dayDiff = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function countdown(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
const hm = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function relDay(key) {
  const d = dayDiff(todayKey(), key);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return d > 1 && d < 7 ? fmtDate(key, { weekday: 'long' }) : shortDate(key);
}

const ICONS = {
  today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  homework: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/>',
  todos: '<path d="M4 7l2 2 3-4M4 16l2 2 3-4M13 7h7M13 16h7"/>',
  classes: '<path d="M4 6l8-3 8 3-8 3z"/><path d="M7 9v5c2 2 8 2 10 0V9M20 6v6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
};
const icon = (n) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const NAV = { today: 'Today', calendar: 'Calendar', homework: 'Homework', todos: 'To-Do', classes: 'Classes', settings: 'Settings' };

/* ───────────── schedule helpers ───────────── */
const getDay = (key) => resolveDay(key, calendar, state);
const KIND_COLOR = { lunch: 'var(--muted)', break: 'var(--muted)', collab: 'var(--line-strong)', activity: 'var(--gold)', exam: 'var(--gold)', special: 'var(--gold)' };

function blockInfo(b) {
  const c = b.kind === 'class' ? state.classes[b.period] : b.kind === 'advisory' ? state.classes.adv : null;
  if (!c) return { title: b.label, sub: '', color: KIND_COLOR[b.kind] || 'var(--muted)' };
  const named = b.kind === 'class' && c.name;
  return {
    title: named ? c.name : b.kind === 'advisory' && c.name ? `${b.label} · ${c.name}` : b.label,
    sub: [named ? b.label : '', c.teacher, c.room].filter(Boolean).join(' · '),
    color: c.color,
  };
}
const className = (p) => (p === 'other' || !p ? 'Other' : p === 'adv' ? state.classes.adv.name || 'Advisory' : state.classes[p]?.name || `Period ${p}`);
const classColor = (p) => state.classes[p]?.color || 'var(--muted)';

/** Where are we in the day right now? */
function getStatus(day, d = now()) {
  if (day.type !== 'school' || !day.blocks.length) return { phase: 'off', key: 'off' };
  const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  const bl = day.blocks, first = bl[0].start * 60, last = bl.at(-1).end * 60;
  const dayPct = Math.min(1, Math.max(0, (sec - first) / (last - first)));
  if (sec < first) return { phase: 'before', key: 'before', next: bl[0], remain: first - sec, pct: 0, dayPct };
  if (sec >= last) return { phase: 'after', key: 'after', dayPct: 1 };
  for (let i = 0; i < bl.length; i++) {
    const s = bl[i].start * 60, e = bl[i].end * 60;
    if (sec >= s && sec < e) return { phase: 'in', key: `in${i}`, idx: i, block: bl[i], next: bl[i + 1], remain: e - sec, pct: (sec - s) / (e - s), dayPct };
    const ns = bl[i + 1]?.start * 60;
    if (sec >= e && sec < ns) return { phase: 'passing', key: `pass${i}`, idx: i, next: bl[i + 1], remain: ns - sec, pct: (sec - e) / (ns - e), dayPct };
  }
  return { phase: 'after', key: 'after', dayPct: 1 };
}

const badge = (day, small) => {
  if (day.type === 'school' || day.type === 'info') {
    const text = small ? (day.code ? (day.code.length > 2 ? day.code[0] : day.code) : day.family === 'finals' ? 'Finals' : 'Special') : day.title;
    return `<span class="badge badge--${day.family || 'special'}">${esc(text)}</span>`;
  }
  return small ? '' : `<span class="badge badge--off">${esc(day.type === 'off' ? 'No school' : day.title)}</span>`;
};

function timeline(day, status) {
  if (!day.blocks.length) return '';
  return `<ol class="timeline">${day.blocks.map((b, i) => {
    const info = blockInfo(b);
    const st = !status || status.phase === 'off' ? '' : status.phase === 'after' || (status.idx !== undefined && (i < status.idx || (status.phase === 'passing' && i === status.idx))) ? 'is-past' : status.phase === 'in' && i === status.idx ? 'is-now' : '';
    return `<li class="tl tl--${b.kind} ${st}" style="--c:${info.color}">
      <div class="tl__time"><b>${fmtTime(b.start)}</b><span>${fmtTime(b.end)}</span></div>
      <div class="tl__body"><strong>${esc(info.title)}</strong>${info.sub ? `<span>${esc(info.sub)}</span>` : ''}
        ${st === 'is-now' ? '<div class="bar"><i data-live="bar"></i></div>' : ''}</div>
      <div class="tl__dur">${st === 'is-now' ? '<span class="pill">Now</span>' : `${b.end - b.start} min`}</div>
    </li>`;
  }).join('')}</ol>`;
}

/* ───────────── shared item rendering ───────────── */
function dueInfo(hw) {
  if (!hw.due) return { group: 'No due date', text: 'No due date', cls: '' };
  const d = dayDiff(todayKey(), hw.due);
  if (d < 0) return { group: 'Overdue', text: `Overdue · ${shortDate(hw.due)}`, cls: 'is-late' };
  if (d === 0) return { group: 'Due today', text: 'Due today', cls: 'is-soon' };
  if (d === 1) return { group: 'Due tomorrow', text: 'Due tomorrow', cls: 'is-soon' };
  return { group: d < 7 ? 'This week' : 'Later', text: `Due ${shortDate(hw.due)}`, cls: '' };
}
const hwSorted = () => [...state.homework].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.important ? 1 : 0) - (a.important ? 1 : 0) || a.created - b.created);

function hwItem(hw, showDue = true) {
  const due = dueInfo(hw);
  return `<li class="item ${hw.done ? 'is-done' : ''}" style="--c:${classColor(hw.cls)}">
    <input type="checkbox" class="check" ${hw.done ? 'checked' : ''} data-action="hw-toggle" data-id="${hw.id}" aria-label="Mark ${esc(hw.title)} done">
    <button class="item__body" data-action="hw-edit" data-id="${hw.id}">
      <strong>${hw.important ? '<span class="flag" title="Important">!</span>' : ''}${esc(hw.title)}</strong>
      <span class="item__meta"><i class="dot"></i>${esc(className(hw.cls))}${showDue ? ` · <em class="${hw.done ? '' : due.cls}">${esc(due.text)}</em>` : ''}</span>
      ${hw.notes ? `<span class="item__notes">${esc(hw.notes)}</span>` : ''}
    </button>
  </li>`;
}
const eventTime = (ev) => (ev.time ? (ev.end ? fmtRange(hm(ev.time), hm(ev.end)) : fmtTimeAP(hm(ev.time))) : 'All day');
const eventsOn = (key) => state.events.filter((e) => e.date === key).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
function eventItem(ev, withDate) {
  return `<li class="item item--event">
    <button class="item__body" data-action="ev-edit" data-id="${ev.id}">
      <strong>${esc(ev.title)}</strong>
      <span class="item__meta">${withDate ? `${esc(relDay(ev.date))} · ` : ''}${esc(eventTime(ev))}</span>
      ${ev.notes ? `<span class="item__notes">${esc(ev.notes)}</span>` : ''}
    </button>
  </li>`;
}
const empty = (text) => `<p class="empty">${text}</p>`;
const cardHead = (title, action, label, data = '') =>
  `<div class="card__head"><h3>${title}</h3>${action ? `<button class="btn btn--ghost btn--sm" data-action="${action}" ${data}>${icon('plus')}${label}</button>` : ''}</div>`;

/* ───────────── Today ───────────── */
function heroHtml(day, st) {
  const ring = (label) => `<div class="ring" role="timer" aria-label="${label}">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54"/><circle class="ring__fill" data-live="ring" cx="60" cy="60" r="54" pathLength="100"/></svg>
      <div class="ring__label"><span data-live="count">–:––</span><small>${label}</small></div>
    </div>`;
  if (st.phase === 'in') {
    const info = blockInfo(st.block);
    const nxt = st.next ? blockInfo(st.next) : null;
    return `<section class="hero"><div class="hero__text">
        <p class="eyebrow">Right now · ${fmtRange(st.block.start, st.block.end)}</p>
        <h2>${esc(info.title)}</h2>
        ${info.sub ? `<p class="hero__meta">${esc(info.sub)}</p>` : ''}
        <p class="hero__next">${nxt ? `Up next: <b>${esc(nxt.title)}</b> at ${fmtTime(st.next.start)}` : 'Last block of the day — school ends at ' + fmtTimeAP(st.block.end)}</p>
      </div>${ring('left')}</section>`;
  }
  if (st.phase === 'passing' || st.phase === 'before') {
    const info = blockInfo(st.next);
    return `<section class="hero"><div class="hero__text">
        <p class="eyebrow">${st.phase === 'before' ? 'Good morning · day starts at ' + fmtTimeAP(st.next.start) : 'Passing period'}</p>
        <h2>${esc(info.title)}</h2>
        <p class="hero__meta">${esc([info.sub, `starts at ${fmtTime(st.next.start)}`].filter(Boolean).join(' · '))}</p>
        ${st.phase === 'before' && st.next.kind === 'collab' ? `<p class="hero__next">First class: <b>${esc(blockInfo(day.blocks.find((b) => b.kind === 'class') || st.next).title)}</b> at ${fmtTime((day.blocks.find((b) => b.kind === 'class') || st.next).start)}</p>` : ''}
      </div>${ring('until start')}</section>`;
  }
  // Nothing (more) today → preview the next school day.
  const next = calendar ? nextSchoolDay(day.key, calendar, state) : null;
  const headline = st.phase === 'after' ? 'School’s out for today' : day.type === 'info' ? esc(day.title) : day.type === 'off' ? (day.title === 'Weekend' ? 'It’s the weekend' : `No school · ${esc(day.title)}`) : 'No schedule posted today';
  return `<section class="hero hero--rest"><div class="hero__text">
      <p class="eyebrow">${st.phase === 'after' ? 'Done for the day' : 'Today'}</p>
      <h2>${headline}</h2>
      ${next ? `<p class="hero__meta">Next school day: <b>${esc(relDay(next.key))}</b> · ${esc(next.title)}${next.label ? ` · ${esc(next.label)}` : ''}</p>
      <p class="hero__next">${next.blocks.filter((b) => b.kind === 'class' || b.kind === 'exam').map((b) => `${esc(blockInfo(b).title)} <span>${fmtTime(b.start)}</span>`).join(' &nbsp;→&nbsp; ')}</p>` : ''}
    </div></section>`;
}

function viewToday() {
  const key = todayKey(), day = getDay(key), st = getStatus(day);
  ui.liveKey = `${key}:${st.key}`;
  const noClasses = PERIODS.every((p) => !state.classes[p].name);
  const open = hwSorted().filter((h) => !h.done);
  const soon = open.filter((h) => h.due && dayDiff(key, h.due) <= 1);
  const rest = open.length - soon.length;
  const upcomingEvents = state.events.filter((e) => e.date >= key && dayDiff(key, e.date) <= 7).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 5);
  const todoOpen = state.todos.flatMap((l) => l.items.filter((i) => !i.done).map((i) => ({ ...i, list: l }))).slice(0, 5);
  const brk = calendar && findDay(key, calendar, state, (d) => d.type === 'off' && d.title !== 'Weekend');
  const week = [];
  for (let k = key, n = 0; week.length < 5 && n < 14; k = addDays(k, 1), n++) { const d = getDay(k); if (d.title !== 'Weekend') week.push(d); }

  return `
  <div class="page-head">
    <div><p class="eyebrow">${fmtDate(key, { weekday: 'long' })}</p><h1>${fmtDate(key, { month: 'long', day: 'numeric' })}</h1></div>
    <div class="page-head__side">${badge(day)}${day.label ? `<span class="tag">${esc(day.label)}</span>` : ''}</div>
  </div>
  ${calendarFailed ? '<p class="notice notice--warn">Couldn’t load the school calendar. Check your connection and refresh.</p>' : ''}
  ${calendar && key > calendar.last ? '<p class="notice notice--warn">The school calendar hasn’t posted dates this far out yet.</p>' : ''}
  ${day.notes.map((n) => `<p class="notice">${esc(n)}</p>`).join('')}
  ${noClasses ? `<p class="notice notice--cta"><span><b>Welcome, Lancer!</b> Add your classes and teachers so your day shows up by name.</span><button class="btn btn--gold" data-action="go" data-view="classes">Set up classes</button></p>` : ''}
  <div class="grid">
    <div class="col">
      ${heroHtml(day, st)}
      ${day.blocks.length ? `<section class="card">
        <div class="card__head"><h3>${st.phase === 'after' ? 'Today’s schedule' : 'Your day'}</h3><span class="muted" data-live="daypct"></span></div>
        <div class="bar bar--day"><i data-live="daybar"></i></div>
        ${timeline(day, st)}
      </section>` : ''}
      <section class="card">
        <div class="card__head"><h3>Coming up</h3><button class="btn btn--ghost btn--sm" data-action="go" data-view="calendar">Full calendar</button></div>
        <div class="week">${week.map((d) => `<button class="week__day ${d.key === key ? 'is-today' : ''}" data-action="cal-open" data-key="${d.key}">
          <span>${d.key === key ? 'Today' : fmtDate(d.key, { weekday: 'short' })}</span><b>${parseKey(d.key).getDate()}</b>${badge(d, true) || '<span class="badge badge--off">Off</span>'}</button>`).join('')}</div>
        ${brk ? `<p class="muted small">Next day off: <b>${esc(brk.title)}</b> — ${esc(shortDate(brk.key))} (${plural(dayDiff(key, brk.key), 'day')} away)</p>` : ''}
      </section>
    </div>
    <div class="col">
      <section class="card">
        ${cardHead('Homework due soon', 'hw-new', 'Add')}
        ${soon.length ? `<ul class="items">${soon.map((h) => hwItem(h)).join('')}</ul>` : empty(open.length ? 'Nothing due today or tomorrow.' : 'No homework yet. Enjoy it while it lasts.')}
        ${rest ? `<button class="link" data-action="go" data-view="homework">+ ${plural(rest, 'more assignment')} later</button>` : ''}
      </section>
      <section class="card">
        ${cardHead('Events this week', 'ev-new', 'Add', `data-key="${key}"`)}
        ${upcomingEvents.length ? `<ul class="items">${upcomingEvents.map((e) => eventItem(e, true)).join('')}</ul>` : empty('No events in the next 7 days.')}
      </section>
      <section class="card">
        <div class="card__head"><h3>To-do</h3><button class="btn btn--ghost btn--sm" data-action="go" data-view="todos">Open lists</button></div>
        ${todoOpen.length ? `<ul class="items">${todoOpen.map((i) => todoItem(i.list, i, true)).join('')}</ul>` : empty('All clear.')}
      </section>
    </div>
  </div>`;
}

function liveUpdate() {
  if (ui.view !== 'today' && ui.view !== 'calendar') return;
  const st = getStatus(getDay(todayKey()));
  const set = (name, fn) => document.querySelectorAll(`[data-live="${name}"]`).forEach(fn);
  if (st.remain !== undefined) {
    set('count', (el) => { el.textContent = countdown(st.remain); });
    set('ring', (el) => { el.style.strokeDashoffset = 100 * st.pct; });
    set('bar', (el) => { el.style.width = `${st.pct * 100}%`; });
  }
  if (st.dayPct !== undefined) {
    set('daybar', (el) => { el.style.width = `${st.dayPct * 100}%`; });
    set('daypct', (el) => { el.textContent = st.phase === 'before' ? 'Not started' : st.phase === 'after' ? 'Day complete' : `${Math.round(st.dayPct * 100)}% of the day done`; });
  }
}

/* ───────────── Calendar ───────────── */
function viewCalendar() {
  const tk = todayKey();
  ui.selected ||= tk;
  ui.month ||= ui.selected.slice(0, 7);
  const [y, m] = ui.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push('<span class="cal__pad"></span>');
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    const key = dateKey(new Date(y, m - 1, d)), day = getDay(key);
    const hw = state.homework.filter((h) => h.due === key && !h.done).length, ev = eventsOn(key).length;
    cells.push(`<button class="cal__cell cal--${day.type} ${key === tk ? 'is-today' : ''} ${key === ui.selected ? 'is-sel' : ''}" data-action="cal-select" data-key="${key}" aria-label="${esc(fmtDate(key))}: ${esc(day.title)}">
      <span class="cal__num">${d}</span>${badge(day, true)}
      ${day.type === 'off' && day.title !== 'Weekend' ? `<span class="cal__off">${esc(day.title)}</span>` : ''}
      <span class="cal__dots">${hw ? '<i class="d-hw"></i>' : ''}${ev ? '<i class="d-ev"></i>' : ''}</span>
    </button>`);
  }
  const sel = getDay(ui.selected);
  const selHw = hwSorted().filter((h) => h.due === ui.selected), selEv = eventsOn(ui.selected);
  const ov = state.overrides[ui.selected] || '';
  return `
  <div class="page-head">
    <div><p class="eyebrow">Block-day calendar</p><h1>${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h1></div>
    <div class="page-head__side">
      <button class="btn btn--icon" data-action="cal-month" data-step="-1" aria-label="Previous month">${icon('left')}</button>
      <button class="btn" data-action="cal-today">Today</button>
      <button class="btn btn--icon" data-action="cal-month" data-step="1" aria-label="Next month">${icon('right')}</button>
    </div>
  </div>
  <div class="grid grid--cal">
    <section class="card cal">
      <div class="cal__grid cal__dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal__grid">${cells.join('')}</div>
      <p class="legend"><span class="badge badge--gold">G</span> Gold (2·4·6) <span class="badge badge--brown">B</span> Brown (1·3·5·7) <span><i class="d-hw"></i> homework due</span> <span><i class="d-ev"></i> event</span></p>
    </section>
    <div class="col">
      <section class="card">
        <div class="card__head"><div><p class="eyebrow">${esc(relDay(ui.selected))}</p><h3>${esc(fmtDate(ui.selected))}</h3></div>${badge(sel)}</div>
        ${sel.label ? `<p class="tag">${esc(sel.label)}</p>` : ''}
        ${sel.notes.map((n) => `<p class="notice">${esc(n)}</p>`).join('')}
        ${timeline(sel, ui.selected === tk ? getStatus(sel) : null) || empty(sel.type === 'off' ? 'No classes.' : 'No bell schedule for this day.')}
        <label class="field field--inline">Day type
          <select data-action="override" data-key="${ui.selected}">
            <option value="">From school calendar</option>
            ${Object.entries(DAY_TYPES).map(([c, t]) => `<option value="${c}" ${ov === c ? 'selected' : ''}>${t.name}</option>`).join('')}
            <option value="OFF" ${ov === 'OFF' ? 'selected' : ''}>No school</option>
          </select>
        </label>
      </section>
      <section class="card">
        ${cardHead('Events', 'ev-new', 'Add', `data-key="${ui.selected}"`)}
        ${selEv.length ? `<ul class="items">${selEv.map((e) => eventItem(e)).join('')}</ul>` : empty('Nothing planned.')}
      </section>
      <section class="card">
        ${cardHead('Homework due', 'hw-new', 'Add', `data-key="${ui.selected}"`)}
        ${selHw.length ? `<ul class="items">${selHw.map((h) => hwItem(h, false)).join('')}</ul>` : empty('Nothing due.')}
      </section>
    </div>
  </div>`;
}

/* ───────────── Homework ───────────── */
function viewHomework() {
  const all = hwSorted();
  const used = [...new Set(all.filter((h) => !h.done).map((h) => h.cls || 'other'))];
  if (ui.hwFilter !== 'all' && !used.includes(ui.hwFilter)) ui.hwFilter = 'all';
  const match = (h) => ui.hwFilter === 'all' || (h.cls || 'other') === ui.hwFilter;
  const open = all.filter((h) => !h.done && match(h)), done = all.filter((h) => h.done && match(h));
  const groups = {};
  for (const h of open) (groups[dueInfo(h).group] ||= []).push(h);
  const order = ['Overdue', 'Due today', 'Due tomorrow', 'This week', 'Later', 'No due date'];
  return `
  <div class="page-head">
    <div><p class="eyebrow">${open.length ? plural(open.length, 'assignment') + ' to go' : 'All caught up'}</p><h1>Homework</h1></div>
    <div class="page-head__side"><button class="btn btn--primary" data-action="hw-new">${icon('plus')}Add homework</button></div>
  </div>
  ${used.length > 1 ? `<div class="chips"><button class="chip ${ui.hwFilter === 'all' ? 'is-on' : ''}" data-action="hw-filter" data-f="all">All</button>${used.map((p) => `<button class="chip ${ui.hwFilter === p ? 'is-on' : ''}" style="--c:${classColor(p)}" data-action="hw-filter" data-f="${p}"><i class="dot"></i>${esc(className(p))}</button>`).join('')}</div>` : ''}
  ${open.length ? order.filter((g) => groups[g]).map((g) => `<section class="card"><div class="card__head"><h3 class="${g === 'Overdue' ? 'is-late' : ''}">${g}</h3><span class="muted">${groups[g].length}</span></div><ul class="items">${groups[g].map((h) => hwItem(h, !g.startsWith('Due t'))).join('')}</ul></section>`).join('')
    : `<section class="card">${empty('No homework on your list. Add an assignment and pick “Next class” to set the due date from your block schedule.')}</section>`}
  ${done.length ? `<section class="card"><div class="card__head"><button class="link" data-action="hw-showdone">${ui.showDone ? 'Hide' : 'Show'} completed (${done.length})</button>${ui.showDone ? '<button class="btn btn--ghost btn--sm" data-action="hw-clear">Clear completed</button>' : ''}</div>
    ${ui.showDone ? `<ul class="items">${done.map((h) => hwItem(h)).join('')}</ul>` : ''}</section>` : ''}`;
}

/* ───────────── To-do ───────────── */
function todoItem(list, item, showList) {
  return `<li class="item ${item.done ? 'is-done' : ''}">
    <input type="checkbox" class="check" ${item.done ? 'checked' : ''} data-action="todo-toggle" data-list="${list.id}" data-id="${item.id}" aria-label="Mark ${esc(item.text)} done">
    <span class="item__body item__body--static"><strong>${esc(item.text)}</strong>${showList && state.todos.length > 1 ? `<span class="item__meta">${esc(list.name)}</span>` : ''}</span>
    ${showList ? '' : `<button class="btn btn--icon btn--ghost" data-action="todo-del" data-list="${list.id}" data-id="${item.id}" aria-label="Delete ${esc(item.text)}">${icon('trash')}</button>`}
  </li>`;
}
function viewTodos() {
  return `
  <div class="page-head">
    <div><p class="eyebrow">Lists for everything that isn’t homework</p><h1>To-Do</h1></div>
    <div class="page-head__side"><button class="btn btn--primary" data-action="list-new">${icon('plus')}New list</button></div>
  </div>
  <div class="lists">${state.todos.map((l) => {
    const doneCount = l.items.filter((i) => i.done).length;
    return `<section class="card">
      <div class="card__head"><h3>${esc(l.name)}</h3><span class="row">
        ${doneCount ? `<button class="btn btn--ghost btn--sm" data-action="todo-clear" data-list="${l.id}">Clear ${doneCount} done</button>` : ''}
        <button class="btn btn--icon btn--ghost" data-action="list-edit" data-list="${l.id}" aria-label="Rename or delete ${esc(l.name)}">${icon('edit')}</button></span></div>
      <ul class="items">${[...l.items.filter((i) => !i.done), ...l.items.filter((i) => i.done)].map((i) => todoItem(l, i)).join('')}</ul>
      <form class="add" data-form="todo-add" data-list="${l.id}"><input name="text" placeholder="Add a to-do…" autocomplete="off" aria-label="Add a to-do to ${esc(l.name)}" maxlength="200"><button class="btn btn--icon" aria-label="Add">${icon('plus')}</button></form>
    </section>`;
  }).join('')}</div>`;
}

/* ───────────── Classes ───────────── */
function viewClasses() {
  const rowHtml = (p, label, hint) => {
    const c = state.classes[p];
    return `<div class="class" style="--c:${c.color}">
      <div class="class__id"><b>${label}</b><small>${hint}</small></div>
      <label class="field"><span>${p === 'adv' ? 'Group / name' : 'Class'}</span><input data-class="${p}" data-f="name" value="${esc(c.name)}" placeholder="${p === 'adv' ? 'optional' : 'e.g. AP Biology'}" maxlength="60"></label>
      <label class="field"><span>Teacher</span><input data-class="${p}" data-f="teacher" value="${esc(c.teacher)}" placeholder="e.g. Ms. Rivera" maxlength="60"></label>
      <label class="field"><span>Room</span><input data-class="${p}" data-f="room" value="${esc(c.room)}" placeholder="e.g. Room 204" maxlength="30"></label>
      <div class="swatches" role="radiogroup" aria-label="${label} color">${store.COLORS.map((col) => `<button class="swatch ${col === c.color ? 'is-on' : ''}" style="--s:${col}" data-action="class-color" data-class="${p}" data-color="${col}" role="radio" aria-checked="${col === c.color}" aria-label="Color ${col}"></button>`).join('')}</div>
      ${p === '4' || p === '5' ? `<div class="seg" role="radiogroup" aria-label="${label} lunch">${[1, 2].map((n) => `<button class="${state.lunch[p] === n ? 'is-on' : ''}" data-action="lunch" data-p="${p}" data-n="${n}" role="radio" aria-checked="${state.lunch[p] === n}">Lunch ${n} <small>${n === 1 ? `eat first · ${p}B` : `${p}A · eat after`}</small></button>`).join('')}</div>` : ''}
    </div>`;
  };
  return `
  <div class="page-head"><div><p class="eyebrow">Saved automatically on this device</p><h1>My classes</h1></div></div>
  <p class="notice">Gold days meet periods <b>2, 4, 6</b>. Brown days meet periods <b>1, 3, 5, 7</b>. For periods 4 and 5, pick the lunch on your printed schedule — it decides whether you have class before or after you eat.</p>
  <section class="card classes">
    ${PERIODS.map((p) => rowHtml(p, `Period ${p}`, +p % 2 ? 'Brown days' : 'Gold days')).join('')}
    ${rowHtml('adv', 'Advisory', 'Homeroom')}
  </section>`;
}

/* ───────────── Settings ───────────── */
function viewSettings() {
  const s = state.settings;
  const toggle = (k, title, desc) => `<label class="setting"><span><b>${title}</b><small>${desc}</small></span><input type="checkbox" class="switch" data-setting="${k}" ${s[k] ? 'checked' : ''}></label>`;
  const canNotify = 'Notification' in window;
  return `
  <div class="page-head"><div><p class="eyebrow">Make it yours</p><h1>Settings</h1></div></div>
  <section class="card">
    <div class="setting"><span><b>Appearance</b><small>Match your device, or pick one.</small></span>
      <div class="seg seg--sm">${['auto', 'light', 'dark'].map((t) => `<button class="${s.theme === t ? 'is-on' : ''}" data-action="theme" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
    ${toggle('clock24', '24-hour time', 'Show 13:10 instead of 1:10 PM.')}
    ${toggle('titleTimer', 'Countdown in the browser tab', 'See time left in class without switching tabs.')}
    ${canNotify ? toggle('notify', 'Class-ending reminders', 'A notification shortly before each class ends. Only works while this page is open.') : ''}
    ${canNotify && s.notify ? `<label class="setting"><span><b>Remind me</b><small>Minutes before a class ends.</small></span><select data-setting="notifyMin">${[1, 2, 5, 10].map((n) => `<option ${s.notifyMin === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
  </section>
  <section class="card">
    <div class="card__head"><h3>Your data</h3></div>
    <p class="muted">Classes, homework, events and to-dos are stored only in this browser. Export a backup to move them to another device.</p>
    <div class="row"><button class="btn" data-action="export">Export backup</button><button class="btn" data-action="import">Import backup</button><button class="btn btn--danger" data-action="reset">Erase everything</button></div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
  </section>
  <section class="card">
    <div class="card__head"><h3>About</h3></div>
    <p class="muted">Day types sync from the public <b>SFHS School Schedule</b> calendar${calendar ? ` — last updated ${new Date(calendar.updated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}, covering through ${fmtDate(calendar.last, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}. Bell times come from the school’s <a href="${BELL_PDF}" target="_blank" rel="noopener">Alternating Day Bell Schedule</a>.</p>
    <p class="muted">This is an unofficial, student-made tool and isn’t affiliated with or endorsed by Saint Francis High School. If something here disagrees with the school, the school is right.</p>
  </section>`;
}

/* ───────────── render ───────────── */
const views = { today: viewToday, calendar: viewCalendar, homework: viewHomework, todos: viewTodos, classes: viewClasses, settings: viewSettings };
function render() {
  setClock24(state.settings.clock24);
  $('#nav').innerHTML = VIEWS.map((v) => `<a href="#${v}" class="${ui.view === v ? 'is-on' : ''}" ${ui.view === v ? 'aria-current="page"' : ''}>${icon(v)}<span>${NAV[v]}</span></a>`).join('');
  $('#view').innerHTML = views[ui.view]();
  liveUpdate();
}
function go(view) {
  if (location.hash.slice(1) === view) { ui.view = view; render(); } else location.hash = view;
}
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

/* ───────────── dialogs ───────────── */
function openDialog({ title, body, submit = 'Save', onSubmit, onDelete }) {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form class="dlg" method="dialog">
    <h2>${title}</h2>${body}
    <div class="dlg__foot">${onDelete ? '<button type="button" class="btn btn--danger" data-dlg="delete">Delete</button>' : ''}<span class="grow"></span>
      <button type="button" class="btn" data-dlg="cancel">Cancel</button><button class="btn btn--primary">${submit}</button></div>
  </form>`;
  const form = $('form', dlg);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (onSubmit(Object.fromEntries(new FormData(form))) === false) return;
    dlg.close(); commit(); render();
  });
  $('[data-dlg="cancel"]', dlg).onclick = () => dlg.close();
  if (onDelete) $('[data-dlg="delete"]', dlg).onclick = () => { onDelete(); dlg.close(); commit(); render(); };
  dlg.showModal();
  return form;
}

function homeworkDialog(id, presetDue) {
  const hw = state.homework.find((h) => h.id === id);
  const tk = todayKey();
  const opts = [...PERIODS, 'adv'].filter((p) => p !== 'adv' || state.classes.adv.name).map((p) => `<option value="${p}" ${hw?.cls === p ? 'selected' : ''}>${esc(state.classes[p].name ? `${state.classes[p].name} (P${p})` : `Period ${p}`)}</option>`).join('');
  const form = openDialog({
    title: hw ? 'Edit homework' : 'Add homework',
    body: `
      <label class="field"><span>Assignment</span><input name="title" required maxlength="140" value="${esc(hw?.title)}" placeholder="e.g. Read chapter 7" autofocus></label>
      <label class="field"><span>Class</span><select name="cls">${opts}<option value="other" ${hw && (hw.cls === 'other' || !hw.cls) ? 'selected' : ''}>Other</option></select></label>
      <label class="field"><span>Due</span><input type="date" name="due" value="${hw?.due ?? presetDue ?? ''}"></label>
      <div class="row"><button type="button" class="btn btn--sm" data-quick="next">Next class</button><button type="button" class="btn btn--sm" data-quick="tomorrow">Tomorrow</button><button type="button" class="btn btn--sm" data-quick="none">No date</button></div>
      <p class="muted small" data-hint></p>
      <label class="field"><span>Notes</span><textarea name="notes" rows="2" maxlength="500" placeholder="Optional">${esc(hw?.notes)}</textarea></label>
      <label class="checkrow"><input type="checkbox" name="important" ${hw?.important ? 'checked' : ''}> Mark as important</label>`,
    onSubmit(d) {
      const data = { title: d.title.trim(), cls: d.cls, due: d.due || '', notes: d.notes.trim(), important: !!d.important };
      if (!data.title) return false;
      if (hw) Object.assign(hw, data); else state.homework.push({ id: store.uid(), done: false, created: Date.now(), ...data });
    },
    onDelete: hw ? () => { state.homework = state.homework.filter((h) => h.id !== id); } : null,
  });
  const hint = () => {
    const due = form.due.value, p = form.cls.value;
    if (!due || !calendar) { $('[data-hint]', form).textContent = ''; return; }
    const d = getDay(due);
    const meets = d.blocks.some((b) => b.period === p);
    $('[data-hint]', form).textContent = `${shortDate(due)} is ${d.type === 'off' ? 'a day off' : d.title}${PERIODS.includes(p) && d.type === 'school' && d.code ? (meets ? ` — ${className(p)} meets` : ` — ${className(p)} doesn’t meet`) : ''}.`;
  };
  form.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]')?.dataset.quick;
    if (!q) return;
    if (q === 'none') form.due.value = '';
    else if (q === 'tomorrow') form.due.value = addDays(tk, 1);
    else {
      const d = PERIODS.includes(form.cls.value) ? nextMeeting(form.cls.value, tk, calendar, state) : nextSchoolDay(tk, calendar, state);
      if (d) form.due.value = d.key; else toast('No upcoming class found on the calendar.');
    }
    hint();
  });
  form.addEventListener('change', hint);
  hint();
}

function eventDialog(id, presetDate) {
  const ev = state.events.find((e) => e.id === id);
  openDialog({
    title: ev ? 'Edit event' : 'Add event',
    body: `
      <label class="field"><span>Event</span><input name="title" required maxlength="140" value="${esc(ev?.title)}" placeholder="e.g. Robotics club, game vs. Bellarmine" autofocus></label>
      <label class="field"><span>Date</span><input type="date" name="date" required value="${ev?.date ?? presetDate ?? todayKey()}"></label>
      <div class="row row--fields"><label class="field"><span>Starts</span><input type="time" name="time" value="${ev?.time ?? ''}"></label><label class="field"><span>Ends</span><input type="time" name="end" value="${ev?.end ?? ''}"></label></div>
      <label class="field"><span>Notes</span><textarea name="notes" rows="2" maxlength="500" placeholder="Optional">${esc(ev?.notes)}</textarea></label>`,
    onSubmit(d) {
      const data = { title: d.title.trim(), date: d.date, time: d.time, end: d.time && d.end > d.time ? d.end : '', notes: d.notes.trim() };
      if (!data.title || !data.date) return false;
      if (ev) Object.assign(ev, data); else state.events.push({ id: store.uid(), ...data });
    },
    onDelete: ev ? () => { state.events = state.events.filter((e) => e.id !== id); } : null,
  });
}

function listDialog(id) {
  const list = state.todos.find((l) => l.id === id);
  openDialog({
    title: list ? 'Edit list' : 'New list',
    body: `<label class="field"><span>List name</span><input name="name" required maxlength="60" value="${esc(list?.name)}" placeholder="e.g. College apps, Club stuff" autofocus></label>`,
    onSubmit(d) {
      if (!d.name.trim()) return false;
      if (list) list.name = d.name.trim(); else state.todos.push({ id: store.uid(), name: d.name.trim(), items: [] });
    },
    onDelete: list && state.todos.length > 1 ? () => { state.todos = state.todos.filter((l) => l.id !== id); } : null,
  });
}

/* ───────────── actions ───────────── */
const actions = {
  go: (el) => go(el.dataset.view),
  'hw-new': (el) => homeworkDialog(null, el.dataset.key),
  'hw-edit': (el) => homeworkDialog(el.dataset.id),
  'hw-toggle': (el) => { const h = state.homework.find((x) => x.id === el.dataset.id); h.done = !h.done; if (h.done) toast('Nice — one down.'); },
  'hw-filter': (el) => { ui.hwFilter = el.dataset.f; },
  'hw-showdone': () => { ui.showDone = !ui.showDone; },
  'hw-clear': () => { if (confirm('Remove all completed homework?')) state.homework = state.homework.filter((h) => !h.done); },
  'ev-new': (el) => eventDialog(null, el.dataset.key),
  'ev-edit': (el) => eventDialog(el.dataset.id),
  'list-new': () => listDialog(),
  'list-edit': (el) => listDialog(el.dataset.list),
  'todo-toggle': (el) => { const i = state.todos.find((l) => l.id === el.dataset.list).items.find((x) => x.id === el.dataset.id); i.done = !i.done; },
  'todo-del': (el) => { const l = state.todos.find((x) => x.id === el.dataset.list); l.items = l.items.filter((i) => i.id !== el.dataset.id); },
  'todo-clear': (el) => { const l = state.todos.find((x) => x.id === el.dataset.list); l.items = l.items.filter((i) => !i.done); },
  'cal-select': (el) => { ui.selected = el.dataset.key; },
  'cal-open': (el) => { ui.selected = el.dataset.key; ui.month = ui.selected.slice(0, 7); go('calendar'); return false; },
  'cal-today': () => { ui.selected = todayKey(); ui.month = ui.selected.slice(0, 7); },
  'cal-month': (el) => { const [y, m] = ui.month.split('-').map(Number); ui.month = dateKey(new Date(y, m - 1 + +el.dataset.step, 1)).slice(0, 7); },
  'class-color': (el) => { state.classes[el.dataset.class].color = el.dataset.color; },
  lunch: (el) => { state.lunch[el.dataset.p] = +el.dataset.n; },
  theme: (el) => { state.settings.theme = el.dataset.t; applyTheme(); },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `sfhs-schedule-backup-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return false;
  },
  import: () => { $('#import-file').click(); return false; },
  reset: () => {
    if (!confirm('Erase all classes, homework, events and to-dos from this device? This can’t be undone.')) return false;
    state = store.reset(); applyTheme(); toast('Everything was erased.');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.closest('dialog')) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (fn(el) !== false && !$('#dlg').open) { commit(); render(); }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.class) { // class editor fields save in place (no re-render, so typing isn't interrupted)
    state.classes[el.dataset.class][el.dataset.f] = el.value.trim();
    commit();
  } else if (el.dataset.action === 'override') {
    if (el.value) state.overrides[el.dataset.key] = el.value; else delete state.overrides[el.dataset.key];
    commit(); render();
  } else if (el.dataset.setting) {
    const k = el.dataset.setting;
    state.settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
    if (k === 'notify' && el.checked && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { state.settings.notify = false; toast('Notifications are blocked for this site in your browser.'); }
    }
    if (k === 'titleTimer' && !el.checked) document.title = 'SFHS Schedule';
    commit(); render();
  } else if (el.id === 'import-file' && el.files[0]) {
    try {
      const next = store.fromBackup(await el.files[0].text());
      if (confirm('Replace everything on this device with the backup?')) { state = next; commit(); applyTheme(); render(); toast('Backup imported.'); }
    } catch (err) { toast(`Import failed: ${err.message}`); }
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="todo-add"]');
  if (!form) return;
  e.preventDefault();
  const text = form.text.value.trim();
  if (!text) return;
  const id = form.dataset.list;
  state.todos.find((l) => l.id === id).items.push({ id: store.uid(), text, done: false });
  commit(); render();
  $(`[data-form="todo-add"][data-list="${id}"] input`)?.focus();
});

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  ui.view = VIEWS.includes(v) ? v : 'today';
  render();
  window.scrollTo(0, 0);
});

/* ───────────── clock ───────────── */
function tick() {
  const key = todayKey(), day = getDay(key), st = getStatus(day);
  if (ui.view === 'today') {
    if (`${key}:${st.key}` !== ui.liveKey && !$('#dlg').open) render(); else liveUpdate();
  } else liveUpdate();
  if (state.settings.titleTimer) {
    const what = st.phase === 'in' ? `${countdown(st.remain)} left · ${blockInfo(st.block).title}` : st.phase === 'passing' || st.phase === 'before' ? `${countdown(st.remain)} until ${blockInfo(st.next).title}` : '';
    document.title = what ? `${what} — SFHS` : 'SFHS Schedule';
  }
  if (state.settings.notify && st.phase === 'in' && st.block.kind === 'class' && 'Notification' in window && Notification.permission === 'granted') {
    const id = `${key}:${st.idx}`;
    if (st.remain <= state.settings.notifyMin * 60 && st.remain > state.settings.notifyMin * 60 - 30 && !notified.has(id)) {
      notified.add(id);
      new Notification(`${plural(Math.round(st.remain / 60), 'minute')} left in ${blockInfo(st.block).title}`, {
        body: st.next ? `Up next: ${blockInfo(st.next).title} at ${fmtTime(st.next.start)}` : 'That’s the last block of the day.',
        icon: 'assets/icon-180.png',
      });
    }
  }
}

/* ───────────── boot ───────────── */
applyTheme();
render();
fetch('data/calendar.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
  .then((data) => { calendar = data; })
  .catch((e) => { calendarFailed = true; console.warn('Calendar load failed', e); })
  .finally(() => { render(); setInterval(tick, 1000); tick(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
