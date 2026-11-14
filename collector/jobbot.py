#!/usr/bin/env python3
"""Job Search collector.

Fetches openings from company career pages and public job boards, keeps the ones that fit
the profile in config.json, scores them, and writes one JSON file per country plus meta.json:

    python3 collector/jobbot.py                         # config.json next to this file, writes ./data
    python3 collector/jobbot.py --config collector/config.json --data data

GitHub Actions runs it on a schedule and publishes the data folder to the `data` branch,
which the React app in web/ reads. It only reads public job listings; it never applies.
Standard library only (Python 3.9+).
"""
import argparse
import html
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from urllib.parse import quote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
USER_AGENT = "Mozilla/5.0 (compatible; job-search-collector)"
# How many requests may run at once per host. Small boards and job sites get one at a time.
HOST_LIMITS = {"apply.workable.com": 1, "api.smartrecruiters.com": 2, "himalayas.app": 2, "api.mycareersfuture.gov.sg": 2,
               "www.arbeitnow.com": 1, "cutshort.io": 1, "remotive.com": 1, "remoteok.com": 1}
_SLOTS, _SLOTS_LOCK = {}, threading.Lock()

# Company job boards list every open role, so a job missing from a board that loaded fine has closed.
# The other sources show a moving window (newest N, search pages), so missing there means nothing.
FULL_BOARDS = {"greenhouse", "lever", "ashby", "smartrecruiters", "workable"}
SOURCE_LABELS = {"greenhouse": "Company careers", "lever": "Company careers", "ashby": "Company careers",
                 "smartrecruiters": "Company careers", "workable": "Company careers", "cutshort": "Cutshort",
                 "himalayas": "Himalayas", "mycareersfuture": "MyCareersFuture", "arbeitnow": "Arbeitnow",
                 "remotive": "Remotive", "remoteok": "Remote OK"}


def log(msg):
    print(f"{datetime.now():%H:%M:%S}  {msg}", flush=True)


# ----------------------------------------------------------------------------- helpers

def host_slot(url):
    host = urlparse(url).netloc
    with _SLOTS_LOCK:
        if host not in _SLOTS:
            _SLOTS[host] = threading.BoundedSemaphore(HOST_LIMITS.get(host, 4))
        return _SLOTS[host]


def fetch(url, as_json=True, tries=4):
    """GET a URL, retrying temporary failures (server errors, rate limits, timeouts, resets)."""
    for attempt in range(tries):
        wait = 4 * (attempt + 1)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with host_slot(url), urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", "replace")
            return json.loads(body) if as_json else body
        except urllib.error.HTTPError as e:
            if (e.code < 500 and e.code != 429) or attempt == tries - 1:
                raise
            if e.code == 429:  # rate limited: wait as long as the site asks, within reason
                asked = e.headers.get("Retry-After", "")
                wait = min(int(asked) if asked.isdigit() else 15 * (attempt + 1), 60)
        except (OSError, ValueError):  # timeouts, connection resets, DNS, a truncated body
            if attempt == tries - 1:
                raise
        time.sleep(wait)


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(s or ""))).strip()


def has_word(word, text):
    """True if word appears in text with no letter directly before or after it
    ("sde" is in "sde2", "uk" is not in "ukraine", "java" is not in "javascript")."""
    return re.search(r"(?<![a-z])" + re.escape(word.lower()) + r"(?![a-z])", text.lower()) is not None


def utc_day(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).date().isoformat()


def age_days(day):
    """Days since a YYYY-MM-DD date; 0 when unknown, so undated jobs are never treated as old."""
    try:
        return (date.today() - date.fromisoformat((day or "")[:10])).days
    except ValueError:
        return 0


