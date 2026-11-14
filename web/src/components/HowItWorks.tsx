import type { ReactNode } from 'react'
import type { Meta } from '../types'
import { clock, nextRun, timeAgo } from '../lib/format'

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card p-6">
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
  const companyBoards = meta.sources.filter((s) => s.type === 'Company careers').length

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
          <p>
            <b>{companyBoards} company career pages</b> (Stripe, Razorpay, Airwallex, Adyen, Spotify, Mercari, Careem, Grab,
            Canva and more), read through the systems they publish jobs with: Greenhouse, Lever, Ashby, SmartRecruiters and
            Workable.
          </p>
          <p>
            <b>Job boards:</b> MyCareersFuture (Singapore's government board), Arbeitnow (Germany/EU jobs with visa
            sponsorship), Cutshort (Bangalore), and Himalayas, Remotive and Remote OK (remote jobs open to India).
          </p>
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

        <Section n={4} title="The fit score (0-100)">
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

        <Section n={5} title="Visa notes (jobs abroad)">
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

        <Section n={6} title="What happens when you press Apply">
          <p>
            The original posting opens in a new tab. <b>Apply on company site</b> takes you to the company's own careers page
            (hosted on Greenhouse, Lever, Ashby, SmartRecruiters or Workable), where the application form is.{' '}
            <b>Apply on Cutshort / MyCareersFuture / Himalayas / Arbeitnow / Remotive / Remote OK</b> takes you to that
            board's page for the job, which has the apply button or a link to the company.
          </p>
          <p>
            Nothing is ever sent for you. When you come back, the card asks “Did you apply?” — press <b>Yes</b> and it moves to
            My applications.
          </p>
        </Section>

        <Section n={7} title="Tracking your applications">
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

        <Section n={8} title="Not finding enough?">
          <p>
            LinkedIn, Indeed, Naukri, Bayt and SEEK don't allow bots to read their listings, so they aren't collected. Each
            country has <b>Search by hand</b> links to those sites, already filtered to jobs from the past week (and to your
            experience level on LinkedIn and Naukri).
          </p>
        </Section>
      </div>
    </div>
  )
}
