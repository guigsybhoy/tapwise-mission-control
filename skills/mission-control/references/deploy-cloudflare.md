# Deploying to your own Cloudflare Pages

Only do this when the user asks for it. Opening the dashboard as a local file works without any account.

Everything here happens in the user's own Cloudflare account, with their own login. The plugin ships no account ids, tokens or project names.

## Before you deploy

1. Rebuild so the output folder is current: `python3 scripts/build.py --status <status.json> --out <out>`.
2. Run the privacy check from SKILL.md step 7 over the output folder, and read `status.json` once more as if you were a stranger seeing it.
3. Confirm with the user:
   - the project name (lower case letters, digits and hyphens, e.g. `crew-mission-control`). It becomes `<project>.pages.dev`, which anyone can guess, so avoid personal names.
   - whether they want Cloudflare Access in front of it (recommended, see below).

## Deploy with Wrangler

Wrangler is Cloudflare's command line tool. It needs Node.js.

```sh
# one-off: sign in to the user's Cloudflare account (opens a browser for them to approve)
npx wrangler login

# first deploy only: create the Pages project
npx wrangler pages project create <project> --production-branch main

# every deploy, including refreshes
npx wrangler pages deploy <out> --project-name <project> --branch main --commit-dirty=true
```

- If the latest Wrangler refuses your Node version, use Wrangler 3 instead: replace `npx wrangler` with `npx wrangler@3` in every command.
- In a headless or CI setting where `wrangler login` cannot open a browser, the user can create an API token with the "Cloudflare Pages: Edit" permission and set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment. Ask the user to do this. Never print or store the token in the dashboard folder.
- If the user has the Cloudflare MCP server or plugin connected, you can use it to check the project exists and to set up Access, but the upload itself is simplest with Wrangler.

The site is then at `https://<project>.pages.dev`. Open it and check both views (`#ops` and `#org`), and that the header says `status.json` rather than `inline fallback`.

The template's `_headers` file sets `X-Robots-Tag: noindex`, a strict Content Security Policy, and `Cache-Control: no-store` on `status.json`, so open pages pick up a refresh within 60 seconds without a reload.

## Recommended: put it behind Cloudflare Access

A team dashboard is better kept private, even when the content is high level. Cloudflare Access with an email one-time PIN is free for small teams and needs no passwords.

These steps are in the Cloudflare dashboard. The user can do them, or you can walk them through it.

1. Open Zero Trust (the first time, Cloudflare asks for a team name and a plan; the Free plan is fine).
2. Settings, Authentication, Login methods: make sure **One-time PIN** is listed. Add it if not.
3. Access, Applications, **Add an application**, **Self-hosted**.
4. Application name: anything, e.g. "Mission Control". Session duration: 24 hours is a sensible default.
5. Application domain: `<project>.pages.dev`. Add a second domain, `*.<project>.pages.dev`, so preview deploys are covered too.
6. Add a policy: Action **Allow**, Include **Emails**, and list the addresses that may see it (the user's own, plus anyone they name).
7. Save. Then open the site in a private browser window. You should see the Cloudflare Access sign-in asking for an email, not the dashboard. Enter an allowed address, and a PIN arrives by email.

There is also a shortcut in the Pages project: Settings, General, **Enable access policy**. It protects preview deployments only, so the production steps above are still needed.

If the user decides not to use Access, keep the content strictly high level and remember that `*.pages.dev` addresses are easy to find.

## Refreshing a deployed dashboard

After the first deploy, set `"deploy": "cloudflare-pages"` and `"pages_project": "<project>"` in `WORK_DIR/refresh.json`. From then on, every refresh (after each job and in the daily catch-up routine, see SKILL.md step 9) regenerates `status.json`, validates it, runs the privacy check, rebuilds into the same output folder and runs the same `wrangler pages deploy` command. Nothing else changes.

## Taking it down

`npx wrangler pages project delete <project>` removes the project and every deployment. This is irreversible, so only run it when the user asks.
