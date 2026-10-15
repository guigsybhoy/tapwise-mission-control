---
name: mission-control
description: "Build a space mission control style dashboard of the user's own bot team: crew roster, routine schedule with live countdowns, deploys, mission log and an org chart, all driven by one status.json and labelled LIVE, SNAPSHOT or DEMO so nothing is invented. Use when the user asks for a mission control, a team dashboard, a bot status board, an org chart of their bots or agents, or wants to see who does what and what runs when. Opens as a local file, or deploys to the user's own Cloudflare Pages when they ask, and keeps itself current after every job and with a daily catch-up routine."
---

# Mission Control

You are building a wall-screen dashboard of the user's team of bots (agents, assistants, automations). It has two views: **Operations** (top bar with clocks and countdown, routine timeline, crew roster, deploys, typing mission log) and **Org chart** (owner at the top, an optional hub bot, then groups of bots with their remit and the things they do not do).

All content comes from one file, `status.json`. The page is static: no server, no build tools, no external calls.

## Paths

- `SKILL_DIR` is the folder that contains this SKILL.md. Every path below starting with `scripts/`, `template/`, `references/` or `examples/` is relative to it.
- `WORK_DIR` is where the user's files go. Default: a folder called `mission-control` in your current working directory. Use another place only if the user names one. Never write the user's data into `SKILL_DIR`.
- Data file: `WORK_DIR/status.json`. Built site: `WORK_DIR/site/`. Refresh settings: `WORK_DIR/refresh.json` (step 9).

Tools needed: Python 3.8 or later. A browser to view the result. Node.js only if you deploy.

## The one rule: never invent numbers

Every panel carries a badge. Read `references/schema.md`, section "Honesty rules", before you write anything. In short:

- **LIVE**: computed in the browser from real inputs (clocks, countdowns to real schedules).
- **SNAPSHOT**: a real fact you recorded, with an `as_of` date.
- **DEMO**: made up or illustrative, with an `as_of` date.
- Unknown means `null`, which shows as "not yet reported". Never guess a status, a time, a date or a count to make the board look fuller. An honest board with gaps beats a full one with fiction.

## Quick demo

If the user only wants to see what it looks like, build the fictional sample and stop there:

```sh
python3 scripts/build.py --demo --out WORK_DIR/demo
```

Then open `WORK_DIR/demo/index.html` (step 6). Tell the user the Northwind Crew is fictional.

## Steps for a real dashboard

### 1. Agree the scope

In one short message, confirm with the user:

- the team name for the title (e.g. "Crew Mission Control"), and a subtitle if they want one;
- how the owner should appear at the top of the org chart. A first name or just "Owner" is best if the screen will be seen by others;
- local file only (the default), or also a deploy to their own Cloudflare Pages.

Also tell them, without asking permission, that the board keeps itself current by default: it is refreshed every time a job is handed out or finished, and once every evening by a quiet catch-up routine (step 9).

If the user already gave these, do not ask again. If they said "just do it", use the team name "Mission Control", owner "Owner", and local only.

### 2. Gather the facts

Collect only what you can actually see. Use your own context and tools, read-only:

| What | Where to look | Goes into |
|---|---|---|
| The team members: names, what each is for, what each must not do | Your own setup and instructions, any list of other agents or bots you can see, your memory or notes about the team, rules the user has written for each bot, earlier conversations | `roster[]`, `org.nodes[]` |
| Who coordinates, if anyone | Same sources. A bot that hands work to the others is the hub | `roster[].hub`, `org.hub` |
| Natural groupings | Shared areas of work (e.g. build, research, inbox, calendar, watchers) | `org.groups[]` |
| Current status and task of each member | Only if you can see it. Otherwise `status: "unknown"` (or `"standby"` if you know it is idle) and `mission: null` | `roster[].status`, `roster[].mission` |
| Routines and schedules | Your scheduled tasks, routines or automations list, reminders, recurring jobs you know of, with their time zone | `routines[]` |
| Deploys | Projects you know were published. If the Cloudflare tools are already connected you may list Pages projects read-only. Do not log in to anything new just for this | `deploys[]` |
| Team history | Dated milestones you know: when bots were added, things shipped | `log[]`, `team.team_formed` |

Rules while gathering:

- Do not message other bots or people to collect status, and do not create, change or run their routines. Reading is fine.
- Keep every line high level: a role, a remit, a task title. Never copy email contents, message text, names of the user's contacts, money amounts, account numbers, addresses or ids.
- If the user's team includes things they would not want on a shared screen (finance, health, family, an unannounced project), describe them generically ("Money admin", "Private project") or leave them out, and tell the user what you did.
- If you have no way to see something, use `null` or leave the list empty. If a lot is missing, you may ask the user once, in a single message listing the gaps. Do not keep asking.
- `team.team_formed`: the earliest real date you have for the team (for example when the first bot was set up). Put your reason in `team_formed_basis`. If you have no real date, ask the user; if they don't know, use the date you are building it and say so in `team_formed_basis`.

### 3. Write status.json

1. Copy `examples/northwind-crew.status.json` to `WORK_DIR/status.json` as a starting shape.
2. Replace **every** value with the facts from step 2. Delete every Northwind entry you do not replace. Nothing fictional may remain: the validator warns if any sample names are left in a file with SNAPSHOT panels.
3. Set the panels:
   - `clocks` and `feed`: `LIVE`, `as_of: null`.
   - `met` and `next_routine`: `LIVE`, `as_of: null`, as long as `team_formed` and the schedules are real.
   - `roster_count`, `roster`, `routines`, `deploys`, `log`, `org`: `SNAPSHOT`, with `as_of` set to today's date.
   - Use `DEMO` only for content that is not real (for example a trial run with made-up teammates). Then mark `met` and `next_routine` DEMO too, because their inputs are made up. Never mix fictional entries into a SNAPSHOT panel.
   - Add a short `note` to each panel saying where the data came from (e.g. "From my routines list"). Notes show as tooltips.
4. Set `generated_at` to now, with your time zone offset, and `generated_by` to your name.
5. `team.timezone` is the user's IANA time zone (e.g. `Europe/Berlin`). Routine times are in that zone unless a routine has its own `timezone`.
6. Map each routine to `daily`, `weekly`, `once` or `yearly` (see the schema). If a schedule does not fit (e.g. fortnightly), use the closest honest form and add a log line, or leave it out. If the time is unknown, set `time: null`.
7. A routine with no known owner gets `owner: null`. A member with no known remit gets `remit: null`, and `anti_jobs: []` if you don't know what it must not do.
8. Every roster member needs one `org.nodes[]` entry and must sit in exactly one place: the hub, or one group. If there is no coordinating bot, leave out `org.hub` and set no `hub: true` in the roster.

The full field list is in `references/schema.md`.

### 4. Validate

```sh
python3 scripts/validate.py WORK_DIR/status.json
```

Fix every `ERROR` line and run it again until it prints `VALID`. Read the `WARN` lines too: they catch LIVE badges on recorded data and placeholder text.

### 5. Build

```sh
python3 scripts/build.py --status WORK_DIR/status.json --out WORK_DIR/site
```

This validates again, copies the template and writes `site/status.json` plus `site/status.fallback.js`, the inline copy that lets the page work when opened straight from disk. Always rebuild after editing `status.json`: editing `site/status.json` alone leaves the inline copy stale.

### 6. Look at it

- Open `WORK_DIR/site/index.html` in a browser (a `file://` address works). Add `#org` to the address for the org chart. Keys 1 and 2 switch views.
- If you can run a headless browser, take a screenshot of each view to check it before showing the user. For example, with Chrome or Chromium:

  ```sh
  google-chrome --headless=new --hide-scrollbars --window-size=1920,1080 --virtual-time-budget=8000 --screenshot=ops.png "file://$PWD/WORK_DIR/site/index.html#ops"
  google-chrome --headless=new --hide-scrollbars --window-size=1920,1080 --virtual-time-budget=8000 --screenshot=org.png "file://$PWD/WORK_DIR/site/index.html#org"
  ```

  The `file://` address must be absolute, so replace `$PWD/WORK_DIR` with the full path to the folder if WORK_DIR is not under your current directory. Add `--no-sandbox` if Chrome runs as root or in a container. The binary may be called `chromium` or `chromium-browser`. The mission log types itself out, so a screenshot shows only its first few lines; that is expected.
- Check: the title is the team name, every panel has a badge, nothing says UNLABELLED, the org chart has no orphan nodes, and nothing private is showing.
- Give the user the path to `index.html` and the screenshots if you have them.

### 7. Privacy check (always before sharing or deploying)

Search the built folder for things that must not be on the page:

```sh
grep -rniE '@[a-z0-9.-]+\.[a-z]{2,}|password|token|secret|api[_-]?key|account[ _-]?id|iban|sort code|\+?[0-9][0-9 ]{9,}' WORK_DIR/site/status.json
```

Then add a second search with the user's surname, home town, employer and any client or project names they keep private. Every hit must be removed or made generic. Rebuild after any change.

### 8. Deploy (only if the user asked)

Follow `references/deploy-cloudflare.md`. It deploys to the user's own Cloudflare Pages with Wrangler, and recommends Cloudflare Access with an email one-time PIN so only the people they choose can see it. Do not deploy anywhere else, and do not deploy without the user saying so. After the first successful deploy, set `"deploy": "cloudflare-pages"` and `pages_project` in `WORK_DIR/refresh.json`, so later refreshes redeploy.

### 9. Keep it fresh (standard, not optional)

The board is only as current as `status.json`, so every setup refreshes itself in two ways. Set both up as part of the first build, then tell the user what you set up.

**Who owns the refresh.** The hub bot (the one with `hub: true`) owns it. If there is no hub, the bot that built the dashboard owns it. If you are not the hub but there is one, own it yourself for now, and give the user the rule text below so they can pass it to the hub. Do not message the hub yourself.

**Record the settings.** Write `WORK_DIR/refresh.json`:

```json
{ "owner_bot": "<your name>", "deploy": "local", "pages_project": null, "catch_up_time": "19:47", "timezone": "<team.timezone>" }
```

Set `deploy` to `"cloudflare-pages"` and `pages_project` to the project name only after the user has chosen their own Cloudflare Pages deploy (step 8). Until then the refresh only rebuilds the local site.

**The refresh itself.** A refresh is always the same steps, with the same rules as the first build:

1. Step 2: gather the current facts, read-only.
2. Step 3: update `status.json`, keeping the honesty rules: no invented numbers, `null` for unknowns, and new `as_of` dates and `generated_at`.
3. Step 4: validate. If it is not `VALID`, stop and keep the last good build.
4. Step 7: run the privacy check. If anything private shows up, stop until it is fixed.
5. Step 5: rebuild `WORK_DIR/site`.
6. Step 8: redeploy with `wrangler pages deploy`, only if `refresh.json` says `"deploy": "cloudflare-pages"`.

**(a) After every job.** The owning bot refreshes the board every time it hands out a job or a job finishes. Save this as a standing rule in your own memory or profile, word for word, with `WORK_DIR` replaced by the real path:

> Whenever I hand out or finish a job, I refresh Mission Control by following the mission-control skill refresh steps for WORK_DIR: regenerate status.json with no invented numbers, validate it, run the privacy check, rebuild, and redeploy only if WORK_DIR/refresh.json says it is deployed to Cloudflare Pages.

**(b) A daily catch-up routine.** This picks up anything the per-job refresh missed. Create a daily routine in the user's time zone at an odd minute in their evening, for example 19:47. Avoid :00, :15, :30 and :45, when scheduled jobs pile up. Give it this name and these instructions:

- Name: `Mission Control daily refresh`
- Instructions: "Follow the mission-control skill refresh steps for WORK_DIR, keeping the honesty rules and the privacy check. Stay quiet if it succeeds. If any step fails, tell the user which step failed and why, and leave the last good build in place."

Saving a routine may show the user a confirmation card. That is expected: say so in your message so they know to approve it. If they decline, keep the per-job rule and tell them the board will only update after jobs.

Once the routine exists, add it to `routines[]` in `status.json` (kind `daily`, its time, owner your roster id) and rebuild, so the board shows its own refresh. Do not add it if the user declined.

Daily is the default. Hourly is possible if the user wants it, but it uses more credits, so only switch if they ask.

**Tell the user** in one short message: where the dashboard is, that it refreshes after every job and at 19:47 (or the time you picked) each evening, whether refreshes redeploy or only rebuild locally, and that the routine stays quiet unless something fails.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Header says `inline fallback` | Normal for `file://`. On a web server it means `status.json` failed to load; check it is in the same folder |
| A red UNLABELLED badge | That panel has no valid `source` in `panels` |
| Org chart says there is no org section | Add `org` to `status.json` and rebuild |
| A routine shows "No future fire" | A `once` routine in the past. Remove it, or log it as done |
| Page looks unstyled | Open the built `site/index.html`, not `template/index.html` |
| The page is blank in a strict browser | It needs JavaScript. The CSP in `_headers` allows only the page's own files |
