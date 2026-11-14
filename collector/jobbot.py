#!/usr/bin/env python3
"""Job Search collector.

Fetches openings from company career pages and public job boards, keeps the fresh ones that fit
the profile in config.json, scores them, tags fintech jobs, and writes one JSON file per country
plus meta.json:

    python3 collector/jobbot.py                         # config.json next to this file, writes ./data
    python3 collector/jobbot.py --config collector/config.json --data data

GitHub Actions runs it on a schedule and publishes the data folder to the `data` branch,
which the React app in web/ reads. It only reads public job listings; it never applies.
Each run also looks for new company job boards linked from Hacker News "Who is hiring?",
so the list of companies keeps growing. Standard library only (Python 3.9+).
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
# How many requests may run at once per host. Smaller sites get one at a time.
HOST_LIMITS = {"apply.workable.com": 1, "jobs.workable.com": 2, "api.smartrecruiters.com": 2, "himalayas.app": 2,
               "api.mycareersfuture.gov.sg": 2, "www.arbeitnow.com": 1, "cutshort.io": 1, "remotive.com": 1,
               "remoteok.com": 1, "www.amazon.jobs": 2, "hn.algolia.com": 1}
_SLOTS, _SLOTS_LOCK = {}, threading.Lock()

# Company job boards list every open role, so a job missing from a board that loaded fine has closed.
# The other sources show a moving window (newest N, search pages), so missing there means nothing.
FULL_BOARDS = {"greenhouse", "lever", "ashby", "smartrecruiters", "workable"}
SOURCE_LABELS = {"greenhouse": "Company careers", "lever": "Company careers", "ashby": "Company careers",
                 "smartrecruiters": "Company careers", "workable": "Company careers", "amazon": "Company careers",
                 "workable_search": "Workable", "cutshort": "Cutshort", "himalayas": "Himalayas",
                 "mycareersfuture": "MyCareersFuture", "arbeitnow": "Arbeitnow", "remotive": "Remotive", "remoteok": "Remote OK"}
CAREERS_PAGE = {"greenhouse": "https://job-boards.greenhouse.io/{}", "lever": "https://jobs.lever.co/{}",
                "ashby": "https://jobs.ashbyhq.com/{}", "smartrecruiters": "https://jobs.smartrecruiters.com/{}",
                "workable": "https://apply.workable.com/{}/"}


def log(msg):
    print(f"{datetime.now():%H:%M:%S}  {msg}", flush=True)


# ----------------------------------------------------------------------------- helpers

def host_slot(url):
    host = urlparse(url).netloc
    with _SLOTS_LOCK:
        if host not in _SLOTS:
            _SLOTS[host] = threading.BoundedSemaphore(HOST_LIMITS.get(host, 4))
        return _SLOTS[host]


_COOLDOWN = {}  # host -> time before which nothing is sent to it again (it said "too many requests")


def fetch(url, as_json=True, tries=4):
    """GET a URL, retrying temporary failures (server errors, rate limits, timeouts, resets)."""
    host = urlparse(url).netloc
    for attempt in range(tries):
        wait = 4 * (attempt + 1)
        pause = _COOLDOWN.get(host, 0) - time.time()
        if pause > 0:  # another request to this site was told to slow down: wait with it
            time.sleep(pause)
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
                _COOLDOWN[host] = max(_COOLDOWN.get(host, 0), time.time() + wait)  # the whole site waits, not just this request
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


def amazon_day(text):
    """'November  6, 2026' -> '2026-11-06'."""
    try:
        return datetime.strptime(" ".join((text or "").split()), "%B %d, %Y").date().isoformat()
    except ValueError:
        return ""


def tidy_company(name):
    """Registry-style names from job boards ("DOLPHIN DYNAMICS LABS PTE. LTD.", "hellofresh") read better in title case."""
    name = (name or "").strip()
    return name.title() if name.isupper() or name.islower() else name


LEGAL_SUFFIX = re.compile(r"\s*\([^)]*\)|,?\s+(?:pte\.?|private\s+limited|ltd\.?|limited|inc\.?|llc|gmbh|b\.?v\.?|plc|corp\.?)(?=\s|$|,)", re.I)


def short_company(name):
    """The name without the legal part: "Airwallex (Singapore) Pte. Ltd." -> "Airwallex"."""
    return re.sub(r"\s+", " ", LEGAL_SUFFIX.sub("", name or "")).strip(" ,.") or (name or "")


def company_key(name):
    """One key for the same company however a source writes its name."""
    return re.sub(r"[^a-z0-9]+", "", short_company(name).lower())


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
    """Normalised openings from one feed. wanted(title, location, posted) skips the rest early, so
    detail pages are fetched only for fresh roles that could match."""
    ats, slug = feed["ats"], feed.get("slug", "")
    source = SOURCE_LABELS.get(ats, ats)
    out = []

    def add(job_id, title, location, url, text, company=None, **extra):
        out.append({"id": f"{ats}:{slug}:{job_id}", "company": tidy_company(company) if company else feed["name"],
                    "title": (title or "").strip(), "location": location, "url": url, "text": text, "source": source,
                    "fintech_feed": bool(feed.get("fintech")), "sector": feed.get("sector", ""), **extra})

    if ats == "greenhouse":
        for j in fetch(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs").get("jobs", []):
            where, posted = (j.get("location") or {}).get("name", ""), (j.get("first_published") or "")[:10]
            if wanted(j["title"], where, posted):
                d = fetch(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{j['id']}")
                add(j["id"], j["title"], where, j["absolute_url"], strip_html(d.get("content")),
                    posted=posted or (d.get("first_published") or j.get("updated_at") or "")[:10])
    elif ats == "lever":
        for j in fetch(f"https://api.lever.co/v0/postings/{slug}?mode=json"):
            cat = j.get("categories") or {}
            where = join_places([cat.get("location")] + (cat.get("allLocations") or []))
            posted = utc_day(j["createdAt"] / 1000) if j.get("createdAt") else ""
            if wanted(j["text"], where, posted):
                text = " ".join([j.get("descriptionPlain") or "", j.get("additionalPlain") or ""]
                                + [l.get("text", "") + " " + strip_html(l.get("content")) for l in j.get("lists") or []])
                add(j["id"], j["text"], where, j["hostedUrl"], text, posted=posted)
    elif ats == "ashby":
        for j in fetch(f"https://api.ashbyhq.com/posting-api/job-board/{slug}").get("jobs", []):
            where = join_places([j.get("location")] + [s.get("location") for s in j.get("secondaryLocations") or []])
            posted = (j.get("publishedAt") or "")[:10]
            if wanted(j["title"], where, posted):
                add(j["id"], j["title"], where, j["jobUrl"], j.get("descriptionPlain") or "", posted=posted)
    elif ats == "smartrecruiters":
        offset = 0
        while offset < 1000:
            data = fetch(f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100&offset={offset}")
            for j in data.get("content", []):
                where, posted = (j.get("location") or {}).get("fullLocation") or "", (j.get("releasedDate") or "")[:10]
                if wanted(j["name"], where, posted):
                    d = fetch(j["ref"])
                    sections = ((d.get("jobAd") or {}).get("sections") or {}).values()
                    add(j["id"], j["name"], where, d.get("postingUrl") or j["ref"],
                        strip_html(" ".join((s or {}).get("text") or "" for s in sections)), posted=posted)
            offset += len(data.get("content", []))
            if not data.get("content") or offset >= data.get("totalFound", 0):
                break
    elif ats == "workable":  # one company's Workable board; listings carry department and level, not a description
        for j in fetch(f"https://apply.workable.com/api/v1/widget/accounts/{slug}").get("jobs", []):
            where = join_places([", ".join(x for x in (l.get("city"), l.get("country")) if x)
                                 for l in j.get("locations") or []]) \
                or ", ".join(x for x in (j.get("city"), j.get("country")) if x)
            if wanted(j["title"], where, j.get("published_on") or ""):
                add(j["shortcode"], j["title"], where, j["url"],
                    " ".join(str(j.get(k) or "") for k in ("department", "function", "experience", "industry")),
                    posted=j.get("published_on") or "")
    elif ats == "workable_search":  # every company that hires through Workable; slug is a search term
        token, where_q = "", feed.get("location", "")
        for _ in range(feed.get("pages", 2)):
            url = (f"https://jobs.workable.com/api/v1/jobs?query={quote(slug)}&location={quote(where_q)}"
                   f"&day_range={feed.get('day_range', 7)}" + (f"&pageToken={quote(token)}" if token else ""))
            data = fetch(url)
            for j in data.get("jobs", []):
                loc = j.get("location") or {}
                where = join_places([", ".join(x for x in (loc.get("city"), loc.get("countryName")) if x)]
                                    + ["Remote" if j.get("workplace") == "remote" else ""]) or join_places(j.get("locations") or [])
                posted = (j.get("created") or "")[:10]
                if wanted(j["title"], where, posted):
                    company = j.get("company") or {}
                    add(j["id"], j["title"], where, j["url"],
                        strip_html((j.get("description") or "") + " " + (j.get("requirementsSection") or "")),
                        company.get("title"), id=f"workable:{j['id']}", posted=posted,
                        company_desc=strip_html(company.get("description")), company_site=company.get("website") or "")
            token = data.get("nextPageToken")
            if not token:
                break
    elif ats == "amazon":  # Amazon's own job search; slug is a search term, feed["country"] an ISO-3 code
        data = fetch(f"https://www.amazon.jobs/en/search.json?base_query={quote(slug)}"
                     f"&normalized_country_code%5B%5D={feed['country']}&result_limit=100&sort=recent")
        for j in data.get("jobs", []):
            where, posted = j.get("normalized_location") or j.get("location") or "", amazon_day(j.get("posted_date"))
            if wanted(j["title"], where, posted):
                job_id = j.get("id_icims") or j.get("id")
                add(job_id, j["title"], where, "https://www.amazon.jobs" + j.get("job_path", ""),
                    strip_html(" ".join(j.get(k) or "" for k in ("description", "basic_qualifications", "preferred_qualifications"))),
                    "Amazon", id=f"amazon:{job_id}", posted=posted)
    elif ats == "cutshort":  # Indian job board; slug is a listing page, newest jobs first
        page = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
                         fetch(f"https://cutshort.io/jobs/{slug}", as_json=False), re.S)
        if not page:
            raise ValueError("listing page has no job data; its layout may have changed")
        data = json.loads(page.group(1))["props"]["pageProps"]["dehydratedState"]["queries"][0]
        for j in (data["state"]["data"]["data"].get("pageData") or {}).get("jobs") or []:
            remote = ["Remote (India)"] if j.get("remoteType") in ("remote_only", "remote_okay") else []
            where = join_places((j.get("locations") or []) + remote)
            posted = ((j.get("jobFactSummary") or {}).get("postedDate") or "")[:10]
            if not wanted(j["headline"], where, posted):
                continue
            company = (j.get("companyDetails") or {}).get("name")
            agency = (j.get("companyId") or {}).get("name")
            pay = j.get("salaryRange") or {}
            add(j["_id"], j["headline"], where, j["publicUrl"],
                strip_html(j.get("sanitizedComment")) + " " + ", ".join(j.get("allSkills") or []),
                f"{company} (via {agency})" if j.get("hiringForClient") and company and agency else company or agency,
                id=f"cutshort:{j['_id']}",  # the same job appears on several listing pages
                years=(j.get("expRange") or {}).get("min"), salary=j.get("salaryRangeText") or "", posted=posted,
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
                posted = utc_day(j["pubDate"]) if j.get("pubDate") else ""
                if (levels_wanted and levels and not any(l in levels_wanted for l in levels)) or not wanted(j["title"], where, posted):
                    continue
                pay = (f"{j.get('currency')} {j.get('minSalary') or 0:,} - {j['maxSalary']:,} / "
                       f"{j.get('salaryPeriod') or 'year'}" if j.get("maxSalary") else "")
                add(j["guid"], j["title"], where, j["applicationLink"], strip_html(j.get("description")),
                    j.get("companyName"), id="himalayas:" + j["guid"].split("/companies/")[-1], salary=pay, posted=posted)
            if len(data.get("jobs", [])) < 20:
                break
    elif ats == "mycareersfuture":  # Singapore's national job board; slug is a search term
        for page in range(3):
            data = fetch(f"https://api.mycareersfuture.gov.sg/v2/jobs?search={quote(slug)}&limit=100&page={page}")
            for j in data.get("results", []):
                pay, meta = j.get("salary") or {}, j.get("metadata") or {}
                posted = meta.get("newPostingDate") or (meta.get("createdAt") or "")[:10]
                if not wanted(j["title"], "Singapore", posted):
                    continue
                monthly = ((pay.get("type") or {}).get("salaryType") or "").lower().startswith("month")
                low, high = pay.get("minimum"), pay.get("maximum")
                add(j["uuid"], j["title"], "Singapore",
                    meta.get("jobDetailsUrl") or f"https://www.mycareersfuture.gov.sg/job/{j['uuid']}",
                    strip_html(j.get("description")) + " " + ", ".join(s.get("skill", "") for s in j.get("skills") or []),
                    (j.get("postedCompany") or {}).get("name"), id=f"mcf:{j['uuid']}",
                    years=j.get("minimumYearsExperience"),
                    salary=f"SGD {low:,} - {high:,} / month" if low and high and monthly else "",
                    pay={"currency": "SGD", "period": "month", "min": low, "max": high} if low and high and monthly else None,
                    posted=posted)
            if len(data.get("results", [])) < 100:
                break
    elif ats == "arbeitnow":  # German / EU job board; visa_sponsorship keeps roles that offer it
        visa = feed.get("visa_sponsorship", True)
        url = "https://www.arbeitnow.com/api/job-board-api" + ("?visa_sponsorship=true" if visa else "")
        for _ in range(feed.get("pages", 3)):
            data = fetch(url)
            for j in data.get("data", []):
                where = join_places([j.get("location"), "Remote" if j.get("remote") else ""])
                posted = utc_day(j["created_at"]) if j.get("created_at") else ""
                if wanted(j["title"], where, posted):
                    add(j["slug"], j["title"], where, j["url"],
                        strip_html(j.get("description")) + " " + ", ".join(j.get("tags") or []),
                        j.get("company_name"), id=f"arbeitnow:{j['slug']}", visa_listed=visa, posted=posted)
            url = (data.get("links") or {}).get("next")
            if not url:
                break
    elif ats == "remotive":  # remote jobs; one request per run, as Remotive asks
        for j in fetch(f"https://remotive.com/api/remote-jobs?category={quote(slug or 'software-dev')}").get("jobs", []):
            where = "Remote - " + (j.get("candidate_required_location") or "Worldwide")
            posted = (j.get("publication_date") or "")[:10]
            if wanted(j["title"], where, posted):
                add(j["id"], j["title"], where, j["url"], strip_html(j.get("description")), j.get("company_name"),
                    id=f"remotive:{j['id']}", salary=j.get("salary") or "", posted=posted)
    elif ats == "remoteok":  # remote jobs; Remote OK asks that each job links back to its page there
        for j in fetch("https://remoteok.com/api"):
            if not isinstance(j, dict) or not j.get("position"):
                continue  # the first item is their terms notice
            where, posted = "Remote - " + (j.get("location") or "Worldwide"), (j.get("date") or "")[:10]
            if wanted(j["position"], where, posted):
                high = j.get("salary_max") or 0
                add(j["id"], j["position"], where, j.get("url") or f"https://remoteok.com/remote-jobs/{j.get('slug')}",
                    strip_html(j.get("description")) + " " + ", ".join(j.get("tags") or []), j.get("company"),
                    id=f"remoteok:{j['id']}", salary=f"USD {j.get('salary_min') or 0:,} - {high:,} / year" if high else "",
                    posted=posted)
    else:
        raise ValueError(f"unknown source type {ats!r}")
    return out


def board_locations(ats, slug):
    """Locations of every job on a company board (cheap list calls), to check a newly found board."""
    if ats == "greenhouse":
        return [(j.get("location") or {}).get("name", "") for j in fetch(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs").get("jobs", [])]
    if ats == "lever":
        return [join_places([(j.get("categories") or {}).get("location")] + ((j.get("categories") or {}).get("allLocations") or []))
                for j in fetch(f"https://api.lever.co/v0/postings/{slug}?mode=json")]
    if ats == "ashby":
        return [join_places([j.get("location")] + [s.get("location") for s in j.get("secondaryLocations") or []])
                for j in fetch(f"https://api.ashbyhq.com/posting-api/job-board/{slug}").get("jobs", [])]
    if ats == "workable":
        return [", ".join(x for x in (j.get("city"), j.get("country")) if x)
                for j in fetch(f"https://apply.workable.com/api/v1/widget/accounts/{slug}").get("jobs", [])]
    return []


HN_BOARD_LINKS = (("greenhouse", r"(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io/([a-zA-Z0-9_-]+)"),
                  ("lever", r"jobs\.lever\.co/([a-zA-Z0-9_-]+)"), ("ashby", r"jobs\.ashbyhq\.com/([a-zA-Z0-9._-]+)"),
                  ("workable", r"apply\.workable\.com/([a-zA-Z0-9_-]+)"))


def discover_boards(countries, known, limit):
    """Company job boards linked from the latest Hacker News "Who is hiring?" thread that we don't know yet.
    Returns (boards with jobs in our countries, every board checked)."""
    hits = fetch("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5").get("hits", [])
    thread = next((h for h in hits if "who is hiring" in (h.get("title") or "").lower()), None)
    if not thread:
        return [], []
    fresh = {}  # key -> (ats, slug, company name from the post)
    for post in fetch(f"https://hn.algolia.com/api/v1/items/{thread['objectID']}").get("children") or []:
        text = html.unescape(post.get("text") or "")
        # Posts start "Company (YC S21) | Role | Place | ..."; the first part is the company's name.
        head = re.sub(r"\s*\((?:yc|w|s)\s?[^)]*\)|https?://\S+", "", strip_html(text.split("|", 1)[0]), flags=re.I).strip(" -–:")
        for ats, pattern in HN_BOARD_LINKS:
            for slug in re.findall(pattern, text):
                key = f"{ats}:{slug.lower()}"
                if slug.lower() not in ("embed", "api", "j", "jobs") and key not in known and key not in fresh:
                    fresh[key] = (ats, slug, head if "|" in text and 1 < len(head) <= 40 else "")
    added, checked = [], []
    for key, (ats, slug, head) in list(fresh.items())[:limit]:
        checked.append(key)
        try:
            places = board_locations(ats, slug)
        except Exception:
            continue
        if any(in_country(p, c) for p in places for c in countries):
            name = head or slug.replace("-", " ").replace("_", " ").title()
            added.append({"ats": ats, "slug": slug, "name": name, "discovered": "hn"})
    return added, checked


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
# What a fintech company or posting says about itself.
FINTECH = re.compile(
    r"\bfin-?tech\b|\bneo-?banks?\b|\bdigital bank|\bpayments? (?:platform|infrastructure|gateway|processing|company|provider"
    r"|solutions?|app|network|startup|tech|technology)\b|\bpayment gateway|\bcard issuing|\bbnpl\b|buy now,? pay later"
    r"|\bwealth ?tech\b|\bwealth management\b|\binsurtech\b|\bregtech\b|\binsurance (?:platform|company|products?|carrier)\b"
    r"|\bcrypto(?:currenc(?:y|ies))?\b|\bblockchains?\b|\bbitcoin\b|\bstablecoins?\b|\bdefi\b|\bweb3\b|\bremittances?\b"
    r"|\bcross-border payments?|\binternational payments?|\bmoney transfers?\b"
    r"|\blending (?:platform|company|products?|business)\b|\bstock (?:trading|broking)|\btrading platform\b|\bupi\b"
    r"|\bkyc\b|\banti-money laundering\b|\bbanking (?:platform|software|app|services|infrastructure|products?)\b"
    r"|\bfinancial (?:services|technology|institutions?|products?)\b", re.I)
INDUSTRY_LIST = re.compile(
    r"\b(?:ed|health|food|prop|ad|mar|agri|legal|clean|hr|med|bio|travel|auto|gov|climate)[- ]?tech\b|\be-?commerce\b"
    r"|\bindustries\b|\bverticals?\b|\bsectors?\b|\bbfsi\b|\bhealthcare\b|\bretail\b|\bgaming\b|\blogistics\b"
    r"|\btelecom\w*|\bmedia\b", re.I)
SECTOR_WORDS = (("Crypto", ("crypto", "blockchain", "bitcoin", "stablecoin", "defi", "web3")),
                ("Neobank", ("neobank", "neo-bank", "digital bank")), ("BNPL", ("bnpl", "buy now")), ("Lending", ("lending",)),
                ("Insurtech", ("insurtech", "insurance")), ("Investing", ("wealth", "stock trading", "stock broking", "trading platform")),
                ("Remittance", ("remittance", "money transfer", "cross-border payment", "international payment")),
                ("Payments", ("payment", "card issuing", "upi")))
RULES = {}  # compiled per-country rules


def required_years(text):
    found = [int(next(g for g in m.groups() if g)) for m in YEARS.finditer(text)]
    return min(found) if found else None


def money_signals(text):
    """Fintech words in a text, leaving out ones that only appear in a list of industries
    ("brands across E-Commerce, Edtech, Fintech, Foodtech" is about the clients, not the company)."""
    text = text or ""
    return {m.group(0).lower() for m in FINTECH.finditer(text)
            if len(INDUSTRY_LIST.findall(text[max(0, m.start() - 80):m.end() + 80])) < 2}


def is_fintech(job):
    """A fintech company's job, a company that describes itself as fintech, or a posting that clearly is one."""
    if job.get("fintech_feed"):
        return True
    if money_signals(job.get("company_desc")):
        return True
    signals = money_signals((job.get("title") or "") + " " + (job.get("text") or ""))
    return len(signals) >= 2 or any(s.replace("-", "") == "fintech" for s in signals)


