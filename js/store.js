// All student data lives in this browser's localStorage — nothing is sent anywhere.
const KEY = 'sfhs-schedule:v1';

export const COLORS = ['#B8860B', '#8C4A2F', '#2F6F73', '#5B6FB5', '#8A4F7D', '#4F7A3A', '#C2553D', '#6B6257'];

const defaults = () => ({
  v: 1,
  classes: Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7', 'adv'].map((p, i) => [p, { name: '', teacher: '', room: '', color: COLORS[i % COLORS.length] }]),
  ),
  lunch: { 4: 1, 5: 1 },
  homework: [],
  todos: [{ id: 'default', name: 'My to-dos', items: [] }],
  events: [],
  overrides: {},
  settings: { theme: 'auto', clock24: false, titleTimer: true, notify: false, notifyMin: 5 },
});

function merge(base, saved) {
  const out = { ...base, ...saved };
  out.classes = { ...base.classes };
  for (const p of Object.keys(base.classes)) out.classes[p] = { ...base.classes[p], ...(saved.classes?.[p] || {}) };
  out.lunch = { ...base.lunch, ...(saved.lunch || {}) };
  out.settings = { ...base.settings, ...(saved.settings || {}) };
  for (const k of ['homework', 'todos', 'events']) if (!Array.isArray(out[k])) out[k] = base[k];
  if (!out.todos.length) out.todos = base.todos;
  if (!out.overrides || typeof out.overrides !== 'object') out.overrides = {};
  return out;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(defaults(), JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return defaults();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Could not save', e);
    return false;
  }
}

/** Validates an imported backup and returns a full state, or throws. */
export function fromBackup(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !data.classes) throw new Error('Not an SFHS Schedule backup file');
  return merge(defaults(), data);
}

export const reset = defaults;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
