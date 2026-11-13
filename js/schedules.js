// Bell schedules transcribed from the official SFHS "Alternating Day Bell Schedule" PDF:
// https://saintfrancishigh.static.amais.com/bellSchedule_all_202526-846.pdf
// Times are written the way the PDF prints them (no am/pm); anything before 7 is afternoon.

export const BELL_PDF = 'https://saintfrancishigh.static.amais.com/bellSchedule_all_202526-846.pdf';

const row = (kind, label, start, end, period) => ({ kind, label, start, end, period });
const cls = (period, start, end) => row('class', `Period ${period}`, start, end, period);
// Lunch splits: Lunch 1 students eat first and take the "B" class; Lunch 2 students take "A" then eat.
const split = (period, a, meal2, meal1, b, meal = 'Lunch') => ({ kind: 'split', period, a, meal2, meal1, b, meal });
const lunch4 = split(4, ['11:00', '12:20'], ['12:25', '1:05'], ['11:00', '11:40'], ['11:45', '1:05']);
const lunch5 = split(5, ['11:00', '12:20'], ['12:25', '1:05'], ['11:00', '11:40'], ['11:45', '1:05']);
const brunch4 = split(4, ['9:45', '11:05'], ['11:10', '11:35'], ['9:45', '10:10'], ['10:15', '11:35'], 'Brunch');
const liturgy4 = split(4, ['11:05', '12:25'], ['12:30', '1:05'], ['11:05', '11:40'], ['11:45', '1:05']);

const activity = (first, last) => [
  row('collab', 'Student Collaboration', '7:45', '8:15'),
  cls(first, '8:20', '9:40'),
  row('break', 'Break', '9:40', '9:50'),
  row('advisory', 'Homeroom', '9:50', '9:55'),
  row('activity', 'Activity', '9:55', '10:55'),
  lunch4,
  cls(last, '1:10', '2:30'),
];
const shortActivity = (first, last) => [
  row('collab', 'Student Collaboration', '7:45', '8:15'),
  cls(first, '8:20', '9:40'),
  brunch4,
  cls(last, '11:40', '1:00'),
];
const liturgy = (first, last) => [
  row('collab', 'Student Collaboration', '7:45', '8:00'),
  cls(first, '8:05', '9:25'),
  row('break', 'Break', '9:25', '9:35'),
  row('advisory', 'Homeroom', '9:35', '9:40'),
  row('activity', 'Liturgy', '9:40', '11:00'),
  liturgy4,
  cls(last, '1:10', '2:30'),
];

export const DAY_TYPES = {
  G1: {
    name: 'Gold 1 Day', family: 'gold',
    rows: [
      row('collab', 'Student Collaboration', '7:55', '8:55'),
      cls(2, '9:00', '10:20'),
      row('advisory', 'Advisory', '10:25', '10:55'),
      lunch4,
      cls(6, '1:10', '2:30'),
    ],
  },
  G2: {
    name: 'Gold 2 Day', family: 'gold',
    // Faculty Collaboration (7:45 – 8:15) is staff-only, so it's left out of the student day.
    rows: [
      row('collab', 'Student Collaboration', '8:15', '9:15'),
      cls(6, '9:20', '10:40'),
      row('break', 'Break', '10:40', '10:50'),
      row('advisory', 'Homeroom', '10:50', '11:00'),
      lunch4,
      cls(2, '1:10', '2:30'),
    ],
  },
  B1: {
    name: 'Brown 1 Day', family: 'brown',
    rows: [
      row('collab', 'Student Collaboration', '7:45', '8:00'),
      cls(1, '8:05', '9:25'),
      row('break', 'Break', '9:25', '9:35'),
      cls(3, '9:35', '10:55'),
      lunch5,
      cls(7, '1:10', '2:30'),
    ],
  },
  B2: {
    name: 'Brown 2 Day', family: 'brown',
    rows: [
      row('collab', 'Collaboration', '7:45', '8:00'),
      cls(1, '8:05', '9:25'),
      row('break', 'Break', '9:25', '9:35'),
      cls(7, '9:35', '10:55'),
      lunch5,
      cls(3, '1:10', '2:30'),
    ],
  },
  A1: { name: 'Activity 1 Day', family: 'gold', rows: activity(2, 6) },
  A2: { name: 'Activity 2 Day', family: 'gold', rows: activity(6, 2) },
  A3: { name: 'Activity 3 Day', family: 'gold', rows: shortActivity(2, 6) },
  A4: { name: 'Activity 4 Day', family: 'gold', rows: shortActivity(6, 2) },
  L1: { name: 'Liturgy 1 Day', family: 'gold', rows: liturgy(2, 6) },
  L2: { name: 'Liturgy 2 Day', family: 'gold', rows: liturgy(6, 2) },
  // Not on the synced calendar by code, but available as manual overrides.
  WHITE: {
    name: 'White Day', family: 'white',
    rows: [
      cls(1, '7:45', '8:30'),
      cls(2, '8:35', '9:20'),
      row('break', 'Break', '9:20', '9:35'),
      cls(3, '9:35', '10:20'),
      cls(4, '10:25', '11:10'),
      split(5, ['11:15', '12:00'], ['12:05', '12:50'], ['11:15', '12:00'], ['12:05', '12:50']),
      cls(6, '12:55', '1:40'),
      cls(7, '1:45', '2:30'),
    ],
  },
  VB: {
    name: 'Virtual Brown Day', family: 'brown',
    rows: [
      row('collab', 'Collaboration', '8:00', '8:30'),
      cls(1, '8:30', '9:45'),
      cls(3, '9:55', '11:10'),
      row('lunch', 'Lunch', '11:15', '11:45'),
      cls(5, '11:50', '1:05'),
      cls(7, '1:15', '2:30'),
    ],
  },
  VG: {
    name: 'Virtual Gold Day', family: 'gold',
    rows: [
      row('advisory', 'Advisory', '8:30', '9:00'),
      cls(2, '9:10', '10:25'),
      cls(4, '10:35', '11:50'),
      row('lunch', 'Lunch', '11:55', '12:25'),
      cls(6, '12:30', '1:45'),
      row('activity', 'Community Time', '2:00', '2:30'),
    ],
  },
};

