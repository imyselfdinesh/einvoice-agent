# Functions Reference — E-Invoicing Daily Agent

Every function in `Code.gs` explained — what it does, when it runs, and when to call it manually.

---

## Functions That Run Automatically (via triggers)

### `runDailyBrief()`

**Trigger:** Every weekday (Mon–Fri) at 11 AM  
**What it does:**

1. Checks if today is a weekday — silently exits on Saturday/Sunday
2. Calculates the date window to research:
   - Monday → covers Friday + Saturday + Sunday
   - Tuesday–Friday → covers yesterday only
3. Checks if today's results are already cached (from an earlier run today)
   - If cached → sends the identical email immediately, skips Gemini
   - If not cached → calls Gemini in batches of 5 countries
4. Deduplicates updates from multiple URLs for the same country
5. Filters out updates already reported in the last 7 days (`seenMap`)
6. Saves fresh updates to the weekly store for Friday's digest
7. Builds and sends the HTML email
8. On zero-update days: fetches an E-Invoicing Spotlight instead

**When to run manually:** Any time you want to resend or test. If run twice on the same day, the second run uses cached results and sends the identical email.

---

### `runWeeklyDigest()`

**Trigger:** Every Friday at 4 PM  
**What it does:**

1. Reads the full week's updates from the weekly store (built up by daily runs)
2. Groups updates by country
3. Sorts countries by highest-priority update (Critical first)
4. Within each country, sorts Critical → Important → Good to Know
5. Builds and sends the week-in-review HTML email

**When to run manually:** If you want to preview or resend the weekly digest at any point during the week. It will contain whatever has been collected so far that week.

---

## Core Processing Functions

### `callGemini(countries, windowLabel)`

**What it does:** Sends a research prompt to Gemini 2.5 Flash with web search enabled.
Asks Gemini to search each country's official government portal for e-invoicing updates
published within the date window. Returns a structured JSON object with updates, no-update
countries, and unreachable sources.

**Parameters:**
- `countries` — array of country objects (slice of the `COUNTRIES` config array)
- `windowLabel` — date range string, e.g. `"2026-05-23 to 2026-05-23"`

**Returns:** `{ updates: [...], no_updates: [...], unreachable: [...] }`

**Note:** Each call is a fresh web search. Results are non-deterministic across separate
calls — this is expected Gemini behaviour. The daily cache ensures consistency within one day.

---

### `buildEmail(updates, unreachable, windowLabel, allCountries, spotlight)`

**What it does:** Builds the full HTML email body for the daily brief.
Splits updates into Critical / Important / Good to Know sections.
Adds "No updates today" and "Sources unreachable" footers.
Adds the Spotlight section if `spotlight` array is non-empty.

**Returns:** HTML string

---

### `buildWeeklyEmail(updates, subject)`

**What it does:** Builds the HTML email body for the Friday week-in-review.
Groups by country with rowspan so each country appears only once.
Sorts by priority across the whole table.

**Returns:** HTML string

---

### `deduplicateUpdates(updates)`

**What it does:** Removes duplicate updates within a single Gemini response batch.
Uses `country + headline` as the deduplication key.
Ensures the same update from multiple URLs is only reported once.

**Returns:** Deduplicated array of update objects

---

### `getEInvoiceSpotlight()`

**What it does:** Calls Gemini (without web search) to generate 3 interesting e-invoicing
facts about randomly selected countries. Only called on days where all countries report
no updates.

**Returns:** Array of `{ country, fact }` objects

---

## Helper Functions

### `getDateWindow()`

**What it does:** Calculates the correct research date window based on today's day of week.

| Day | Window |
|---|---|
| Monday | Friday + Saturday + Sunday (3 days) |
| Tuesday–Friday | Yesterday only (1 day) |
| Saturday/Sunday | Never called — trigger exits early |

**Returns:** `{ startDate, endDate, windowLabel }`

---

### `getCounts(updates)`

**What it does:** Counts Critical, Important, and Good to Know updates.

**Returns:** `{ nCrit, nImp, nGtk }`

---

### `buildSubject(counts)`

**What it does:** Builds the email subject line.

**Example output:** `E-Invoice Brief — Tue 26 May — 3 Critical, 1 Important, 0 GTK`

---

### `formatDate(d)`

**What it does:** Converts a JavaScript Date object to `YYYY-MM-DD` string.

---

### `chunkArray(arr, size)`

**What it does:** Splits an array into chunks of the given size.
Used to batch countries into groups of 5 before sending to Gemini.

---

### `getISOWeek()`

**What it does:** Returns the ISO week identifier for today, e.g. `"2026-W22"`.
Used as the key for the weekly store in Properties.

---

### `getISOWeekForDate(d)`

**What it does:** Same as `getISOWeek()` but accepts a specific date.
Used when cleaning up old weekly store keys.

---

### `repairJson(str)`

**What it does:** Attempts to fix truncated or malformed JSON returned by Gemini.
Handles cases where the response was cut off mid-object due to token limits.
Falls back to extracting any complete update objects it can find.

**Returns:** Valid JSON string, or best-effort partial result

---

## Utility / Debug Functions (run manually only)

### `clearCache()`

**When to use:**
- You added a new country to `COUNTRIES` and want it included in today's run
- The previous run threw an error and you want a completely fresh fetch

**When NOT to use:**
- Just to resend the email to updated recipients — run `runDailyBrief` directly instead
- Out of curiosity — clearing cache means the next run calls Gemini fresh and may return different results

**What it does:** Deletes today's cached Gemini results from Properties storage.

---

### `clearTodaySeenMap()`

**When to use:** Always run this immediately after `clearCache()` if you want a genuine
fresh first-run experience today. Without this, updates from today's earlier run are
already in the seen-map and will be filtered out as duplicates.

**What it does:** Removes today's entries from the 7-day deduplication map.
Does not affect entries from previous days.

**Correct sequence for a full fresh re-run today:**
1. Run `clearCache()`
2. Run `clearTodaySeenMap()`
3. Run `runDailyBrief()`

---

### `debugGemini()`

**When to use:** When the script is producing no output or giving API errors.
Sends a minimal test request to the Gemini API and logs the HTTP status code
and full response body.

**What to look for in the log:**
- `HTTP status: 200` → API is working
- `HTTP status: 429` → Rate limit hit — wait and retry, or check quota at https://ai.dev/rate-limit
- `HTTP status: 403` → API key is wrong or not enabled
- `HTTP status: 404` → Model name is wrong — run `listModels()` to see available models

---

### `listModels()`

**When to use:** If `debugGemini()` returns 404, run this to see which model names
are actually available on your API key.

**What it does:** Calls the Gemini API models endpoint and logs all available models.
Look for a model with `generateContent` in `supportedGenerationMethods` and copy its
exact `name` value into the `MODEL` constant at the top of the script.

---

## Properties Storage Reference

The script stores state in Apps Script Properties Service (key-value store, 500KB limit).

| Key | What it stores | Expires |
|---|---|---|
| `seen_updates_v2` | JSON map of `country\|headline → date` for deduplication | Rolling 7 days |
| `daily_cache_YYYY-MM-DD` | Full Gemini results for that day | Cleaned up after 3 days |
| `weekly_store_YYYY-WNN` | All fresh updates for that ISO week | Cleaned up after 2 weeks |

To inspect stored values: Apps Script editor → left sidebar → **Project Settings** →
scroll down to **Script Properties** (note: large JSON values may be truncated in the UI —
use `Logger.log(PropertiesService.getScriptProperties().getProperty('key'))` to read them).
