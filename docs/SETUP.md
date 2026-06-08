# Setup Guide — E-Invoicing Daily Agent

Complete step-by-step instructions to get the agent running from scratch.

**Estimated time: 15–20 minutes**

---

## Prerequisites

- A Google account (Gmail)
- A Google AI Studio account (same or different Google account — free)

---

## Step 1 — Get Your Gemini API Key (5 minutes)

1. Go to **https://aistudio.google.com**
2. Sign in with your Google account
3. Click **"Get API key"** in the top left
4. Click **"Create API key"**
5. Select an existing Google Cloud project or create a new one
6. Copy the API key — it looks like `AIzaSy...` (39 characters)

> **Important:** Do not add a credit card or enable billing unless you hit quota limits.
> The free tier (1,500 requests/day) is sufficient for this agent.

---

## Step 2 — Open Google Apps Script (2 minutes)

1. Go to **https://script.google.com**
2. Sign in with the Google account whose Gmail you want to send from
3. Click **"New project"** (top left)
4. Click the project name **"Untitled project"** at the top and rename it to `EInvoiceAgent`

---

## Step 3 — Add the Code (3 minutes)

1. In the editor, you will see a file called `Code.gs` with a default empty function
2. **Select all** the existing code and **delete it**
3. Open `Code.gs` from this repository
4. **Copy the entire contents** and paste it into the Apps Script editor
5. Click the **Save** icon (floppy disk) or press `Ctrl+S`

---

## Step 4 — Configure Your Settings (2 minutes)

At the top of the script, update these four values:

```javascript
const GEMINI_API_KEY = 'PASTE_YOUR_KEY_HERE';       // from Step 1
const TO_EMAIL       = 'you@company.com,colleague@company.com';  // comma-separated, no spaces
const CC_EMAIL       = '';                            // optional, leave empty if not needed
const MODEL          = 'gemini-2.5-flash';            // leave as-is
```

### Adding or removing countries

Edit the `COUNTRIES` array. Each entry follows this pattern:

```javascript
{ 
  country: 'Country Name', 
  authority: 'Tax Authority Name', 
  url: 'https://official-portal-url.gov', 
  extraUrls: [] 
}
```

To add extra URLs for a country (e.g. a developer portal alongside the main portal):

```javascript
{ 
  country: 'India', 
  authority: 'GSTN', 
  url: 'https://einvoice1.gst.gov.in',
  extraUrls: ['https://www.gst.gov.in', 'https://cbic-gst.gov.in']
}
```

---

## Step 5 — Authorise the Script (2 minutes)

1. Select `runDailyBrief` from the function dropdown at the top of the editor
2. Click the **Run** button (▶)
3. A popup will appear: **"Authorisation required"** — click **"Review permissions"**
4. Select your Google account
5. You may see **"Google hasn't verified this app"** — click **"Advanced"** then **"Go to EInvoiceAgent (unsafe)"**
6. Review the permissions and click **"Allow"**

> This grants the script permission to send Gmail from your account and make external URL requests.
> These permissions are only used for this script — nothing else.

---

## Step 6 — Test the Script (3 minutes)

1. With `runDailyBrief` still selected, click **Run** (▶)
2. Watch the **Execution log** at the bottom — you should see batch processing logs
3. Check your inbox — the email should arrive within 60–90 seconds
4. If you see errors, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## Step 7 — Set Up Daily Trigger (3 minutes)

This makes the script run automatically every weekday at 11 AM.

1. Click the **clock icon** (Triggers) in the left sidebar
2. Click **"+ Add Trigger"** (bottom right)
3. Configure as follows:

| Setting | Value |
|---|---|
| Choose which function to run | `runDailyBrief` |
| Choose which deployment to run | Head |
| Select event source | Time-driven |
| Select type of time | Day timer |
| Select time of day | 11am to 12pm |

4. Click **Save**

> The script has a built-in weekday check — it will silently exit on Saturday and Sunday
> even though the trigger runs daily.

---

## Step 8 — Set Up Weekly Digest Trigger (2 minutes)

This sends the week-in-review email every Friday at 4 PM.

1. Click **"+ Add Trigger"** again
2. Configure as follows:

| Setting | Value |
|---|---|
| Choose which function to run | `runWeeklyDigest` |
| Choose which deployment to run | Head |
| Select event source | Time-driven |
| Select type of time | Week timer |
| Day of week | Every Friday |
| Select time of day | 4pm to 5pm |

3. Click **Save**

---

## Step 9 — Verify Everything is Working

After setup, you should have:
- ✅ Two triggers visible in the Triggers panel
- ✅ A test email in your inbox from Step 6
- ✅ Your API key saved in the script

The agent will now run independently every weekday. No further action needed.

---

## Timezone Note

The trigger runs in the timezone of your Google account. To check or change it:

1. In Apps Script, click **Project Settings** (gear icon, left sidebar)
2. Scroll down to **"Script Properties"** — your timezone is shown under **"Time zone"**
3. To change: go to **https://script.google.com** → your project → Project Settings → change time zone

---

## Adding More Email Recipients Later

Edit `TO_EMAIL` at the top of the script:

```javascript
const TO_EMAIL = 'person1@company.com,person2@company.com,person3@company.com';
```

No need to clear cache or re-run setup — just save and the next run picks up the new list.
To resend today's email to the updated list, simply run `runDailyBrief` manually — it reads from cache and sends the same email.

---

## Deployment Note

You do **not** need to "Deploy" the script. Apps Script triggers run directly against
the editor code (called "Head"). Deployment is only needed if you were exposing the
script as a public web URL — which this agent does not require.
