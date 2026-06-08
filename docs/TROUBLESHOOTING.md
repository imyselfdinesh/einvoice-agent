# Troubleshooting — E-Invoicing Daily Agent

---

## API Errors

### 429 — Quota Exceeded

```
"code": 429, "status": "RESOURCE_EXHAUSTED"
```

**Cause:** You have hit the Gemini API free tier rate limit for the day or minute.

**Fixes:**
1. Wait until midnight Pacific Time (Google resets quotas at midnight PT)
2. Switch to a different model — try `gemini-2.5-flash` if on `gemini-2.0-flash`
3. If you ran many manual test runs today, wait until tomorrow — the daily limit will reset
4. Check your current usage at https://ai.dev/rate-limit

**Prevention:** Do not run `runDailyBrief` manually more than 2–3 times per day.
The trigger handles production runs — manual runs are for testing only.

---

### 403 — Forbidden / API Key Invalid

```
"code": 403, "status": "PERMISSION_DENIED"
```

**Cause:** API key is wrong, not copied correctly, or not enabled for the Generative Language API.

**Fixes:**
1. Go to https://aistudio.google.com → Get API key → copy the key again carefully
2. Paste it into `GEMINI_API_KEY` with no extra spaces or quote characters
3. Make sure the key starts with `AIzaSy`
4. If the error persists, create a new API key in Google AI Studio

---

### 404 — Model Not Found

```
"code": 404, "status": "NOT_FOUND", "message": "models/X is not found"
```

**Cause:** The model name in `MODEL` constant is not available on your API key / region.

**Fix:**
1. Run `listModels()` from the function dropdown
2. In the log, find a model with `"generateContent"` in `supportedGenerationMethods`
3. Copy its exact `name` value (e.g. `"models/gemini-2.5-flash"`)
4. Update `MODEL` at the top of the script — use just the part after `models/`:
   ```javascript
   const MODEL = 'gemini-2.5-flash';
   ```

---

## Email Issues

### No email received after running `runDailyBrief`

**Check 1 — Execution log**
In Apps Script, go to **Executions** (left sidebar clock icon) → click the latest run →
check for errors in red.

**Check 2 — TO_EMAIL format**
Make sure `TO_EMAIL` is a plain comma-separated string with no spaces after commas
and no square brackets:
```javascript
// Correct
const TO_EMAIL = 'a@company.com,b@company.com';

// Wrong — array format
const TO_EMAIL = ['a@company.com', 'b@company.com'];

// Wrong — spaces after commas
const TO_EMAIL = 'a@company.com, b@company.com';
```

**Check 3 — Spam/Junk folder**
The email comes from your own Gmail address. First-time sends sometimes land in spam.
Mark as "Not spam" to train your mail client.

**Check 4 — Gmail daily send limit**
Apps Script allows 100 emails/day per Gmail account.
If you ran many test runs, you may have hit this limit.
Wait 24 hours and try again.

---

### Email arrives but shows no updates (zero for all countries)

**Cause 1 — seenMap blocked everything**
If you ran the script earlier today and all updates were already recorded in `seenMap`,
a second first-run (after clearing cache) will find them all filtered out.

**Fix:** Run `clearCache()` then `clearTodaySeenMap()` then `runDailyBrief()`.

**Cause 2 — Date window issue**
Check the "Window" line in the email header. If it shows a weekend date when run on a weekday,
the `getDateWindow()` function may be off. Check that your Apps Script timezone is set correctly
(Project Settings → Time zone).

**Cause 3 — Gemini found nothing genuine**
On quiet regulatory days, it is normal to get zero updates. The Spotlight section will
appear instead. If this happens consistently for countries that you know have active portals,
add their secondary URLs to `extraUrls` in the `COUNTRIES` array.

---

### Email shows question marks (????) instead of icons

**Cause:** Your email client does not render emoji characters.

**Fix:** This was resolved in the current version of the script which uses plain text
labels (CRITICAL / IMPORTANT / GOOD TO KNOW) instead of emoji. Make sure you are using
the latest version of `Code.gs` from this repository.

---

### "No Critical updates today" appears twice

**Cause:** You are running an older version of the script that had a bug in the
`buildEmail` section rendering both a standalone message and a table message.

**Fix:** Replace your script with the latest `Code.gs` from this repository.
The current version uses a single `section()` function that renders either a table
or a "no updates" line — never both.

---

## Script Errors

### "Unexpected end of JSON input" in execution log

**Cause:** Gemini returned a truncated JSON response — the output hit the token limit
before the JSON was complete.

**Fix:** The `repairJson()` function handles this automatically in the current version.
If you still see this error, check that `maxOutputTokens` in the `generationConfig`
inside `callGemini()` is set to `16384`.

---

### "Script timeout" or execution stops after 6 minutes

**Cause:** Apps Script has a 6-minute maximum execution time. With many countries and
slow Gemini responses, the script can occasionally approach this limit.

**Fixes:**
1. Reduce batch size from 5 to 4 countries: find `chunkArray(COUNTRIES, 5)` and change to `chunkArray(COUNTRIES, 4)`
2. Reduce `Utilities.sleep(10000)` to `Utilities.sleep(7000)` between batches
3. Remove countries you don't actively need

---

### "Exception: Cannot call GmailApp.sendEmail" 

**Cause:** The script has not been authorised yet, or authorisation was revoked.

**Fix:**
1. Run `runDailyBrief` manually from the editor
2. A permission popup will appear — click through and authorise
3. If no popup appears, go to **Project Settings** → **OAuth scopes** and check that
   `https://www.googleapis.com/auth/gmail.send` is listed

---

## Cache and State Issues

### Re-running today gives different updates each time

**Cause:** Cache was cleared between runs. Each fresh Gemini call is a new web search
and may return different results.

**What to do:** Do not clear cache unless you have a specific reason (new country added,
previous run errored). For resending to updated recipients, just run `runDailyBrief`
directly — the cache path sends the identical email.

### Weekly digest shows 0 updates even though daily emails had updates

**Cause:** The weekly store (`weekly_store_YYYY-WNN`) only accumulates updates from
`freshUpdates` — updates that passed the 7-day seenMap filter. If you cleared
`seenMap` multiple times or ran fresh fetches repeatedly, some updates may have been
recorded in `seenMap` without being added to the weekly store.

**Fix:** This is a cosmetic issue and does not affect the daily briefs. For future weeks,
avoid clearing `seenMap` unnecessarily.

---

## Getting Help

If you encounter an error not listed here:

1. Copy the full error message from the Apps Script **Executions** log
2. Copy the `RAW GEMINI RESPONSE` log line if visible
3. Share both with your team admin or open an issue on the GitHub repository
