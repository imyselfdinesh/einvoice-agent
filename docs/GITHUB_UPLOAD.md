# GitHub Upload & Sharing Guide

Complete step-by-step instructions to upload this project to GitHub and share it with your team.

---

## Part 1 — Create a GitHub Account (skip if you have one)

1. Go to https://github.com
2. Click **Sign up**
3. Enter your email, create a password, choose a username
4. Verify your email address

---

## Part 2 — Create the Repository on GitHub

1. Sign in to https://github.com
2. Click the **+** icon (top right) → **New repository**
3. Fill in the form:

| Field | Value |
|---|---|
| Repository name | `einvoice-agent` |
| Description | `Automated e-invoicing regulatory intelligence agent — Google Apps Script + Gemini API` |
| Visibility | **Private** (recommended — your API key reference is in the code) |
| Add a README | Leave unchecked (we have our own) |
| Add .gitignore | Leave as None |
| Choose a license | MIT (optional) |

4. Click **Create repository**
5. You will land on an empty repository page — keep this tab open

---

## Part 3 — Upload Files to GitHub (no Git installation needed)

GitHub lets you upload files directly from the browser.

### Step 1 — Upload the main code file

1. On your empty repository page, click **"uploading an existing file"** (in the blue text in the middle of the page)
   - Or click **Add file** → **Upload files**
2. On your computer, you have these files from this repository:
   ```
   Code.gs
   README.md
   docs/SETUP.md
   docs/FUNCTIONS.md
   docs/TROUBLESHOOTING.md
   ```
3. Drag `Code.gs` and `README.md` into the upload area
4. Scroll down to **Commit changes**
5. In the commit message box type: `Initial upload`
6. Click **Commit changes**

### Step 2 — Create the docs folder and upload docs

GitHub creates folders when you include them in a file path.

1. Click **Add file** → **Create new file**
2. In the filename box, type: `docs/SETUP.md`
3. Open `docs/SETUP.md` from this repository on your computer, copy all the text, paste it into the editor
4. Scroll down → **Commit new file**
5. Repeat for `docs/FUNCTIONS.md` and `docs/TROUBLESHOOTING.md`

After all uploads, your repository should look like:
```
einvoice-agent/
├── Code.gs
├── README.md
└── docs/
    ├── SETUP.md
    ├── FUNCTIONS.md
    └── TROUBLESHOOTING.md
```

---

## Part 4 — Add a .gitignore File (important — prevents accidental key leaks)

1. Click **Add file** → **Create new file**
2. Name it exactly: `.gitignore`
3. Paste this content:
   ```
   # Never commit files with real API keys
   config.js
   secrets.js
   .env
   *.env

   # OS files
   .DS_Store
   Thumbs.db
   ```
4. Click **Commit new file**

> **Important:** The `Code.gs` in this repository has `PASTE_YOUR_GEMINI_API_KEY_HERE`
> as a placeholder — not a real key. Never commit a file with your actual API key.
> Each team member enters their own key after setting up.

---

## Part 5 — Share with Your Team

### Option A — Share as Private repo (recommended for internal teams)

1. On your repository page, click **Settings** (top right tabs)
2. Scroll down to **Collaborators** in the left sidebar
3. Click **Add people**
4. Enter your team member's GitHub username or email
5. Select role: **Read** (they can view and copy but not edit)
6. Click **Add [name] to this repository**
7. They will receive an email invitation — they must accept it to get access

**Share this link with them:**
```
https://github.com/YOUR_USERNAME/einvoice-agent
```

### Option B — Make it Public (anyone with the link can see it)

1. Go to **Settings** → scroll to **Danger Zone** at the bottom
2. Click **Change repository visibility** → **Make public**
3. Confirm by typing the repository name

Then share the link — no GitHub account needed to view it.

### Option C — Share a Direct Link to Setup Instructions

Send your team this specific link so they land directly on the setup guide:

```
https://github.com/YOUR_USERNAME/einvoice-agent/blob/main/docs/SETUP.md
```

---

## Part 6 — What Your Team Needs to Do

Once they have access to the repository, each team member follows these steps:

1. **Open** `Code.gs` in the repository
2. **Click the copy icon** (top right of the code view) to copy all the code
3. **Go to** https://script.google.com → New project
4. **Paste** the code into `Code.gs`
5. **Edit the CONFIG section** at the top:
   - Replace `PASTE_YOUR_GEMINI_API_KEY_HERE` with their own Gemini API key
   - Update `TO_EMAIL` with their team's email addresses
   - Add or remove countries in `COUNTRIES` as needed
6. **Follow** `docs/SETUP.md` from Step 5 onwards (authorise + set triggers)

Each person/team gets their own independent copy running in their own Google account.
There is no shared infrastructure — each setup is fully isolated.

---

## Part 7 — Keeping the Repository Updated

When you make improvements to the script, update GitHub so your team gets the latest version.

### To update a file:

1. Go to the file on GitHub (e.g. `Code.gs`)
2. Click the **pencil icon** (Edit this file) — top right of the file view
3. Make your changes
4. Scroll down → add a commit message describing what changed (e.g. "Fix duplicate no-updates line")
5. Click **Commit changes**

### To notify your team of an update:

1. GitHub **Releases** (optional but professional):
   - Click **Releases** on the right sidebar of the repo
   - Click **Create a new release**
   - Tag version: `v1.1`, `v1.2` etc.
   - Title: e.g. "v1.1 — Weekly digest improvements"
   - Describe what changed
   - Click **Publish release**
   - Share the release URL with your team

2. Or simply send them the GitHub link and tell them to copy the updated `Code.gs`.

---

## Quick Reference — Useful GitHub URLs

Replace `YOUR_USERNAME` with your actual GitHub username.

| Page | URL |
|---|---|
| Repository home | `https://github.com/YOUR_USERNAME/einvoice-agent` |
| Main code file | `https://github.com/YOUR_USERNAME/einvoice-agent/blob/main/Code.gs` |
| Setup guide | `https://github.com/YOUR_USERNAME/einvoice-agent/blob/main/docs/SETUP.md` |
| Functions reference | `https://github.com/YOUR_USERNAME/einvoice-agent/blob/main/docs/FUNCTIONS.md` |
| Troubleshooting | `https://github.com/YOUR_USERNAME/einvoice-agent/blob/main/docs/TROUBLESHOOTING.md` |
