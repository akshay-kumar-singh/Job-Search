# Job Search

A personal job finder with no backend and no database. Every 6 hours (or whenever I run it from GitHub) a GitHub Action collects software-engineering
openings from company career pages and public job boards, keeps the ones that fit my profile, scores them, and saves
them as JSON files in this repository. A small React app on Netlify reads those files, so I can browse jobs by country,
open the posting, and tick what I applied to.

- **No server or database to run, no API keys.** GitHub Actions does the collecting, a git branch holds the jobs, Netlify
  serves the page, and one small Netlify Function keeps your applications in Netlify's built-in storage.
- **It never applies to anything.** It only reads public listings; you apply on the employer's site.
- **About 500 sources:** 360+ company career pages, Workable's job search, Amazon's job search and six job boards —
  and it finds new companies by itself every run.
- **A Fintech section:** only jobs at payments, banking, lending, investing, crypto and insurance companies, plus a
  directory of 120+ fintech companies with links to their careers pages.
- **18 countries:** India, remote roles open to India, UAE, Saudi Arabia, Qatar, the Netherlands, Germany, Ireland,
  the UK, Sweden, Denmark, Switzerland, Luxembourg, Singapore, Japan, Australia, Canada and the United States.

## How it works

```
main branch                                   data branch (rewritten on every run)
├── collector/jobbot.py   ── every 6 hours ──▶ ├── meta.json          last run, sources, counts, fintech companies
├── collector/config.json   (GitHub Actions)   ├── jobs/<country>.json one file per country
│                                              └── discovered.json    company boards found on Hacker News
├── web/  (React app) ─── Netlify ───▶ page that fetches the data branch from GitHub when it loads
└── .github/workflows/collect.yml
```

1. **Collect** — `collector/jobbot.py` (Python, standard library only) reads about 500 sources, filters by job title,
   location, posting date and years of experience asked, gives each job a 0–100 **fit** score from the skills in
   `collector/config.json`, and marks fintech jobs.
2. **Store** — the workflow saves the result to the `data` branch as a single commit, overwritten each run, so the
   repository doesn't grow. It reads the previous run first, so it knows which jobs are new and which have closed.
3. **Show** — the React app fetches `meta.json` and the selected country's file straight from
   `raw.githubusercontent.com`. New jobs appear without redeploying the site.