def hours_since(iso):
    try:
        return (datetime.now(timezone.utc) - datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() / 3600
    except (TypeError, ValueError):
        return float("inf")


def tidy_company(name):
    """Registry-style names ("DOLPHIN DYNAMICS LABS PTE. LTD.", "hellofresh") read better in title case."""
    name = (name or "").strip()
    return name.title() if name.isupper() or name.islower() else name


def title_key(title, company):
    """The same job from two sources gives the same key."""
    return re.sub(r"[^a-z0-9]+", " ", f"{title}|{company}".lower()).strip()


def title_fits(title, cfg):
    t = title.lower()
    return any(has_word(k, t) for k in cfg["title_include"]) and not any(has_word(k, t) for k in cfg["title_exclude"])


def in_country(location, country):
    loc = (location or "").lower()
    return (any(has_word(k, loc) for k in country["locations"])
            and not any(has_word(k, loc) for k in country.get("exclude", []))
            and all(has_word(k, loc) for k in country.get("require", [])))


def join_places(places):
    return " / ".join(dict.fromkeys(p.strip() for p in places if p and p.strip()))


# ----------------------------------------------------------------------------- sources

def jobs_from(feed, wanted):
    """Normalised openings from one feed. wanted(title, location) skips the rest early, so
    detail pages are fetched only for roles that could match."""
    ats, slug = feed["ats"], feed.get("slug", "")
    source = SOURCE_LABELS.get(ats, ats)
    out = []

    def add(job_id, title, location, url, text, company=None, **extra):
        out.append({"id": f"{ats}:{slug}:{job_id}", "company": tidy_company(company or feed["name"]),
                    "title": (title or "").strip(), "location": location, "url": url, "text": text,
                    "source": source, "company_board": ats in FULL_BOARDS, **extra})

    if ats == "greenhouse":
        for j in fetch(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs").get("jobs", []):
            where = (j.get("location") or {}).get("name", "")
            if wanted(j["title"], where):
                d = fetch(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{j['id']}")
                add(j["id"], j["title"], where, j["absolute_url"], strip_html(d.get("content")),
                    posted=(j.get("first_published") or d.get("first_published") or j.get("updated_at") or "")[:10])
    elif ats == "lever":
        for j in fetch(f"https://api.lever.co/v0/postings/{slug}?mode=json"):
            cat = j.get("categories") or {}
            where = join_places([cat.get("location")] + (cat.get("allLocations") or []))
            if wanted(j["text"], where):
                text = " ".join([j.get("descriptionPlain") or "", j.get("additionalPlain") or ""]
                                + [l.get("text", "") + " " + strip_html(l.get("content")) for l in j.get("lists") or []])
                add(j["id"], j["text"], where, j["hostedUrl"], text,
                    posted=utc_day(j["createdAt"] / 1000) if j.get("createdAt") else "")
    elif ats == "ashby":
        for j in fetch(f"https://api.ashbyhq.com/posting-api/job-board/{slug}").get("jobs", []):
            where = join_places([j.get("location")] + [s.get("location") for s in j.get("secondaryLocations") or []])
            if wanted(j["title"], where):
                add(j["id"], j["title"], where, j["jobUrl"], j.get("descriptionPlain") or "",
                    posted=(j.get("publishedAt") or "")[:10])
    elif ats == "smartrecruiters":
        offset = 0
        while offset < 1000:
            data = fetch(f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100&offset={offset}")
            for j in data.get("content", []):
                where = (j.get("location") or {}).get("fullLocation") or ""
                if wanted(j["name"], where):
                    d = fetch(j["ref"])
                    sections = ((d.get("jobAd") or {}).get("sections") or {}).values()
                    add(j["id"], j["name"], where, d.get("postingUrl") or j["ref"],
                        strip_html(" ".join((s or {}).get("text") or "" for s in sections)),
                        posted=(j.get("releasedDate") or "")[:10])
            offset += len(data.get("content", []))
            if not data.get("content") or offset >= data.get("totalFound", 0):
                break
    elif ats == "workable":  # listings carry department and level, not a description
        for j in fetch(f"https://apply.workable.com/api/v1/widget/accounts/{slug}").get("jobs", []):
            where = join_places([", ".join(x for x in (l.get("city"), l.get("country")) if x)
                                 for l in j.get("locations") or []]) \
                or ", ".join(x for x in (j.get("city"), j.get("country")) if x)
            if wanted(j["title"], where):
                add(j["shortcode"], j["title"], where, j["url"],
                    " ".join(str(j.get(k) or "") for k in ("department", "function", "experience", "industry")),
                    posted=j.get("published_on") or "")
    elif ats == "cutshort":  # Indian job board; slug is a listing page, newest jobs first
        page = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
                         fetch(f"https://cutshort.io/jobs/{slug}", as_json=False), re.S)
        if not page:
            raise ValueError("listing page has no job data; its layout may have changed")
        data = json.loads(page.group(1))["props"]["pageProps"]["dehydratedState"]["queries"][0]
        for j in (data["state"]["data"]["data"].get("pageData") or {}).get("jobs") or []:
            remote = ["Remote (India)"] if j.get("remoteType") in ("remote_only", "remote_okay") else []
            where = join_places((j.get("locations") or []) + remote)
            if not wanted(j["headline"], where):
                continue
            company = (j.get("companyDetails") or {}).get("name")
            agency = (j.get("companyId") or {}).get("name")
            pay = j.get("salaryRange") or {}
            add(j["_id"], j["headline"], where, j["publicUrl"],
                strip_html(j.get("sanitizedComment")) + " " + ", ".join(j.get("allSkills") or []),
                f"{company} (via {agency})" if j.get("hiringForClient") and company and agency else company or agency,
                id=f"cutshort:{j['_id']}",  # the same job appears on several listing pages
                years=(j.get("expRange") or {}).get("min"), salary=j.get("salaryRangeText") or "",
                posted=((j.get("jobFactSummary") or {}).get("postedDate") or "")[:10],
                salary_max_lpa=pay["maxVanity"] / 100000 if pay.get("currency") == "INR" and pay.get("maxVanity") else None)
    elif ats == "himalayas":  # remote jobs; slug is a search term, country keeps roles open to people living there
        country = feed.get("country", "")
        levels_wanted = feed.get("seniority", ["Entry-level", "Mid-level"])
        for page in range(1, 6):
            data = fetch(f"https://himalayas.app/jobs/api/search?q={quote(slug)}"
                         + (f"&country={quote(country)}" if country else "") + f"&page={page}&limit=20")
            for j in data.get("jobs", []):
                levels = j.get("seniority") or []
                where = f"Remote - open to {country}" if country else "Remote"
                if (levels_wanted and levels and not any(l in levels_wanted for l in levels)) or not wanted(j["title"], where):
                    continue
                pay = (f"{j.get('currency')} {j.get('minSalary') or 0:,} - {j['maxSalary']:,} / "
                       f"{j.get('salaryPeriod') or 'year'}" if j.get("maxSalary") else "")
                add(j["guid"], j["title"], where, j["applicationLink"], strip_html(j.get("description")),
                    j.get("companyName"), id="himalayas:" + j["guid"].split("/companies/")[-1],
                    salary=pay, posted=utc_day(j["pubDate"]) if j.get("pubDate") else "")
            if len(data.get("jobs", [])) < 20:
                break
    elif ats == "mycareersfuture":  # Singapore's national job board; slug is a search term
        for page in range(3):
            data = fetch(f"https://api.mycareersfuture.gov.sg/v2/jobs?search={quote(slug)}&limit=100&page={page}")
            for j in data.get("results", []):
                if not wanted(j["title"], "Singapore"):
                    continue
                pay, meta = j.get("salary") or {}, j.get("metadata") or {}
                monthly = ((pay.get("type") or {}).get("salaryType") or "").lower().startswith("month")
                low, high = pay.get("minimum"), pay.get("maximum")
                add(j["uuid"], j["title"], "Singapore",
                    meta.get("jobDetailsUrl") or f"https://www.mycareersfuture.gov.sg/job/{j['uuid']}",
                    strip_html(j.get("description")) + " " + ", ".join(s.get("skill", "") for s in j.get("skills") or []),
                    (j.get("postedCompany") or {}).get("name"), id=f"mcf:{j['uuid']}",
                    years=j.get("minimumYearsExperience"),
                    salary=f"SGD {low:,} - {high:,} / month" if low and high and monthly else "",
                    pay={"currency": "SGD", "period": "month", "min": low, "max": high} if low and high and monthly else None,
                    posted=meta.get("newPostingDate") or (meta.get("createdAt") or "")[:10])
            if len(data.get("results", [])) < 100:
                break
    elif ats == "arbeitnow":  # German / EU job board; visa_sponsorship keeps roles that offer it
        visa = feed.get("visa_sponsorship", True)
        url = "https://www.arbeitnow.com/api/job-board-api" + ("?visa_sponsorship=true" if visa else "")
        for _ in range(feed.get("pages", 3)):
            data = fetch(url)
            for j in data.get("data", []):
                where = join_places([j.get("location"), "Remote" if j.get("remote") else ""])
                if wanted(j["title"], where):
                    add(j["slug"], j["title"], where, j["url"],
                        strip_html(j.get("description")) + " " + ", ".join(j.get("tags") or []),
                        j.get("company_name"), id=f"arbeitnow:{j['slug']}", visa_listed=visa,
                        posted=utc_day(j["created_at"]) if j.get("created_at") else "")
            url = (data.get("links") or {}).get("next")
            if not url:
                break
    elif ats == "remotive":  # remote jobs; one request per run, as Remotive asks
        for j in fetch(f"https://remotive.com/api/remote-jobs?category={quote(slug or 'software-dev')}").get("jobs", []):
            where = "Remote - " + (j.get("candidate_required_location") or "Worldwide")
            if wanted(j["title"], where):
                add(j["id"], j["title"], where, j["url"], strip_html(j.get("description")), j.get("company_name"),
                    id=f"remotive:{j['id']}", salary=j.get("salary") or "", posted=(j.get("publication_date") or "")[:10])
    elif ats == "remoteok":  # remote jobs; Remote OK asks that each job links back to its page there
        for j in fetch("https://remoteok.com/api"):
            if not isinstance(j, dict) or not j.get("position"):
                continue  # the first item is their terms notice
            where = "Remote - " + (j.get("location") or "Worldwide")
            if wanted(j["position"], where):
                high = j.get("salary_max") or 0
                add(j["id"], j["position"], where, j.get("url") or f"https://remoteok.com/remote-jobs/{j.get('slug')}",
                    strip_html(j.get("description")) + " " + ", ".join(j.get("tags") or []), j.get("company"),
                    id=f"remoteok:{j['id']}", salary=f"USD {j.get('salary_min') or 0:,} - {high:,} / year" if high else "",
                    posted=(j.get("date") or "")[:10])
    else:
        raise ValueError(f"unknown source type {ats!r}")
    return out


# ----------------------------------------------------------------------------- scoring

YEARS = re.compile(
    r"(\d{1,2})\s*\+?\s*(?:-|–|—|to)\s*\d{1,2}\s*\+?\s*(?:years|yrs)"
    r"|(\d{1,2})\s*\+\s*(?:years|yrs)"
    r"|(?:minimum|at least|min\.?)\s*(?:of\s*)?(\d{1,2})\s*(?:years|yrs)", re.I)

NO_SPONSOR = re.compile(
    r"\bno (?:visa |work permit )?sponsorship|without (?:visa |work permit )?sponsorship"
    r"|\b(?:not|unable to|cannot|can't|can not|do not|don't|does not|doesn't|will not|won't)\b[^.]{0,40}\bsponsor"
    r"|sponsorship (?:is )?not (?:available|offered|provided|possible)", re.I)
SPONSOR = re.compile(
    r"visa sponsorship|sponsor(?:s|ing)? (?:your |the |a )?(?:work )?(?:visa|work permit)|visa support"
    r"|relocation (?:support|package|assistance|bonus|budget|allowance|help)|help(?:ing)? you relocate|relocate you"
    r"|\bwe (?:can |will |do |may )?sponsor|blue card|highly skilled migrant|kennismigrant"
    r"|critical skills (?:employment )?permit|employment pass", re.I)
RIGHT_TO_WORK = re.compile(
    r"(?:right|eligib\w*|authori[sz]\w*|permission|permit(?:ted)?) to (?:live and )?work in"
    r"|(?:valid|existing) work (?:permit|authori[sz]ation|visa)"
    r"|must (?:already )?(?:have|hold|possess) (?:a |the |an )?(?:valid |existing )?"
    r"(?:work permit|right to work|work authori[sz]ation|work visa)", re.I)
RULES = {}  # compiled per-country rules


def required_years(text):
    found = [int(next(g for g in m.groups() if g)) for m in YEARS.finditer(text)]
    return min(found) if found else None


def country_rules(country):
    """Compiled filters for one country: postings only open to its citizens, a required language,
    and common words of the local language (a posting written in it is flagged)."""
    if country["key"] in RULES:
        return RULES[country["key"]]
    citizens = [re.escape(t) for t in country.get("citizens_only", [])]
    nat = re.escape(country.get("nationality", ""))
    if nat:
        citizens += [rf"\b{nat}s? (?:citizens? |nationals? )?only\b", rf"only (?:for |open to )?{nat} (?:citizens?|nationals?)",
                     rf"must be (?:an? )?{nat} (?:citizen|national)"]
    lang = country.get("language") or {}
    speaks = [re.escape(t) for t in lang.get("terms", [])]
    if lang.get("name"):
        name = re.escape(lang["name"])
        speaks += [rf"\b{name} (?:language|speaker|speaking|skills)",
                   rf"(?:fluent|fluency|proficient|proficiency|native|business[- ]level)[^.]{{0,40}}\b{name}\b"]
    words = [re.escape(w) for w in country.get("local_words", [])]
    rules = {"citizens": re.compile("|".join(citizens), re.I) if citizens else None,
             "language": re.compile("|".join(speaks), re.I) if speaks else None,
             "local": re.compile(r"\b(?:" + "|".join(words) + r")\b", re.I) if words else None}
    RULES[country["key"]] = rules
    return rules


def visa_check(job, country):
    """(level, notes) for a job abroad: level is "good" when it offers sponsorship or relocation,
    "warn" when something stands in the way, "" when the posting says nothing either way."""
    if not country.get("visa", True):
        return "", []
    text, rules = job["text"] or "", country_rules(country)
    notes, neg, pos, other_warn = [], False, False, False
    if NO_SPONSOR.search(text):
        notes.append("Says no visa sponsorship")
        neg = True
    elif job.get("visa_listed") or SPONSOR.search(text):
        notes.append("Mentions visa sponsorship or relocation")
        pos = True
    if RIGHT_TO_WORK.search(text):
        notes.append("Asks for an existing right to work")
        other_warn = True
    lang = country.get("language") or {}
    if rules["language"] and rules["language"].search(text):
        notes.append(f"Asks for {lang.get('name', 'the local language')}")
        other_warn = True
    if rules["local"] and len(rules["local"].findall(text)) >= 8:
        notes.append(f"Posting is written in {lang.get('name', 'the local language')}")
        other_warn = True
    floor, pay = country.get("salary_floor"), job.get("pay")
    if floor and pay and pay["currency"] == floor["currency"] and pay["period"] == floor["period"]:
        if pay["max"] < floor["amount"]:
            notes.append(f"Pay is below the {floor['label']} ({floor['currency']} {floor['amount']:,} / {floor['period']})")
            neg = True
        elif pay["min"] >= floor["amount"]:
            notes.append(f"Pay meets the {floor['label']}")
    if not notes:
        notes.append("No mention of visa sponsorship - ask before applying")
    level = "warn" if neg else "good" if pos else "warn" if other_warn else ""
    return level, notes


def evaluate(job, cfg, country):
    """The scored fields for a job in a country, or None if it doesn't belong on the list."""
    if not in_country(job["location"], country) or not title_fits(job["title"], cfg):
        return None
    text = job["text"] or ""
    rules = country_rules(country)
    if rules["citizens"] and rules["citizens"].search(job["title"] + " " + text):  # "... - Emirati Nationals Only"
        return None
    years = job.get("years")
    if years is None:
        years = required_years(text)
    if years is not None and years > cfg["stretch_years"]:
        return None
    lpa = job.get("salary_max_lpa")  # only known when a listing states an INR salary
    if lpa is not None and lpa < cfg.get("min_salary_lpa", 0):
        return None
    # A role still listed on the company's own careers page is open however long ago it was posted;
    # on job boards an old listing is usually stale.
    if not job.get("company_board") and age_days(job.get("posted")) > cfg["max_posting_age_days"]:
        return None
    blob = (job["title"] + " " + text).lower()
    fit, hits = 20, []
    for skill in cfg["skills"]:
        if any(re.search(r"\b" + re.escape(m.lower()), blob) for m in skill["match"]):
            fit += skill["points"]
            hits.append(skill["name"])
    if years is not None:
        fit += 15 if years <= 1 else 8
    fit = min(fit, 100)
    thin = len(text) < 200  # the listing has no description (Workable boards): only the title can be judged
    if fit < cfg["min_score"]:
        if not thin:
            return None
        fit = cfg["min_score"]
    level, notes = visa_check(job, country)
    return {"fit": fit, "years": years, "stretch": years is not None and years > cfg["max_required_years"],
            "why": ", ".join(hits) or ("Title match only - this listing has no description" if thin else ""),
            "visa": notes, "visa_level": level}


def is_target(company, cfg):
    return any(has_word(t, company) for t in cfg.get("target_employers", []))


def public_fields(job, result, cfg):
    return {"id": job["id"], "company": job["company"], "title": job["title"], "location": job["location"],
            "url": job["url"], "source": job["source"], "posted": job.get("posted") or "",
            "salary": job.get("salary") or "", "target": is_target(job["company"], cfg), **result}


# ----------------------------------------------------------------------------- run

def load_previous(data_dir, countries):
    state = {}
    for c in countries:
        try:
            with open(os.path.join(data_dir, "jobs", f"{c['key']}.json")) as f:
                state[c["key"]] = {j["id"]: j for j in json.load(f).get("jobs", [])}
        except (OSError, ValueError):
            state[c["key"]] = {}
    return state


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def run(config_path, data_dir):
    with open(config_path) as f:
        cfg = json.load(f)
    countries = cfg["countries"]
    state = load_previous(data_dir, countries)

    def wanted(title, location):
        return title_fits(title, cfg) and any(in_country(location, c) for c in countries)

    def safe(feed):
        try:
            return feed, jobs_from(feed, wanted), ""
        except Exception as e:
            return feed, [], f"{type(e).__name__}: {str(e)[:150]}"

    started = time.time()
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(safe, cfg["feeds"]))
    failed = [(f["name"], err) for f, _, err in results if err]
    for name, err in failed:
        log(f"source failed: {name} ({err})")
    if len(failed) > 0.8 * len(results):
        sys.exit(f"{len(failed)} of {len(results)} sources failed - offline? Keeping the previous data.")

    openings = [j for _, jobs, _ in results for j in jobs]  # company boards first, so they win duplicates
    listed = {j["id"]: j for j in openings}
    checked = {f"{f['ats']}:{f.get('slug', '')}" for f, _, err in results if not err and f["ats"] in FULL_BOARDS}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    today = date.today().isoformat()
    summary = []
    for c in countries:
        jobs, new = state[c["key"]], 0
        for job_id, job in list(jobs.items()):
            if job_id in listed:  # still open: refresh it, so config changes apply to old matches too
                result = evaluate(listed[job_id], cfg, c)
                if result is None:
                    del jobs[job_id]
                    continue
                job.update(public_fields(listed[job_id], result, cfg))
                job["closed"] = False
                job.pop("closed_on", None)
            elif ":".join(job_id.split(":")[:2]) in checked and not job.get("closed"):
                job["closed"], job["closed_on"] = True, today
        have = {title_key(j["title"], j["company"]) for j in jobs.values()}
        for job in openings:
            if job["id"] in jobs or title_key(job["title"], job["company"]) in have:
                continue
            result = evaluate(job, cfg, c)
            if result is None:
                continue
            jobs[job["id"]] = {**public_fields(job, result, cfg), "found": now, "closed": False}
            have.add(title_key(job["title"], job["company"]))
            new += 1
        for job_id, job in list(jobs.items()):  # forget closed jobs, and job-board listings gone stale
            if job_id in listed:
                continue  # open right now; already re-checked above
            if job.get("closed"):
                if age_days(job.get("closed_on")) > cfg.get("keep_closed_days", 7):
                    del jobs[job_id]
            elif job_id.split(":")[0] in FULL_BOARDS:
                continue  # its company board didn't load this time; keep it until the board answers
            elif (age_days(job.get("posted")) > cfg["max_posting_age_days"]
                    or age_days(job.get("found")) > cfg.get("keep_found_days", 45)):
                del jobs[job_id]
        ordered = sorted(jobs.values(), key=lambda j: (j.get("closed", False), -j["fit"], j.get("posted") or ""))
        write_json(os.path.join(data_dir, "jobs", f"{c['key']}.json"),
                   {"key": c["key"], "name": c["name"], "updated": now, "jobs": ordered})
        open_jobs = [j for j in jobs.values() if not j.get("closed")]
        fresh = [j for j in open_jobs if not j["stretch"] and hours_since(j.get("found")) < 24]  # same as the app's "New" badge
        summary.append({"key": c["key"], "name": c["name"], "flag": c.get("flag", ""), "group": c.get("group", ""),
                        "visa": c.get("visa", True),
                        "count": sum(not j["stretch"] for j in open_jobs), "stretch": sum(j["stretch"] for j in open_jobs),
                        "new": len(fresh), "boards": c.get("boards", [])})
        log(f"{c['name']:<26} {summary[-1]['count']:>4} jobs, {summary[-1]['stretch']:>3} stretch, {new:>3} new")
    write_json(os.path.join(data_dir, "meta.json"), {
        "updated": now, "schedule": cfg.get("schedule", ""), "scanned": len(openings),
        "experience_years": cfg.get("experience_years"), "max_required_years": cfg["max_required_years"],
        "stretch_years": cfg["stretch_years"], "countries": summary,
        "sources": [{"name": f["name"], "type": SOURCE_LABELS.get(f["ats"], f["ats"]), "ok": not err,
                     "matches": len(jobs), "error": err} for f, jobs, err in results]})
    log(f"done in {time.time() - started:.0f}s: {len(openings)} candidate openings from "
        f"{len(results) - len(failed)}/{len(results)} sources")


def main():
    parser = argparse.ArgumentParser(description="Collect matching jobs into JSON files.")
    parser.add_argument("--config", default=os.path.join(HERE, "config.json"), help="search settings (JSON)")
    parser.add_argument("--data", default=os.path.join(os.getcwd(), "data"), help="output folder")
    args = parser.parse_args()
    run(args.config, args.data)


if __name__ == "__main__":
    main()
