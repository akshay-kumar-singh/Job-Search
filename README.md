# Job Search

A personal job finder with no backend and no database. Every 6 hours a GitHub Action collects software-engineering
openings from company career pages and public job boards, keeps the ones that fit my profile, scores them, and saves
them as JSON files in this repository. A small React app on Netlify reads those files, so I can browse jobs by country,
open the posting, and tick what I applied to.

- **No backend, no database, no API keys.** GitHub Actions does the collecting, a git branch holds the data, Netlify serves a static page.
- **It never applies to anything.** It only reads public listings; you apply on the employer's site.
- **18 countries:** India, remote roles open to India, UAE, Saudi Arabia, Qatar, the Netherlands, Germany, Ireland,
  the UK, Sweden, Denmark, Switzerland, Luxembourg, Singapore, Japan, Australia, Canada and the United States.

## How it works

```
main branch                                   data branch (rewritten on every run)
├── collector/jobbot.py   ── every 6 hours ──▶ ├── meta.json          last run, sources, counts per country
├── collector/config.json   (GitHub Actions)   └── jobs/<country>.json one file per country
├── web/  (React app) ─── Netlify ───▶ page that fetches the data branch from GitHub when it loads
└── .github/workflows/collect.yml
```

1. **Collect** — `collector/jobbot.py` (Python, standard library only) reads about 110 sources, filters by job title,
   location and years of experience asked, and gives each job a 0–100 **fit** score from the skills in
   `collector/config.json`.
2. **Store** — the workflow saves the result to the `data` branch as a single commit, overwritten each run, so the
   repository doesn't grow. It reads the previous run first, so it knows which jobs are new and which have closed.
3. **Show** — the React app fetches `meta.json` and the selected country's file straight from
   `raw.githubusercontent.com`. New jobs appear without redeploying the site.
4. **Track** — "Mark applied", status (Applied → Interview → Offer / Rejected) and notes are saved in your browser
   (localStorage). Use **Export / Import** on the *My applications* tab to back them up or move them to another device.

## What you see

- Country chips with the number of jobs and how many are new in the last 24 hours.
- **Jobs** — roles asking for up to 2 years of experience. **Stretch** — roles asking for 3 years (worth a try).
  Roles asking for more are left out.
- Each job: fit score, experience asked, salary when stated, matched skills, and for countries abroad a **visa note**
  ("Mentions visa sponsorship or relocation", "Says no visa sponsorship", "Asks for an existing right to work",
  "Asks for German", and for Singapore whether the pay meets the Employment Pass minimum).
- Filters: search, fit, posted within, visa notes, sort, hide applied. Postings only open to citizens are dropped.
- *Search by hand* links per country (LinkedIn, Indeed, Bayt, SEEK, Naukri, …) for sites that can't be read automatically.

## Where jobs come from

| Source | Covers |
|---|---|
| Company career pages on Greenhouse, Lever, Ashby, SmartRecruiters and Workable | ~95 companies, e.g. Stripe, Razorpay, Airwallex, Adyen, Spotify, Mercari, Cohere, Careem, Grab, Canva |
| [MyCareersFuture](https://www.mycareersfuture.gov.sg) | Singapore's national job board (with salaries) |
| [Arbeitnow](https://www.arbeitnow.com) | Germany / EU jobs that offer visa sponsorship |
| [Cutshort](https://cutshort.io) | React, Node and frontend jobs in Bangalore |
| [Himalayas](https://himalayas.app), [Remotive](https://remotive.com), [Remote OK](https://remoteok.com) | Remote jobs open to India |

Company career pages list every open role, so a job that disappears from one is marked closed. Job-board listings
older than 30 days are dropped.

## Deploy

1. **Push this repository to GitHub** (public, so the page can read the data branch without a key).
2. **Collect once:** GitHub → *Actions* → *Collect jobs* → *Run workflow*. After that it runs every 6 hours on its own.
   It publishes with the built-in `GITHUB_TOKEN`; nothing to configure.
3. **Netlify:** *Add new site* → *Import an existing project* → GitHub → this repository. `netlify.toml` sets
   everything (base `web`, build `npm run build`, publish `dist`, Node 22), so just press *Deploy*.

The page reads `https://raw.githubusercontent.com/akshay-kumar-singh/Job-Search/data`. If you fork this, change
`DEFAULT_DATA_URL` in `web/src/lib/api.ts` (or set `VITE_DATA_URL` in Netlify).

GitHub pauses scheduled workflows in a repository with no activity for 60 days. The data commits count as activity, but
if the schedule ever stops, re-enable it under *Actions*.

## Customise

Everything is in `collector/config.json`; push a change and the next run uses it.

| Key | Meaning |
|---|---|
| `title_include` / `title_exclude` | A job title must contain one of the first (whole words) and none of the second |
| `skills` | `{name, match, points}` — each skill found in the title or description adds its points to the fit score |
| `min_score` | Jobs below this fit score are left out (every job starts at 20; +15 if it asks ≤1 year, +8 otherwise) |
| `max_required_years` / `stretch_years` | Up to the first goes on *Jobs*, up to the second on *Stretch*, more is dropped |
| `max_posting_age_days` | Job-board listings older than this are dropped |
| `target_employers` | Companies marked with ★ |
| `countries` | Per country: `locations` words, optional `exclude` / `require` words, `nationality` and `citizens_only` phrases (those postings are dropped), `language`, `salary_floor`, and `boards` (the *Search by hand* links) |
| `feeds` | Sources. Company boards: `{"ats": "greenhouse" \| "lever" \| "ashby" \| "smartrecruiters" \| "workable", "slug": …, "name": …}` — the slug is the company's name in its careers URL, e.g. `boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<slug>` |

## Run locally

```bash
python3 collector/jobbot.py --config collector/config.json --data data   # writes ./data (git-ignored)

cd web
npm install
cp -R ../data public/data && VITE_DATA_URL=/data npm run dev            # the app, reading your local data
```

## Notes

- Be gentle with the sources: one run every 6 hours, one request at a time to the smaller sites.
- Remote OK asks that each job links back to its page there, which the app does.
- Scoring is keyword matching — tune `skills` and the title lists to your own profile.

## License

[MIT](LICENSE)