def guess_sector(job):
    """Sector of a fintech job from a company we don't follow, from the words its posting uses."""
    words = " ".join(money_signals(job.get("company_desc")) | money_signals(f"{job.get('title') or ''} {job.get('text') or ''}"))
    return next((sector for sector, keys in SECTOR_WORDS if any(k in words for k in keys)), "Fintech")


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
    # Fresh jobs only: anything posted more than max_posting_age_days ago is left out, whatever the source.
    # (Jobs with no posting date expire that long after they were first found; see run().)
    if age_days(job.get("posted")) > cfg["max_posting_age_days"]:
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
    fintech = is_fintech(job)
    return {"id": job["id"], "company": job["company"], "title": job["title"], "location": job["location"],
            "url": job["url"], "source": job["source"], "posted": job.get("posted") or "",
            "salary": job.get("salary") or "", "target": is_target(job["company"], cfg),
            "fintech": fintech, "sector": (job.get("sector") or guess_sector(job)) if fintech else "", **result}


# ----------------------------------------------------------------------------- run

def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


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
    max_age = cfg["max_posting_age_days"]
    state = {c["key"]: {j["id"]: j for j in load_json(os.path.join(data_dir, "jobs", f"{c['key']}.json"), {}).get("jobs", [])}
             for c in countries}

    # Company boards found on Hacker News in earlier runs, plus any new ones in this month's thread.
    discovered = load_json(os.path.join(data_dir, "discovered.json"), {"boards": [], "checked": []})
    known = ({f"{f['ats']}:{f.get('slug', '').lower()}" for f in cfg["feeds"]}
             | {f"{b['ats']}:{b['slug'].lower()}" for b in discovered["boards"]} | set(discovered["checked"]))
    if cfg.get("discover_boards", True):
        try:
            added, checked = discover_boards(countries, known, cfg.get("discover_per_run", 30))
            discovered["boards"] += added
            discovered["checked"] = sorted(set(discovered["checked"]) | set(checked))
            if checked:
                log(f"Hacker News: checked {len(checked)} new company boards, added {len(added)}")
        except Exception as e:
            log(f"board discovery skipped ({type(e).__name__}: {str(e)[:100]})")
    feeds = cfg["feeds"] + discovered["boards"]

    def wanted(title, location, posted=""):
        return title_fits(title, cfg) and any(in_country(location, c) for c in countries) and age_days(posted) <= max_age

    def safe(feed):
        try:
            return feed, jobs_from(feed, wanted), ""
        except Exception as e:
            return feed, [], f"{type(e).__name__}: {str(e)[:150]}"

    started = time.time()
    with ThreadPoolExecutor(cfg.get("workers", 12)) as pool:
        results = list(pool.map(safe, feeds))
    failed = [(f["name"], err) for f, _, err in results if err]
    for name, err in failed:
        log(f"source failed: {name} ({err})")
    if len(failed) > 0.8 * len(results):
        sys.exit(f"{len(failed)} of {len(results)} sources failed - offline? Keeping the previous data.")

    openings = [j for _, jobs, _ in results for j in jobs]  # company boards first, so they win duplicates
    # A job board's posting at a fintech we follow ("Airwallex (Singapore) Pte. Ltd." on MyCareersFuture) is fintech too.
    fintech_names = {company_key(f["name"]): f.get("sector", "Fintech") for f in feeds if f.get("fintech")}
    for j in openings:
        if not j["fintech_feed"] and company_key(j["company"]) in fintech_names:
            j["fintech_feed"], j["sector"] = True, fintech_names[company_key(j["company"])]
    listed = {j["id"]: j for j in openings}
    checked = {f"{f['ats']}:{f.get('slug', '')}" for f, _, err in results if not err and f["ats"] in FULL_BOARDS}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    today = date.today().isoformat()

    def too_old(job):  # posted too long ago, or (no posting date) first found too long ago
        return age_days(job.get("posted") or job.get("found")) > max_age

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
        for job_id, job in list(jobs.items()):  # forget old, closed, and (after a settings change) unfitting jobs
            if (too_old(job) or not title_fits(job["title"], cfg) or not in_country(job["location"], c)
                    or (job.get("closed") and age_days(job.get("closed_on")) > cfg.get("keep_closed_days", 7))):
                del jobs[job_id]
        ordered = sorted(jobs.values(), key=lambda j: (j.get("closed", False), -j["fit"], j.get("posted") or ""))
        write_json(os.path.join(data_dir, "jobs", f"{c['key']}.json"),
                   {"key": c["key"], "name": c["name"], "updated": now, "jobs": ordered})
        open_jobs = [j for j in jobs.values() if not j.get("closed")]
        fin = [j for j in open_jobs if j.get("fintech")]

        def counts(js):  # main list, stretch, new today (main list), same as the app's badges
            return (sum(not j["stretch"] for j in js), sum(j["stretch"] for j in js),
                    sum(not j["stretch"] and hours_since(j.get("found")) < 24 for j in js))
        (count, stretch, fresh), (f_count, f_stretch, f_fresh) = counts(open_jobs), counts(fin)
        summary.append({"key": c["key"], "name": c["name"], "flag": c.get("flag", ""), "group": c.get("group", ""),
                        "visa": c.get("visa", True), "count": count, "stretch": stretch, "new": fresh,
                        "fintech": f_count, "fintech_stretch": f_stretch, "fintech_new": f_fresh, "boards": c.get("boards", [])})
        log(f"{c['name']:<26} {count:>4} jobs, {stretch:>3} stretch, {new:>3} new, {f_count:>3} fintech")

    # Fintech directory: every fintech company we follow, with how many matching jobs it has right now.
    by_company = {}
    for c in countries:
        for j in state[c["key"]].values():
            if j.get("fintech") and not j.get("closed"):
                rec = by_company.setdefault(company_key(j["company"]), {"name": short_company(j["company"]), "open": set(),
                                                                         "stretch": set(), "countries": set(),
                                                                         "sector": j.get("sector", "")})
                rec["stretch" if j["stretch"] else "open"].add(j["id"])
                rec["countries"].add(c["key"])
                parts = j["id"].split(":")  # a company board's job id is "<ats>:<slug>:<id>" (searches use "<source>:<id>")
                if len(parts) >= 3 and parts[0] in CAREERS_PAGE and not rec.get("url"):
                    rec["url"] = CAREERS_PAGE[parts[0]].format(parts[1])
    sites = {j["company"]: j.get("company_site") or "" for j in openings if j.get("company_site")}
    directory = []
    for f in feeds:
        if f.get("fintech") and f.get("ats") in CAREERS_PAGE and f["name"] not in {d["name"] for d in directory}:
            rec = by_company.pop(company_key(f["name"]), {"open": set(), "stretch": set(), "countries": set()})
            directory.append({"name": f["name"], "sector": f.get("sector", "Fintech"), "url": CAREERS_PAGE[f["ats"]].format(f["slug"]),
                              "open": len(rec["open"]), "stretch": len(rec["stretch"]), "countries": sorted(rec["countries"]),
                              "followed": True})
    sites = {company_key(name): url for name, url in sites.items()}
    for key, rec in by_company.items():  # other companies that posted a fintech role
        directory.append({"name": rec["name"], "sector": rec["sector"] or "Fintech", "url": rec.get("url") or sites.get(key, ""),
                          "open": len(rec["open"]), "stretch": len(rec["stretch"]), "countries": sorted(rec["countries"]),
                          "followed": False})
    directory.sort(key=lambda d: (-d["open"], -d["stretch"], d["name"].lower()))

    write_json(os.path.join(data_dir, "discovered.json"), discovered)
    company_boards = sum(f["ats"] in FULL_BOARDS for f in feeds)
    write_json(os.path.join(data_dir, "meta.json"), {
        "updated": now, "schedule": cfg.get("schedule", ""), "scanned": len(openings),
        "experience_years": cfg.get("experience_years"), "max_required_years": cfg["max_required_years"],
        "stretch_years": cfg["stretch_years"], "min_score": cfg["min_score"], "max_posting_age_days": max_age,
        "keep_closed_days": cfg.get("keep_closed_days", 7), "skills": [[s["name"], s["points"]] for s in cfg["skills"]],
        "company_boards": company_boards, "discovered_boards": len(discovered["boards"]),
        "countries": summary, "fintech_companies": directory,
        "sources": [{"name": f["name"], "type": SOURCE_LABELS.get(f["ats"], f["ats"]), "ok": not err,
                     "matches": len(jobs), "error": err} for f, jobs, err in results]})
    log(f"done in {time.time() - started:.0f}s: {len(openings)} fresh candidate openings from "
        f"{len(results) - len(failed)}/{len(results)} sources ({company_boards} company boards)")


def main():
    parser = argparse.ArgumentParser(description="Collect matching jobs into JSON files.")
    parser.add_argument("--config", default=os.path.join(HERE, "config.json"), help="search settings (JSON)")
    parser.add_argument("--data", default=os.path.join(os.getcwd(), "data"), help="output folder")
    args = parser.parse_args()
    run(args.config, args.data)


if __name__ == "__main__":
    main()