4. **Track** — "Mark applied", status (Applied → Interview → Offer / Rejected) and notes are saved in your browser and
   online: `web/netlify/functions/applications.mts` stores the list in [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
   (no setup or keys needed). Each browser gets a random secret key; **Use on another device** on the *My applications*
   tab gives a private link that opens the same list on your phone. When two devices change the same job, the newest
   change wins. **Export** still downloads a copy.

## What you see

- **All tech jobs / Fintech** — the switch at the top. *Fintech* shows only fintech jobs (with the same countries,
  filters and tracking) and adds a **Companies** tab: every fintech company by sector, how many roles each has for you
  (click to see them), and a link to its careers page.
- **All countries** at once (the default), or one country at a time. Chips show how many jobs each has and how many
  are new in the last 24 hours.
- **Jobs** — roles asking for up to 2 years of experience. **Stretch** — roles asking for 3 years (worth a try).
  Roles asking for more are left out.
- **Fresh only** — jobs posted in the last 7 days. A job disappears from the lists once it's older than that.
- Each job: fit score (Great / Good / Fair), experience asked, a *Fintech · Payments* style tag, salary when stated, matched skills, posted and
  first-seen dates, and for countries abroad a **visa note** ("Mentions visa sponsorship or relocation", "Says no visa
  sponsorship", "Asks for an existing right to work", "Asks for German", and for Singapore whether the pay meets the
  Employment Pass minimum).
- **Apply on company site / Apply on Cutshort …** opens the original posting in a new tab. When you come back, the card
  asks *Did you apply?* — *Yes* moves it to **My applications**, which keeps it for good.
- Filters: search, newest first / best match, posted today / 3 days / this week, match level, visa notes, new today,
  hide applied. Postings only open to citizens are dropped.
- *Search by hand* links per country (LinkedIn, Indeed, Naukri, Bayt, SEEK, …), already filtered to the past week, for
  sites that can't be read automatically.
- **How it works** — the same explanation inside the app, with the live numbers.

The design matches the portfolio and DeskCharm: cream paper, near-black ink, gold accents, Inter Tight headlines with
one Newsreader italic word, black pill buttons and white rounded cards.

## Where jobs come from

| Source | Covers |
|---|---|
| Company career pages on Greenhouse, Lever, Ashby, SmartRecruiters and Workable | 360+ companies, e.g. Stripe, Razorpay, CRED, Groww, Airwallex, Adyen, Monzo, Coinbase, Spotify, Canva, Grab, Careem — 120+ of them fintechs |
| [Workable job search](https://jobs.workable.com) | Every company that hires through Workable: React, Node.js, full stack, frontend, JavaScript and software engineer searches in each country, last 7 days |
| [Amazon Jobs](https://www.amazon.jobs) | Frontend and SDE roles in each country |
| [Hacker News “Who is hiring?”](https://news.ycombinator.com/submitted?id=whoishiring) | Not a job source itself: every run, company boards linked from the latest thread are checked and the ones hiring in these countries are followed from then on |
| [MyCareersFuture](https://www.mycareersfuture.gov.sg) | Singapore's national job board (with salaries) |
| [Arbeitnow](https://www.arbeitnow.com) | Germany / EU jobs that offer visa sponsorship |
| [Cutshort](https://cutshort.io) | React, Node and frontend jobs in Bangalore |
| [Himalayas](https://himalayas.app), [Remotive](https://remotive.com), [Remote OK](https://remoteok.com) | Remote jobs open to India |

Only jobs posted in the last 7 days are kept (a job with no posting date counts from the day it was first found).
Company career pages list every open role, so a job that disappears from one is dropped as closed.

It can't read literally every job: LinkedIn, Indeed, Naukri, Bayt and SEEK block bots, and companies with their own
custom careers sites (or Workday) can't be read reliably. For those, each country has *Search by hand* links, already
filtered to the past week.

**What counts as fintech:** a job at a company marked `"fintech": true` in the config, at a company that describes itself
as fintech (Workable search gives the company's description), or a posting that clearly is one (the word fintech, or two
signals such as payments platform, UPI, KYC, neobank, lending platform, crypto).

## Deploy

1. **Push this repository to GitHub** (public, so the page can read the data branch without a key).
2. **Collect once:** GitHub → *Actions* → *Collect jobs* → *Run workflow*. After that it runs every 6 hours on its own.
   It publishes with the built-in `GITHUB_TOKEN`; nothing to configure.
3. **Netlify:** *Add new site* → *Import an existing project* → GitHub → this repository. `netlify.toml` sets
   everything (base `web`, build `npm run build`, publish `dist`, Node 22), so just press *Deploy*.

### When it runs

- **Every 6 hours** (cron `17 */6 * * *`: about 5:47 AM, 11:47 AM, 5:47 PM and 11:47 PM India time). GitHub starts
  scheduled runs when it has capacity, so a run can be late, sometimes by a few hours.
- **Any time you want:** GitHub → *Actions* → *Collect jobs* → *Run workflow* (the website's **Run now on GitHub** link
  opens that page). A run takes about 2 minutes; the new jobs show up on the site 5–10 minutes later.

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
| `max_posting_age_days` | Jobs posted longer ago than this are dropped, whatever the source (7 = fresh jobs only) |
| `target_employers` | Companies marked with ★ |
| `discover_boards` / `discover_per_run` | Find new company boards in the latest Hacker News “Who is hiring?” thread, and how many to check per run |
| `workers` | How many sources are read at the same time (each site also has its own small limit) |
| `countries` | Per country: `locations` words, optional `exclude` / `require` words, `nationality` and `citizens_only` phrases (those postings are dropped), `language`, `salary_floor`, and `boards` (the *Search by hand* links) |
| `feeds` | Sources. Company boards: `{"ats": "greenhouse" \| "lever" \| "ashby" \| "smartrecruiters" \| "workable", "slug": …, "name": …}` — the slug is the company's name in its careers URL, e.g. `boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<slug>`. Add `"fintech": true, "sector": "Payments"` to put a company in the Fintech section. Searches: `{"ats": "workable_search", "slug": "<search>", "location": "India"}` and `{"ats": "amazon", "slug": "<search>", "country": "IND"}` |

## Run locally

```bash
python3 collector/jobbot.py --config collector/config.json --data data   # writes ./data (git-ignored)

cd web
npm install
cp -R ../data public/data && VITE_DATA_URL=/data npm run dev            # the app, reading your local data
```

Online saving of applications runs as a Netlify Function, so it works on Netlify (or with `npx netlify dev`).
With plain `npm run dev` the app says it couldn't reach the server and keeps your list in the browser.

## Notes

- Be gentle with the sources: one run every 6 hours plus the ones you start, one request at a time to the smaller sites.
- Remote OK asks that each job links back to its page there, which the app does.
- Scoring is keyword matching — tune `skills` and the title lists to your own profile.

## License

[MIT](LICENSE)
