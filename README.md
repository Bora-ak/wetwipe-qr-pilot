# Wet Wipe QR Pilot

A minimal Cloudflare Worker that records anonymous QR scans in D1 and redirects each successful scan to a randomly selected, repository-owned meme.

The permanent QR target will be:

```text
https://wetwipe-qr.YOUR_CLOUDFLARE_SUBDOMAIN.workers.dev/s
```

`GET /s` never records a scan. It serves a tiny page whose browser JavaScript sends `POST /api/scan`; only that POST writes to D1. This reduces counts from link previews, crawlers, security scanners, and QR apps that fetch a URL without a person opening it.

## How it works

- `/s` serves the no-store loading page from `public/scan.html`.
- The page posts to `/api/scan` and redirects with `window.location.replace()` to the returned meme path.
- The Worker assigns a first-party `wetwipe_id` UUID cookie for one year. Every successful POST creates a scan event; only a previously unseen UUID creates a visitor.
- `/stats` returns `totalScans`, `uniqueScans`, `repeatScans`, and `uniqueRate` without identifiers.
- `/memes/*` is served by Cloudflare Workers Static Assets from this project.

The D1 batch uses `INSERT OR IGNORE` against the visitors primary key before inserting the event. This prevents duplicate visitor rows while retaining every successful scan event.

## Prerequisites

- A Cloudflare account
- Node.js 22 LTS or newer and npm
- Git
- A GitHub account for automatic deployment

## 1. Install dependencies

From this repository:

```bash
npm install
```

## 2. Log in to Cloudflare

```bash
npx wrangler login
```

A browser window opens. Authorize Wrangler for the Cloudflare account that will own the Worker and D1 database. Confirm the active account if needed:

```bash
npx wrangler whoami
```

## 3. Create and configure D1

Create the production database:

```bash
npm run db:create
```

Wrangler prints a database UUID and usually a suggested binding configuration. Open `wrangler.jsonc` and replace only:

```text
REPLACE_WITH_D1_DATABASE_ID
```

with that real UUID. Keep the binding named `DB` and the database name `wetwipe-pilot-db`.

Apply the schema to the local development database:

```bash
npm run db:migrate:local
```

## 4. Add the meme images

Place these five real PNG files in `public/memes/` before testing or deploying:

```text
public/memes/canvas-weekend.png
public/memes/thirty-minute-assignment.png
public/memes/office-hours.png
public/memes/expensive-lunch.png
public/memes/academic-comeback.png
```

No placeholder binaries are included. The initial filenames represent these captions:

| File | Caption |
| --- | --- |
| `canvas-weekend.png` | me opening Canvas after a relaxing weekend |
| `thirty-minute-assignment.png` | me after "this assignment should take about 30 minutes" |
| `office-hours.png` | Things to say during office hours: "so theoretically, how important is the midterm?" |
| `expensive-lunch.png` | me spending $14 on lunch then remembering I'm a college student |
| `academic-comeback.png` | kinda chic to attend one lecture and call it an academic comeback |

The editable meme pool is the `MEMES` constant near the top of `src/index.ts`. If a filename is added or changed there, make the corresponding change in `public/memes/`.

Use only images you own or have permission to distribute.

## 5. Run and test locally

Start the local Worker:

```bash
npm run dev
```

Wrangler prints a local URL, normally `http://localhost:8787`.

1. Open `http://localhost:8787/stats` and note the zero counts.
2. Open `http://localhost:8787/s` in a browser. It should briefly show `loading...`, record one scan, and redirect to one meme.
3. Return to `/stats`. The first scan should show total `1`, unique `1`, repeat `0`.
4. Open `/s` again in the same browser. Counts should become total `2`, unique `1`, repeat `1`.
5. Open `/s` in a private window to simulate another browser installation. Both total and unique should increase.
6. Verify that a plain `GET /s` without executing JavaScript does not change `/stats`:

```bash
curl -i http://localhost:8787/s
curl -i http://localhost:8787/stats
```

For a direct API test while preserving the anonymous cookie:

```bash
curl -i -c /tmp/wetwipe-cookies.txt -X POST http://localhost:8787/api/scan
curl -i -b /tmp/wetwipe-cookies.txt -X POST http://localhost:8787/api/scan
```

The first response includes `Set-Cookie`; both responses include an `ok` result and a meme URL. The cookie file is only local test data and is outside this repository.

Run static validation:

```bash
npm run check
```

## 6. Apply the production migration and deploy

Apply the migration to the remote D1 database:

```bash
npm run db:migrate:remote
```

Deploy the Worker and its static assets:

```bash
npm run deploy
```

