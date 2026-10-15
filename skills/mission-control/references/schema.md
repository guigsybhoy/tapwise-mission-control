# status.json schema (v1)

Mission Control reads one file, `status.json`. The page fetches it on load and again every 60 seconds (`cache: no-store`). If the fetch fails, or the page is opened from `file://`, it uses `status.fallback.js`, an inline copy written by `scripts/build.py`. The header shows which one is in use.

Machine-readable version: `template/status.schema.json` (JSON Schema 2020-12). Check a file with `python3 scripts/validate.py status.json`. It needs nothing beyond Python 3.

A complete, valid example lives in `examples/northwind-crew.status.json`. Every name in it is fictional.

## Honesty rules

These are the point of the format. A dashboard is only useful if every number on it can be trusted.

- Every panel shows a badge from `panels.<id>.source`: `LIVE`, `SNAPSHOT` or `DEMO`.
- `LIVE` is only for values the browser computes at view time from real inputs: the clocks, the status feed, and the elapsed time or countdowns when the dates and schedules behind them are real. A LIVE panel normally has `as_of: null`.
- `SNAPSHOT` is a real fact somebody recorded. It needs an `as_of` date, which is shown on the card.
- `DEMO` is illustrative or made up. It also needs `as_of`. Use it for sample data, and for anything you filled in to show the layout.
- If a value is unknown, use `null`. The page shows a dash and "not yet reported". Never put in a guess, an estimate or a round number that looks plausible.
- A panel with a missing or invalid `source` shows a red UNLABELLED badge.
- Keep it high level. No personal or financial details, no email contents, no addresses, no phone numbers, no account ids.

## Types used below

| Name | Format |
|---|---|
| date | `YYYY-MM-DD` |
| datetime | ISO 8601 with offset, e.g. `2026-10-15T10:30:00+02:00` |
| date-or-datetime | either of the above |
| hm | `HH:MM`, 24-hour |
| id | lower case letters, digits and hyphens, e.g. `research-bot` |

## Top level

| Field | Type | Req | Notes |
|---|---|---|---|
| `schema_version` | integer, always `1` | yes | |
| `generated_at` | date-or-datetime | yes | When the file was written. Shown in the footer |
| `generated_by` | string | no | Who wrote it, e.g. the bot's name or "weekly routine" |
| `team` | object | yes | See below |
| `panels` | object | yes | Badge settings for each panel |
| `roster` | array | yes | Crew roster. Can be empty |
| `routines` | array | yes | Routine schedule. Can be empty |
| `deploys` | array | yes | Known deploys. Can be empty |
| `log` | array | yes | Mission log entries. Can be empty |
| `org` | object | no | Org chart view. If it's missing, the view says so |

## `team`

| Field | Type | Req | Notes |
|---|---|---|---|
| `name` | string | yes | Page title, shown in upper case. Also sets the browser tab title |
| `subtitle` | string | no | Line under the title |
| `timezone` | string (IANA) | yes | Home zone for the local clock and schedules, e.g. `Europe/Paris`. If it's missing the page uses the browser's zone |
| `team_formed` | date-or-datetime | yes | Mission elapsed time counts from this |
| `team_formed_basis` | string | no | Why that date was chosen, e.g. "date the first bot was set up" |

## `panels`

An object keyed by panel id. Each value is `{ source, as_of, note? }`.

| Field | Type | Req | Allowed |
|---|---|---|---|
| `source` | string | yes | `LIVE`, `SNAPSHOT`, `DEMO` |
| `as_of` | date-or-datetime or null | yes | Must be a date when source is SNAPSHOT or DEMO |
| `note` | string | no | Shown as a tooltip on the badge |

The panel ids. All are required except `org`.

| id | What it labels | Usual source with real data |
|---|---|---|
| `met` | Mission elapsed time cell | LIVE (DEMO if team_formed is made up) |
| `clocks` | UTC and local clock cells | LIVE |
| `roster_count` | Crew "on roster" count cell | SNAPSHOT |
| `next_routine` | Next routine cell | LIVE (DEMO if the schedule is made up) |
| `feed` | Status feed indicator in the header | LIVE |
| `roster` | Crew Roster card | SNAPSHOT |
| `routines` | Routine Schedule card | SNAPSHOT |
| `deploys` | Deploys card | SNAPSHOT |
| `log` | Mission Log terminal | SNAPSHOT |
| `org` | Org Chart view | SNAPSHOT |

## `roster[]`

