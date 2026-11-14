import type { ReactNode } from 'react'
import type { Meta } from '../types'
import { clock, nextRun, timeAgo } from '../lib/format'

function Section({ n, title, wide, children }: { n: number; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`card p-6 ${wide ? 'md:col-span-2' : ''}`}>
      <h2 className="flex items-center gap-3 text-lg font-bold text-ink">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-extrabold text-accent">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted [&_b]:font-semibold [&_b]:text-ink">{children}</div>
    </section>
  )
}

export default function HowItWorks({ meta, onBrowse }: { meta: Meta; onBrowse: () => void }) {
  const next = nextRun()
  const ok = meta.sources.filter((s) => s.ok).length
  const maxAge = meta.max_posting_age_days ?? 7
  const named = (prefix: string) => meta.sources.filter((s) => s.name.startsWith(prefix)).length
  const companyBoards = meta.company_boards ?? meta.sources.filter((s) => s.type === 'Company careers').length
  const workableSearches = named('Workable search')
  const amazonSearches = named('Amazon Jobs')
  const fintechFollowed = (meta.fintech_companies ?? []).filter((c) => c.followed).length

  return (
    <div className="space-y-4">
      <div className="rounded-[1.375rem] bg-ink p-6 text-paper sm:p-8">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-2 text-2xl font-extrabold leading-tight text-white sm:text-3xl">
          One minute to <span className="serif-accent text-gold-light">understand</span> it all.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/80">
          A bot checks {meta.sources.length} job sources every 6 hours, keeps the software-engineering jobs that fit you and
          were posted in the last {maxAge} days, and scores each one. You open a job, apply on the employer's page, and tick
          it here so you can track it.
        </p>
        <button type="button" onClick={onBrowse} className="btn mt-5 bg-paper text-ink hover:bg-white">
          Browse jobs →
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section n={1} title="Where the jobs come from">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>{companyBoards} company career pages</b> (Stripe, Razorpay, Airwallex, Adyen, Monzo, Spotify, Grab, Canva,
              Careem and more), read through the hiring systems they post jobs with: Greenhouse, Lever, Ashby, SmartRecruiters
              and Workable.
            </li>
            {workableSearches > 0 && (
              <li>
                <b>Workable's job search</b> — every company that hires through Workable, searched for React, Node.js, full
                stack, frontend, JavaScript and software engineer roles in each country ({workableSearches} searches).
              </li>
            )}
            {amazonSearches > 0 && (
              <li>
                <b>Amazon's own job search</b> for frontend and SDE roles in each country.
              </li>
            )}
            <li>
              <b>Job boards:</b> MyCareersFuture (Singapore's government board), Arbeitnow (Germany/EU jobs with visa
              sponsorship), Cutshort (Bangalore), and Himalayas, Remotive and Remote OK (remote jobs open to India).
            </li>
            <li>
              <b>New companies, found by itself:</b> every run it reads Hacker News' monthly “Who is hiring?” thread, checks each
              company's careers page, and starts following the ones hiring in your countries
              {meta.discovered_boards ? ` (${meta.discovered_boards} so far)` : ''}.
            </li>
          </ul>
          <p>
            Last run: {ok} of {meta.sources.length} sources answered. The full list is under “sources” at the top.
          </p>
        </Section>

        <Section n={2} title="When it updates">
          <p>
            Every 6 hours, by a scheduled GitHub Action. Last update: <b>{timeAgo(meta.updated)}</b>. Next: around{' '}
            <b>{clock(next)}</b> (GitHub sometimes starts a few minutes late).
          </p>
          <p>
            <b>New</b> means the bot first saw the job in the last 24 hours. The page refreshes the data by itself, so just keep
            it open or come back later.
          </p>
        </Section>

        <Section n={3} title="Which jobs you see">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Titles like Software Engineer/Developer, SDE, Frontend, Full Stack, React, Node.js, JavaScript, TypeScript, Web,
              UI or Backend developer.
            </li>
            <li>No Senior, Staff, Lead, Manager, Intern, QA, Data, DevOps, Mobile, Java, .NET, Go or Angular roles.</li>
            <li>
              <b>Jobs</b>: asks for up to {meta.max_required_years} years of experience, or doesn't say. <b>Stretch</b>: asks
              for {meta.stretch_years} years. More than that is left out.
            </li>
            <li>
              <b>Fresh only:</b> posted in the last {maxAge} days. A job disappears once it's older than that (or when the
              company takes it down). Jobs you marked applied stay in <i>My applications</i>.
            </li>
            <li>Postings only open to citizens (e.g. “UAE nationals only”, “security clearance”) are dropped.</li>
          </ul>
        </Section>

        <Section n={4} title="The Fintech section">
          <p>
            Press <b>Fintech</b> at the top to see only jobs at payments, banking, lending, investing, crypto and insurance
            companies — the same filters, countries and tracking, just fintech.
          </p>
          <p>A job counts as fintech when:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              the company is one of the <b>{fintechFollowed || 'many'} fintechs the bot follows</b> (Razorpay, CRED, Groww,
              Stripe, Adyen, Wise, Monzo, Airwallex, Coinbase…), or
            </li>
            <li>the company describes itself as fintech, a payments company, a neobank and so on, or</li>
            <li>the posting itself is clearly about money: words like payments platform, UPI, KYC, lending, card issuing.</li>
          </ul>
          <p>
            The <b>Companies</b> tab lists every one of them by sector, with how many roles each has for you and a link to its
            careers page.
          </p>
        </Section>

        <Section n={5} title="The fit score (0-100)">
          <p>
            Every job starts at 20. Each of your skills found in the title or description adds points; asking for 1 year or
            less adds 15, asking for 2-3 years adds 8. Jobs under {meta.min_score ?? 35} are not shown.
          </p>
          {meta.skills && (
            <p className="flex flex-wrap gap-1.5">
              {meta.skills.map(([name, points]) => (
                <span key={name} className="tag">
                  {name} +{points}
                </span>
              ))}
            </p>
          )}
          <p>
            <b className="!text-good">Great</b> is 70+, <b className="!text-accent">Good</b> is 50+, <b>Fair</b> is below 50.
            It's keyword matching, so always read the posting.
          </p>
        </Section>

        <Section n={6} title="Visa notes (jobs abroad)">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b className="!text-good">Mentions visa sponsorship or relocation</b> — a good sign.
            </li>
            <li>
              <b className="!text-warn">Says no visa sponsorship / asks for an existing right to work / asks for the local
              language</b> — probably not open to you; check before spending time.
            </li>
            <li>
              <b>No mention of visa sponsorship</b> — most postings. Ask the recruiter.
            </li>
            <li>Singapore: says whether the pay meets the Employment Pass minimum (S$5,600 a month).</li>
          </ul>
        </Section>

        <Section n={7} title="What happens when you press Apply">
          <p>
            The original posting opens in a new tab. <b>Apply on company site</b> takes you to the company's own careers page
            (on Greenhouse, Lever, Ashby, SmartRecruiters, Workable or amazon.jobs), where the application form is.{' '}
            <b>Apply on Workable / Cutshort / MyCareersFuture / Himalayas / Arbeitnow / Remotive / Remote OK</b> takes you to
            that board's page for the job, which has the apply button or a link to the company.
          </p>
          <p>
            Nothing is ever sent for you. When you come back, the card asks “Did you apply?” — press <b>Yes</b> and it moves to
            My applications.
          </p>
        </Section>

        <Section n={8} title="Tracking your applications">
          <p>
            <b>My applications</b> keeps every job you marked applied, even after it disappears from the lists. Set the status
            (Applied → Interview → Offer or Rejected), write notes, and look for the <b>Follow up</b> tag 7 days after
            applying.
          </p>
          <p>
            It's saved in this browser only. Use <b>Export</b> to back it up or to move it to your phone, then <b>Import</b>{' '}
            there.
          </p>
        </Section>

        <Section n={9} title="Why not every job in the world?" wide>
          <p>
            There's no single place that has every job. Most companies post on their own careers page, and the bot can read
            the ones built on the big hiring systems above — that's most tech startups and scale-ups, and it adds new ones every
            month from Hacker News. Big companies with their own custom careers sites, or on Workday, can't be read reliably.
          </p>
          <p>
            LinkedIn, Indeed, Naukri, Bayt and SEEK don't allow bots either. So each country has <b>Search by hand</b> links to
            those sites, already filtered to jobs from the past week (and to your experience level on LinkedIn and Naukri).
            Junior React/Node roles posted in one week are a small number anywhere, so check those links too.
          </p>
        </Section>
      </div>
    </div>
  )
}
