# E-Invoicing Daily Intelligence Agent

An automated agent that monitors official government e-invoicing portals across multiple countries and delivers a structured daily email briefing — built entirely on **Google Apps Script + Gemini API** at zero cost.

---

## What It Does

- Runs automatically **Monday to Friday at 11 AM** (your timezone)
- Researches official government/tax authority websites for each country in your list
- Categorises updates as **Critical**, **Important**, or **Good to Know**
- Sends a formatted HTML email with update summaries, effective dates, published dates, and direct source links
- On **Monday**, covers Friday + Saturday + Sunday updates so nothing is missed
- Sends a **Week in Review** digest every Friday at 4 PM
- Shows an **E-Invoicing Spotlight** (interesting global facts) on days with no updates
- Deduplicates — same update is never reported twice within 7 days
- Caches daily results — manual re-runs send the identical email, not a fresh fetch

---

## What Gets Monitored

| Category | Examples |
|---|---|
| Mandate & Compliance | Taxpayer thresholds, phase rollouts, B2B/B2C/B2G changes, penalties |
| Technical Formats | Schema versions (XSD/JSON/UBL/CII), field changes, code lists, QR codes |
| Portals & Infrastructure | Portal UI changes, new modules, IRN/clearance portal updates |
| APIs & Integration | New API versions, deprecated endpoints, auth changes, sandbox updates |
| PEPPOL | New BIS versions, access point changes, country onboarding |
| Accreditation | ASP/GSP/ISP rules, new certified providers |
| Reporting | New obligations, formats, reconciliation rule changes |
| New Invoice Types | Self-billing, credit notes, simplified, batch invoice changes |

---

## Email Output

### Daily Brief
- Header with date window and country count
- Summary badges: CRITICAL / IMPORTANT / GOOD TO KNOW counts
- One table per category with: Country, Authority, Update, Effective Date, Published On, Source link
- "No updates today" list for countries with nothing to report
- "Sources unreachable" warning for manual follow-up
- E-Invoicing Spotlight section on zero-update days

### Weekly Digest (Fridays)
- Full week's updates grouped by country
- Sorted by priority: Critical countries first, then Important, then Good to Know
- Each country's updates in one consolidated row block

---

## Tech Stack

| Component | Tool | Cost |
|---|---|---|
| Scheduler | Google Apps Script time-based trigger | Free |
| AI Research | Gemini 2.5 Flash API (Google AI Studio) | Free tier |
| Email delivery | GmailApp (Apps Script built-in) | Free |
| State storage | Apps Script Properties Service | Free |
| Hosting | Google's infrastructure | Free |

**Total running cost: $0**

---

## Countries Included (default)

India, Saudi Arabia, UAE, Malaysia, France, Germany, Poland, Italy, Spain, Romania, Greece, Singapore, Australia, Mexico, Brazil, Nigeria

You can add or remove countries by editing the `COUNTRIES` array in `Code.gs`.

---

## Quick Start

See [SETUP.md](docs/SETUP.md) for full step-by-step instructions.

**Estimated setup time: 15–20 minutes**

---

## File Structure

```
einvoice-agent/
├── Code.gs              ← Paste this into Google Apps Script
├── README.md            ← This file
└── docs/
    ├── SETUP.md         ← Step-by-step setup guide
    ├── FUNCTIONS.md     ← Every function explained
    └── TROUBLESHOOTING.md ← Common errors and fixes
```

---

## Limitations

- Gemini free tier: 1,500 requests/day — comfortably sufficient for this agent
- Apps Script max runtime: 6 minutes/run — current script runs in ~2–3 minutes
- Gmail send limit via Apps Script: 100 emails/day
- Because Gemini uses live web search, results are non-deterministic across separate days — the cache ensures consistency within the same day

---

## Contributing / Customising

- To add countries: edit the `COUNTRIES` array in `Code.gs`
- To add email recipients: edit `TO_EMAIL` (comma-separated string)
- To change the research window: edit `getDateWindow()`
- To adjust categorisation rules: edit the `CATEGORY RULES` section in the prompt inside `callGemini()`

---

## License

MIT — free to use, modify, and distribute.