| Field | Type | Req | Allowed or notes |
|---|---|---|---|
| `id` | id | yes | Unique. Other sections refer to members by this |
| `name` | string | yes | Display name |
| `role` | string | yes | High-level role only |
| `hub` | boolean | no | `true` highlights the card (the coordinating bot, if there is one) |
| `status` | string | yes | `active`, `standby`, `online`, `paused`, `offline`, `unknown` |
| `mission` | string or null | no | Current task, high level. `null` shows "not yet reported" |

Use `unknown` when you can't tell a member's status. The top bar shows the roster length as "on roster", and only shows an "online" count if some members have `status: "online"`.

The roster card fits up to about 16 members on one wall screen. Past about 13 the cards get more compact and the mission line is hidden, so for bigger teams consider listing only the main members. The org chart view scrolls if it runs long.

## `routines[]`

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | |
| `name` | string | yes | Long names wrap onto two lines |
| `owner` | id or null | no | A roster id |
| `timezone` | string (IANA) | no | Defaults to `team.timezone` |
| `schedule.kind` | string | yes | `daily`, `weekly`, `once`, `yearly` |
| `schedule.time` | hm or null | daily and weekly: yes (null allowed). Others: no | If null, the countdown runs to 00:00 local and the card says "time not reported" |
| `schedule.weekdays` | array of `mon` to `sun` | weekly: yes | |
| `schedule.date` | date | once: yes | |
| `schedule.month_day` | `MM-DD` | yearly: yes | |

Anything that does not fit these four kinds (for example "every other Thursday", or a cron expression) should be mapped to the nearest honest form, or left out and mentioned in the log. Do not invent a time.

The browser computes the next fire time, including daylight saving changes, the countdown and, for recurring routines, how much of the current interval has passed (the thin bar). The "Next routine" cell picks the soonest future fire. A `once` routine in the past drops out.

## `deploys[]`

| Field | Type | Req | Allowed or notes |
|---|---|---|---|
| `id` | id | yes | |
| `name` | string | yes | Project or Worker name |
| `platform` | string | yes | `pages`, `worker`, `other` |
| `url` | https URL or null | no | Public address. Null shows "URL not listed". Leave private or preview URLs out |
| `status` | string | yes | `deployed`, `pending`, `failed`, `retired`, `unknown` |
| `last_deploy` | date-or-datetime or null | no | Null shows "not yet reported". "Days ago" is computed live |
| `note` | string | no | Not displayed |

The stats strip only counts entries in this list. It never claims a total number of deploys.

## `log[]`

| Field | Type | Req | Allowed or notes |
|---|---|---|---|
| `date` | date | yes | Entries are sorted by date and time |
| `time` | hm or null | no | Local time, if known |
| `tag` | string | yes | `info`, `deploy`, `build`, `milestone`, `cancel`, `alert` (each has its own colour) |
| `bot` | id or null | no | Roster id, shown in brackets |
| `text` | string, up to 120 characters | yes | High level. Never paste message contents |

The terminal types the entries out, then replays them every 60 seconds. Around 5 to 12 entries reads best.

## `org`

| Field | Type | Req | Notes |
|---|---|---|---|
| `root` | object | yes | The top node: `{ id, name, title?, remit?, anti_jobs? }`. This is the person the team works for. `title` is the label under the name and defaults to "Owner". A first name or "Owner" is plenty on a shared screen |
| `hub` | id | no | Roster id of a coordinating bot drawn beneath the root. Leave it out if every bot reports straight to the owner; the connector lines then run from the root |
| `groups[]` | array | yes | `{ id, name, members: [roster ids] }`, drawn left to right. Up to about 8 groups fit side by side |
| `nodes[]` | array | yes | `{ id, remit, anti_jobs: [string] }`, one per roster member. `remit: null` or an empty `anti_jobs` shows "not yet reported" |

A member's name and role in the org chart come from `roster`. "Anti-jobs" are the things a member is explicitly not allowed or not meant to do, shown as "Does not".

## Cross-reference rules (checked by validate.py)

- Roster ids are unique.
- Every `routines[].owner`, `log[].bot`, `org.hub` and `org.groups[].members[]` is a roster id.
- Every roster member has one `org.nodes[]` entry and appears exactly once, either as the hub or in one group.

## URL options

- `#org` opens the org chart, `#ops` opens operations. Keys 1 and 2 switch views.
- `?rotate=60` swaps between the two views every 60 seconds (minimum 10), for an unattended wall screen.
