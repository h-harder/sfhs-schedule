#!/usr/bin/env node
// Converts the public "SFHS School Schedule" Google Calendar (ICS) into data/calendar.json.
// Browsers can't read the Google feed directly (no CORS), so a GitHub Action runs this daily.
// Usage: node scripts/sync-calendar.mjs [path-to-local.ics]
import { readFile, writeFile } from 'node:fs/promises';

const ICS_URL = 'https://calendar.google.com/calendar/ical/c_499267f7da4e582cf1204186abd13af7b0e2369be2d471856f5af64f3a9a0454%40group.calendar.google.com/public/basic.ics';
const OUT = new URL('../data/calendar.json', import.meta.url);
const TZ = 'America/Los_Angeles';

const text = process.argv[2]
  ? await readFile(process.argv[2], 'utf8')
  : await fetch(ICS_URL).then((r) => {
      if (!r.ok) throw new Error(`Calendar download failed: HTTP ${r.status}`);
      return r.text();
    });

const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
if (!unfolded.includes('BEGIN:VCALENDAR')) throw new Error('Response is not an ICS calendar');

const unescape = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const plain = (html) =>
  unescape(html)
    .replace(/<a\b[^>]*>.*?<\/a>/gis, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const localFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function parseStamp(params, value) {
  if (/VALUE=DATE/.test(params) || /^\d{8}$/.test(value)) {
    return { date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, time: null };
  }
  const m = value.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/);
  if (!m) throw new Error(`Unrecognised date: ${value}`);
  if (!m[7]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` }; // already local
  const p = Object.fromEntries(
    localFmt.formatToParts(new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]))).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const addDays = (key, n) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// "8:20 - 10:20 Math" → school-day times never say am/pm; anything before 7 is afternoon.
const to24 = (hm) => {
  let [h, m] = hm.split(':').map(Number);
  if (h < 7) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const CODE = /^(G[12]|B[12]|A[1-4]|L[12])\b[\s\-–:]*(.*)$/;
const RANK = { letter: 4, finals: 3, off: 2, special: 1 };
const days = {};

for (const chunk of unfolded.split('BEGIN:VEVENT').slice(1)) {
  const f = {};
  for (const line of chunk.split('\n')) {
    const m = line.match(/^([A-Z-]+)([^:]*):(.*)$/);
    if (m && !(m[1] in f)) f[m[1]] = [m[2], m[3]];
  }
  if (!f.DTSTART || !f.SUMMARY || (f.STATUS && f.STATUS[1] === 'CANCELLED')) continue;
  const summary = unescape(f.SUMMARY[1]).replace(/\s+/g, ' ').trim();
  const start = parseStamp(...f.DTSTART);
  const end = f.DTEND ? parseStamp(...f.DTEND) : start;
  const desc = f.DESCRIPTION ? plain(f.DESCRIPTION[1]) : '';

  const entry = { type: 'special', title: summary };
  const code = summary.match(CODE);
  if (code) {
    entry.type = 'letter';
    entry.code = code[1];
    if (code[2].trim()) entry.label = code[2].trim();
  } else if (/final exam/i.test(summary)) {
    entry.type = 'finals';
    entry.blocks = [...desc.matchAll(/(\d{1,2}:\d\d)\s*[-–]\s*(\d{1,2}:\d\d)\s+([^\n]+)/g)]
      .map((m) => ({ start: to24(m[1]), end: to24(m[2]), label: m[3].trim() }));
  } else if (/no school|break|holiday/i.test(summary)) {
    entry.type = 'off';
    entry.title = summary.replace(/\s*[-–]?\s*NO SCHOOL\s*[-–]?\s*/i, '').trim() || 'No School';
  }
  if (start.time) {
    entry.start = start.time;
    entry.end = end.time;
  }
  // All-day events use an exclusive end date and can span several days.
  const last = start.time ? start.date : addDays(end.date, end.date > start.date ? -1 : 0);
  for (let d = start.date; d <= last; d = addDays(d, 1)) {
    const prev = days[d];
    if (!prev) days[d] = { ...entry };
    else if (RANK[entry.type] > RANK[prev.type]) days[d] = { ...entry, also: [prev.title, ...(prev.also || [])] };
    else prev.also = [...(prev.also || []), entry.title];
  }
}

const sorted = Object.fromEntries(Object.keys(days).sort().map((k) => [k, days[k]]));
const keys = Object.keys(sorted);
if (keys.length < 50) throw new Error(`Only ${keys.length} days parsed — refusing to overwrite calendar.json`);

let previous = null;
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
if (previous && JSON.stringify(previous.days) === JSON.stringify(sorted)) {
  console.log(`No calendar changes (${keys.length} days).`);
} else {
  const out = { updated: new Date().toISOString(), source: ICS_URL, first: keys[0], last: keys.at(-1), days: sorted };
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${keys.length} days (${keys[0]} → ${keys.at(-1)}).`);
}