Wrangler prints the resulting `*.workers.dev` URL. If workers.dev is not yet enabled for this account, Wrangler or the Cloudflare dashboard will prompt you to choose the account's workers.dev subdomain. The project name in that URL comes from `name` in `wrangler.jsonc`: `wetwipe-qr`.

Open the printed URL, then test its `/s` and `/stats` routes from a phone over HTTPS. Test on at least two phones and confirm every meme URL directly.

## GitHub → Cloudflare Automatic Deployment

Cloudflare Workers Builds can connect directly to GitHub, so a separate GitHub Actions workflow is unnecessary:

```text
git push origin main
        ↓
GitHub
        ↓
Cloudflare Workers Builds
        ↓
automatic production deployment
        ↓
*.workers.dev
```

Create and push the GitHub repository:

```bash
git add .
git commit -m "Build wet-wipe QR pilot"
```

In GitHub, create an empty repository named `wetwipe-qr` with your preferred visibility. Do not initialize it with another README, license, or `.gitignore`. On GitHub's **Quick setup** page, copy and run the two commands shown under **push an existing repository from the command line**; these add your account-specific `origin` URL and push `main`.

Then configure Cloudflare:

1. In the Cloudflare dashboard, go to **Workers & Pages** and select the already deployed `wetwipe-qr` Worker.
2. Open **Settings → Builds**, select **Connect**, choose GitHub, and authorize the Cloudflare Workers & Pages GitHub app if prompted.
3. Select the `wetwipe-qr` repository. The Cloudflare Worker name must remain exactly `wetwipe-qr`, matching `name` in `wrangler.jsonc`.
4. Set the production Git branch to `main`. You can confirm or change it later under **Settings → Build → Branch control**.
5. Leave the optional root directory empty so Cloudflare uses the repository root.
6. Leave the optional build command empty; this Worker needs no framework build. Keep the production deploy command at its default, `npx wrangler deploy`.
7. Save the connection, then push a commit to trigger the first Workers Build. Cloudflare installs the locked npm dependencies and deploys from `wrangler.jsonc`.
8. In the Worker's **Settings → Bindings**, confirm the `DB` binding points to `wetwipe-pilot-db`. The committed `database_id` should normally make this binding available automatically; if Cloudflare prompts for it, select the same database.
9. Open the build history and confirm the `main` build and production deployment succeeded. Future pushes to `main` should automatically repeat this deployment.

The remote migration is a one-time infrastructure step and is not rerun on every deployment. If a later code change needs a new migration, create and commit it, then apply it remotely before deploying code that depends on it.

## Before Printing the QR

**DO NOT print the 1,000 physical wet wipes until this exact production URL has been deployed and tested on multiple phones.**

- [ ] Production `/s` URL works.
- [ ] All five memes load.
- [ ] First scan increments total and unique.
- [ ] Second scan from the same browser increments total only.
- [ ] Scan from another phone increments both.
- [ ] `/stats` displays expected values.
- [ ] JavaScript-disabled/bot `GET /s` does not increment scan count.
- [ ] HTTPS works.
- [ ] Final QR resolves to the exact production `/s` URL.

Because the QR points to `/s`, the Worker behavior and meme pool can change later without changing the printed QR code. The hostname and `/s` path printed in the QR must remain available.

## Privacy and counting limitations

This pilot stores only:

- A randomly generated visitor UUID
- Timestamps
- The meme path served for each scan

It does not store names, contact details, precise location, IP addresses, User-Agent strings, or browser fingerprints. There are no analytics SDKs.

`uniqueScans` approximates unique browser/device installations, not unique humans. Clearing cookies, private browsing, a different browser, or another device can count the same person again. Conversely, multiple people sharing a browser can count as one unique visitor. Every successful scan still increments `totalScans`.

`/stats` is intentionally public for this MVP and exposes only aggregate counts. The route is isolated in `handleStats`, so an admin-token check can be added later without changing the database design.

## Routes

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/` | Tiny project page; no counting |
| `GET` | `/s` | Serves the no-store scan page; no counting by the GET |
| `POST` | `/api/scan` | Records one scan and returns a random meme URL |
| `GET` | `/stats` | Returns aggregate, no-store JSON statistics |
| `GET` | `/memes/<file>.png` | Serves a local static meme asset |

Unknown routes return `404`; unsupported methods on known routes return `405` with an `Allow` header.

## Production URL

After the first deployment, replace this documentation placeholder with the exact URL Wrangler prints:

```text
https://wetwipe-qr.YOUR_CLOUDFLARE_SUBDOMAIN.workers.dev/s
```

The only values/assets intentionally left for you are the D1 database UUID, the Cloudflare workers.dev subdomain determined by your account, and the five actual PNG files.

Auto deploy test.
