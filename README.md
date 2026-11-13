# SFHS Schedule

A student-made schedule app for Saint Francis High School. It knows which block day it is
(Gold 1, Brown 2, Activity, Liturgy, finals…), shows a live countdown for the class you're in,
and keeps your homework, events and to-dos in one place.

> Unofficial — not affiliated with or endorsed by Saint Francis High School.
> If the app and the school ever disagree, the school is right.

## What it does

- **Today** – live countdown ring for the current class, what's next, the rest of your day,
  homework due soon, this week's events, and the next day off.
- **Calendar** – every school day labelled with its day type, with your personal schedule for any date.
- **Classes** – name, teacher, room and color for periods 1–7 and advisory, plus Lunch 1 / Lunch 2
  for periods 4 and 5 (which decides whether you have the A or B class).
- **Homework** – assignments by class with a "Next class" button that picks the due date from the block calendar.
- **To-Do** – as many checklists as you want.
- **Extras** – light/dark mode, 12/24-hour time, countdown in the browser tab, optional
  class-ending notifications, backup export/import, installable and usable offline.

Everything a student enters stays in their own browser (`localStorage`). There are no accounts and no server.

## Publish on GitHub Pages

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch that holds this
   code and the `/ (root)` folder, then **Save**.
3. The site appears at `https://<username>.github.io/sfhs-schedule/` after a minute or two.

No build step — it's plain HTML, CSS and JavaScript.

## How the calendar stays in sync

Browsers aren't allowed to read the Google Calendar feed directly, so
`.github/workflows/sync-calendar.yml` runs `scripts/sync-calendar.mjs` every day. It downloads the public
**SFHS School Schedule** calendar, converts it to `data/calendar.json`, and commits the file when
something changed. GitHub only runs scheduled workflows from the repository's **default branch**, and
you can also run it by hand from the **Actions** tab ("Sync school calendar" → *Run workflow*).

To refresh locally:

```bash
node scripts/sync-calendar.mjs
```

## Updating bell times

Bell schedules live in `js/schedules.js`, transcribed from the school's
[Alternating Day Bell Schedule](https://saintfrancishigh.static.amais.com/bellSchedule_all_202526-846.pdf).
If the school publishes new times, edit them there.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Add `?now=2026-11-13T09:40` to the URL to preview any date and time.

## Design

Colors and typography follow the Saint Francis High School Branding Guidelines (July 2024): Leather,
Cedar, Sunlight, Fire and Ash, with Source Serif 4 headlines and Barlow body text (both under the SIL
Open Font License). School logos, the seal and the mascot are intentionally not used.