export const PERIODS = ['1', '2', '3', '4', '5', '6', '7'];

/** "1:10" (bell-schedule style) or "13:10" (24h) → minutes after midnight. */
export function mins(hm, bellStyle = true) {
  let [h, m] = hm.split(':').map(Number);
  if (bellStyle && h < 7) h += 12;
  return h * 60 + m;
}

export const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (k, n) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

function buildBlocks(code, state) {
  const out = [];
  const push = (r, start, end, extra = {}) =>
    out.push({ kind: r.kind, label: r.label, period: r.period ? String(r.period) : null, start: mins(start), end: mins(end), ...extra });
  for (const r of DAY_TYPES[code].rows) {
    if (r.kind !== 'split') {
      push(r, r.start, r.end);
      continue;
    }
    const first = (state.lunch?.[r.period] ?? 1) === 1;
    const meal = { kind: 'lunch', label: `${r.meal} ${first ? 1 : 2}` };
    const klass = { kind: 'class', label: `Period ${r.period}${first ? 'B' : 'A'}`, period: r.period };
    if (first) {
      push(meal, ...r.meal1);
      push(klass, ...r.b);
    } else {
      push(klass, ...r.a);
      push(meal, ...r.meal2);
    }
  }
  return out;
}

/**
 * Everything the app needs to know about one date.
 * type: 'school' (has blocks) | 'off' | 'info' (school event with no bell times) | 'none' (nothing posted)
 */
export function resolveDay(key, calendar, state) {
  const cal = calendar?.days?.[key];
  const override = state.overrides?.[key];
  const weekend = [0, 6].includes(parseKey(key).getDay());
  const day = { key, type: 'none', code: null, family: null, title: weekend ? 'Weekend' : 'No schedule posted', label: '', blocks: [], notes: [] };

  if (override === 'OFF') return { ...day, type: 'off', title: 'No School', notes: ['You marked this day as no school.'], overridden: true };

  const code = override || cal?.code;
  if (code && DAY_TYPES[code]) {
    const t = DAY_TYPES[code];
    Object.assign(day, { type: 'school', code, family: t.family, title: t.name, blocks: buildBlocks(code, state) });
    if (override) {
      day.overridden = true;
      day.notes.push('You set this day type manually.');
    } else {
      day.label = cal.label || '';
      const firstClass = day.blocks.find((b) => b.kind === 'class');
      const last = day.blocks.at(-1);
      if (cal.start && cal.end && (mins(cal.start, false) !== firstClass.start || mins(cal.end, false) !== last.end)) {
        day.notes.push(`Heads up: the school calendar lists today as ${fmtRange(mins(cal.start, false), mins(cal.end, false))}, which differs from the standard ${t.name} bells shown here.`);
      }
    }
  } else if (cal?.type === 'finals') {
    Object.assign(day, {
      type: cal.blocks?.length ? 'school' : 'info', family: 'finals', title: 'Final Exams',
      blocks: (cal.blocks || []).map((b) => ({ kind: 'exam', label: b.label, period: null, start: mins(b.start, false), end: mins(b.end, false) })),
    });
  } else if (cal?.type === 'off') {
    Object.assign(day, { type: 'off', title: cal.title });
  } else if (cal?.type === 'special') {
    Object.assign(day, { family: 'special', title: cal.title });
    if (cal.start && cal.end) {
      day.type = 'school';
      day.blocks = [{ kind: 'special', label: cal.title, period: null, start: mins(cal.start, false), end: mins(cal.end, false) }];
      day.notes.push('Special schedule — only the overall start and end times are posted. Check school email for details.');
    } else {
      day.type = 'info';
      day.notes.push('Special schedule — no bell times are posted on the calendar for this day.');
    }
  } else if (weekend) {
    day.type = 'off';
  }
  if (cal?.also?.length) day.notes.push(`Also on the calendar: ${cal.also.join(', ')}`);
  return day;
}

let clock24 = false;
export const setClock24 = (v) => { clock24 = v; };
export function fmtTime(m) {
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  if (clock24) return `${String(h).padStart(2, '0')}:${mm}`;
  return `${((h + 11) % 12) + 1}:${mm}`;
}
export const fmtTimeAP = (m) => (clock24 ? fmtTime(m) : `${fmtTime(m)} ${m >= 720 ? 'PM' : 'AM'}`);
export const fmtRange = (a, b) => `${fmtTime(a)} – ${fmtTimeAP(b)}`;

/** Next date (after `fromKey`, or including it) whose schedule satisfies `test`. Looks ahead up to `limit` days. */
export function findDay(fromKey, calendar, state, test, { inclusive = false, limit = 120 } = {}) {
  for (let i = inclusive ? 0 : 1, k = addDays(fromKey, i); i <= limit; i++, k = addDays(k, 1)) {
    const d = resolveDay(k, calendar, state);
    if (test(d)) return d;
  }
  return null;
}
export const nextSchoolDay = (fromKey, calendar, state, opts) =>
  findDay(fromKey, calendar, state, (d) => d.type === 'school', opts);
export const nextMeeting = (period, fromKey, calendar, state, opts) =>
  findDay(fromKey, calendar, state, (d) => d.blocks.some((b) => b.period === String(period)), opts);
