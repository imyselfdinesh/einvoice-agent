// ═══════════════════════════════════════════════════════════════════════════
// E-INVOICING DAILY INTELLIGENCE AGENT
// Built on Google Apps Script + Gemini API — Zero cost
//
// Setup: See docs/SETUP.md
// Functions reference: See docs/FUNCTIONS.md
// Troubleshooting: See docs/TROUBLESHOOTING.md
// ═══════════════════════════════════════════════════════════════════════════

// ─── CONFIG — edit these values before running ────────────────────────────
const GEMINI_API_KEY = 'PASTE_YOUR_GEMINI_API_KEY_HERE';
const TO_EMAIL       = 'you@company.com,colleague@company.com';  // comma-separated, no spaces
const CC_EMAIL       = '';                                        // optional, leave empty if not needed
const MODEL          = 'gemini-2.5-flash';                        // change only if listModels() shows a different name

const COUNTRIES = [
  { country: 'India',        authority: 'GSTN',                    url: 'https://einvoice1.gst.gov.in',                           extraUrls: [] },
  { country: 'Saudi Arabia', authority: 'ZATCA',                   url: 'https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx', extraUrls: [] },
  { country: 'UAE',          authority: 'Ministry of Finance/FTA', url: 'https://mof.gov.ae',                                     extraUrls: [] },
  { country: 'Malaysia',     authority: 'LHDN / IRBM',             url: 'https://mytax.hasil.gov.my',                             extraUrls: [] },
  { country: 'France',       authority: 'DGFiP',                   url: 'https://www.impots.gouv.fr',                             extraUrls: [] },
  { country: 'Germany',      authority: 'BMF',                     url: 'https://www.bundesfinanzministerium.de',                 extraUrls: [] },
  { country: 'Poland',       authority: 'Ministry of Finance',     url: 'https://www.podatki.gov.pl/ksef',                        extraUrls: [] },
  { country: 'Italy',        authority: 'Agenzia delle Entrate',   url: 'https://www.agenziaentrate.gov.it',                      extraUrls: [] },
  { country: 'Spain',        authority: 'AEAT',                    url: 'https://sede.agenciatributaria.gob.es',                  extraUrls: [] },
  { country: 'Romania',      authority: 'ANAF',                    url: 'https://www.anaf.ro',                                    extraUrls: [] },
  { country: 'Greece',       authority: 'IAPR / myDATA',           url: 'https://www.aade.gr',                                    extraUrls: [] },
  { country: 'Singapore',    authority: 'IMDA / InvoiceNow',       url: 'https://www.imda.gov.sg',                                extraUrls: [] },
  { country: 'Australia',    authority: 'ATO / PEPPOL',            url: 'https://www.ato.gov.au',                                 extraUrls: [] },
  { country: 'Mexico',       authority: 'SAT',                     url: 'https://www.sat.gob.mx',                                 extraUrls: [] },
  { country: 'Brazil',       authority: 'Receita Federal',         url: 'https://www.gov.br/receitafederal',                      extraUrls: [] },
  { country: 'Nigeria',      authority: 'FIRS',                    url: 'https://einvoice.firs.gov.ng/',                          extraUrls: [] },
  // ── Add new countries here following the same pattern ──
  // { country: 'Portugal', authority: 'AT', url: 'https://www.portaldasfinancas.gov.pt', extraUrls: [] },
];

// ─── MAIN DAILY BRIEF ─────────────────────────────────────────────────────
function runDailyBrief() {
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) { Logger.log('Weekend — skipping.'); return; }

  const { windowLabel } = getDateWindow();
  const props    = PropertiesService.getScriptProperties();
  const seenKey  = 'seen_updates_v2';
  let   seenMap  = {};
  try { seenMap = JSON.parse(props.getProperty(seenKey) || '{}'); } catch(e) { seenMap = {}; }

  const todayStr  = formatDate(new Date());
  const cutoffStr = formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  // Expire seen entries older than 7 days
  Object.keys(seenMap).forEach(k => { if (seenMap[k] < cutoffStr) delete seenMap[k]; });

  // Cache today's raw Gemini results so manual re-runs return the same email
  const cacheKey = 'daily_cache_' + todayStr;
  const cached   = props.getProperty(cacheKey);
  let allUpdates  = [];
  let unreachable = [];

  if (cached) {
    Logger.log('Using cached results for ' + todayStr);
    const c    = JSON.parse(cached);
    allUpdates  = c.allUpdates;
    unreachable = c.unreachable;

    // Re-run: skip seenMap filtering — send identical email as first run
    let spotlight = [];
    if (allUpdates.length === 0) spotlight = getEInvoiceSpotlight();
    const html    = buildEmail(allUpdates, unreachable, windowLabel, COUNTRIES, spotlight);
    const counts  = getCounts(allUpdates);
    const subject = buildSubject(counts);
    GmailApp.sendEmail(TO_EMAIL, subject, 'HTML version available', {
      htmlBody: html, name: 'E-Invoice Agent'
    });
    Logger.log('Re-run: sent cached email. Updates: ' + allUpdates.length);
    return;
  }

  // First run of the day — call Gemini
  const batches = chunkArray(COUNTRIES, 5);
  for (let i = 0; i < batches.length; i++) {
    try {
      const result = callGemini(batches[i], windowLabel);
      allUpdates  = allUpdates.concat(result.updates    || []);
      unreachable = unreachable.concat(result.unreachable || []);
    } catch(e) {
      Logger.log('Batch error: ' + e.message);
      batches[i].forEach(c => unreachable.push(c.country + ' — error: ' + e.message));
    }
    if (i < batches.length - 1) Utilities.sleep(10000);
  }

  // Deduplicate updates from multiple URLs for the same country
  allUpdates = deduplicateUpdates(allUpdates);

  // Cache for the rest of today
  props.setProperty(cacheKey, JSON.stringify({ allUpdates, unreachable }));

  // Clean up cache entries older than 3 days
  [2, 3, 4].forEach(daysAgo => {
    try { props.deleteProperty('daily_cache_' + formatDate(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000))); } catch(e) {}
  });

  // Cross-day deduplication — skip updates already reported in last 7 days
  const freshUpdates = allUpdates.filter(u => {
    const key = (u.country + '|' + u.headline).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenMap[key]) return false;
    seenMap[key] = todayStr;
    return true;
  });
  props.setProperty(seenKey, JSON.stringify(seenMap));

  // Accumulate into weekly store for Friday digest
  const weekKey     = 'weekly_store_' + getISOWeek();
  let   weeklyStore = [];
  try { weeklyStore = JSON.parse(props.getProperty(weekKey) || '[]'); } catch(e) {}
  freshUpdates.forEach(u => {
    const exists = weeklyStore.some(w => w.country === u.country && w.headline === u.headline);
    if (!exists) weeklyStore.push({ ...u, reported_date: todayStr });
  });
  props.setProperty(weekKey, JSON.stringify(weeklyStore));

  // Clean up weekly store keys older than 2 weeks
  [2, 3].forEach(weeksAgo => {
    try {
      const d = new Date();
      d.setDate(d.getDate() - weeksAgo * 7);
      props.deleteProperty('weekly_store_' + getISOWeekForDate(d));
    } catch(e) {}
  });

  // Spotlight only when zero updates
  let spotlight = [];
  if (freshUpdates.length === 0) spotlight = getEInvoiceSpotlight();

  const html    = buildEmail(freshUpdates, unreachable, windowLabel, COUNTRIES, spotlight);
  const counts  = getCounts(freshUpdates);
  const subject = buildSubject(counts);

  GmailApp.sendEmail(TO_EMAIL, subject, 'HTML version available', {
    htmlBody: html, name: 'E-Invoice Agent'
  });
  Logger.log('Done. Fresh updates: ' + freshUpdates.length);
}

// ─── WEEKLY DIGEST — set a separate trigger: every Friday at 4 PM ─────────
function runWeeklyDigest() {
  const props   = PropertiesService.getScriptProperties();
  const weekKey = 'weekly_store_' + getISOWeek();
  let   updates = [];
  try { updates = JSON.parse(props.getProperty(weekKey) || '[]'); } catch(e) {}

  const today   = new Date();
  const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const subject = `E-Invoice Week in Review — w/e ${today.getDate()} ${months[today.getMonth()]}`;

  GmailApp.sendEmail(TO_EMAIL, subject, 'HTML version available', {
    htmlBody: buildWeeklyEmail(updates, subject),
    name: 'E-Invoice Agent'
  });
  Logger.log('Weekly digest sent. ' + updates.length + ' updates.');
}

// ─── GEMINI CALL ──────────────────────────────────────────────────────────
function callGemini(countries, windowLabel) {
  const countryList = countries.map(c => {
    const extra = c.extraUrls && c.extraUrls.length
      ? ' | Also check: ' + c.extraUrls.join(' , ')
      : '';
    return `- ${c.country} | ${c.authority} | Primary: ${c.url}${extra}`;
  }).join('\n');

  const windowStart = windowLabel.split(' to ')[0].trim();

  const prompt = `You are a senior e-invoicing regulatory intelligence analyst. Your readers are business analysts at an e-invoicing software company. They use your report to update product features, inform customers of compliance changes, and raise development tickets. Every missed update has a business consequence.

RESEARCH DATE WINDOW (STRICT): ${windowLabel}
TODAY: ${formatDate(new Date())}

DATE RULE:
Only return updates published or announced within the date window above.
Do NOT return updates from before the window start date unless explicitly re-announced within it.
If publication date is uncertain, include the update but set publication_date to "Unverified".
Never exclude an update solely because you cannot confirm its date.

COUNTRIES TO RESEARCH:
${countryList}

════════════════════════════════════════
WHAT TO SEARCH FOR — BE EXHAUSTIVE
════════════════════════════════════════

For each country, check ALL of the following update types:

MANDATE & COMPLIANCE
- New or revised taxpayer thresholds (turnover, transaction type, sector)
- Phase rollout announcements (which taxpayer groups, from when)
- B2B / B2C / B2G / export invoice mandate changes
- Exemptions added or removed
- Penalty enforcement dates, fine amounts, grace periods
- Legal gazette publications, official circulars, notifications

TECHNICAL FORMATS & SCHEMAS
- New schema versions (XSD, JSON, UBL, CII, XML)
- New or deprecated fields (mandatory, conditional, optional changes)
- Code list updates (document type codes, tax codes, unit codes)
- Digital signature / e-seal algorithm or certificate changes
- QR code specification changes (content, encoding, placement rules)
- Archiving and retention rule changes

PORTALS & INFRASTRUCTURE
- Government portal new features, UI changes, downtime notices
- New modules (credit note portal, amendment flows, cancellation flows)
- IRN / clearance / reporting portal changes
- Taxpayer registration or onboarding process changes

APIs & INTEGRATION
- New API versions released or old versions deprecated
- New endpoints, renamed endpoints, removed endpoints
- Authentication changes (OAuth, API key rotation, certificate renewal)
- Rate limit changes
- Sandbox / test bed availability, new test scenarios, test data updates
- Error code additions or changes

PEPPOL & INTEROPERABILITY
- New PEPPOL BIS versions for the country
- New access points certified or decertified
- Country joining or leaving PEPPOL network
- Cross-border e-invoicing framework changes
- New supported document types on PEPPOL

ACCREDITATION & SERVICE PROVIDERS
- New ASP / GSP / ISP accreditation rules
- New accredited service providers announced
- Certification process changes
- Audit or compliance requirements for service providers

REPORTING & RECONCILIATION
- New reporting obligations (near-real-time, periodic, annual)
- New report types or formats
- Changes to reconciliation rules or timelines
- E-reporting vs e-invoicing scope changes

NEW INVOICE TYPES & SCENARIOS
- New supported invoice types (self-billing, recipient-created, simplified, batch)
- New business scenarios (imports, exports, reverse charge)
- Credit note, debit note, prepayment invoice rule changes
- Multi-currency or multi-language invoice rule changes

════════════════════════════════════════
WHERE TO SEARCH
════════════════════════════════════════

Only search these sources in this exact order:
1. The Primary URL listed for each country
2. The "Also check" extra URLs listed for that country
3. Nothing else — do not search general web, news sites, consulting firms,
   or any source not in the Primary or extra URLs above

If a country has no extra URLs and the primary URL shows no update,
the answer for that country is no_updates. Do not go looking elsewhere.

════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════

SOURCE PRIORITY for read_more_url:
1. Primary URL page → use it
2. Extra URL page only → use that
3. Never use vertexaisearch.cloud.google.com redirect URLs
4. Direct page URL, not homepage

DEDUPLICATION: Same update on multiple URLs → report once using Primary URL.

Respond ONLY in this exact JSON — no markdown, no preamble, no extra text:
{
  "updates": [
    {
      "country": "Country name",
      "authority": "Authority name",
      "headline": "One-line title — specific enough that a BA knows what changed",
      "summary": "Max 2 sentences. State WHAT changed, WHO is affected, and WHEN it takes effect. Mention field names, version numbers, thresholds, dates where available.",
      "category": "CRITICAL or IMPORTANT or GOOD_TO_KNOW",
      "effective_date": "YYYY-MM-DD or Phased from YYYY-MM-DD or TBD",
      "publication_date": "YYYY-MM-DD or Unverified",
      "read_more_url": "direct official government URL only",
      "attachments": [],
      "translated_from": ""
    }
  ],
  "no_updates": ["Country1", "Country2"],
  "unreachable": ["Country — reason"]
}

CATEGORY RULES:
CRITICAL     = go-live within 90 days, breaking API/schema change, validation rules that reject invoices, penalty enforcement imminent, threshold change affecting current customers.
IMPORTANT    = changes in 90–180 days, new format versions, sandbox changes, accreditation updates, new invoice types, new reporting obligations.
GOOD_TO_KNOW = roadmap beyond 180 days, consultations open, draft legislation, FAQ clarifications, minor documentation updates.

When in doubt between two categories, pick the higher one.
Only official government or officially designated authority sources. Never fabricate.
If no update found in the strict date window, put the country in no_updates.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
  );

  const data = JSON.parse(response.getContentText());
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  Logger.log('RAW GEMINI RESPONSE: ' + raw);

  let clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  clean = repairJson(clean);

  try {
    const parsed = JSON.parse(clean);
    if (parsed.updates) {
      parsed.updates = parsed.updates.filter(u => {
        if (!u.publication_date)                 return true;
        if (u.publication_date === 'Unverified') return true;
        return u.publication_date >= windowStart;
      });
    }
    return parsed;
  } catch(e) {
    Logger.log('JSON parse failed: ' + e.message);
    return { updates: [], no_updates: [], unreachable: [] };
  }
}

// ─── DAILY EMAIL BUILDER ──────────────────────────────────────────────────
function buildEmail(updates, unreachable, windowLabel, allCountries, spotlight = []) {
  const critical   = updates.filter(u => u.category === 'CRITICAL');
  const important  = updates.filter(u => u.category === 'IMPORTANT');
  const goodToKnow = updates.filter(u => u.category === 'GOOD_TO_KNOW');
  const updatedCountries  = [...new Set(updates.map(u => u.country))];
  const noUpdateCountries = allCountries
    .map(c => c.country)
    .filter(c => !updatedCountries.includes(c) && !unreachable.some(r => r.startsWith(c)));

  const tableStyle = 'width:100%;border-collapse:collapse;margin-bottom:8px;font-size:14px;font-family:Arial,sans-serif;';
  const thStyle    = 'background:#f0f0f0;padding:10px 12px;text-align:left;border-bottom:2px solid #cccccc;font-weight:600;font-size:13px;font-family:Arial,sans-serif;';
  const tdStyle    = 'padding:10px 12px;border-bottom:1px solid #eeeeee;vertical-align:top;font-size:13px;line-height:1.5;font-family:Arial,sans-serif;';

  function buildTable(rows) {
    if (!rows.length) return '';
    const rowsHtml = rows.map(u => {
      const attachLinks = (u.attachments || [])
        .filter(a => a && a.startsWith('http'))
        .map(a => `<a href="${a}" style="display:block;color:#1155cc;font-size:12px;margin-top:4px;">[Attachment]</a>`)
        .join('');
      const translated = u.translated_from
        ? `<br><span style="color:#999;font-size:11px;">Translated from ${u.translated_from}</span>`
        : '';
      const url = (u.read_more_url && u.read_more_url.startsWith('http') && !u.read_more_url.includes('vertexaisearch'))
        ? u.read_more_url : '#';
      const pubDate = !u.publication_date
        ? 'N/A'
        : u.publication_date === 'Unverified'
          ? '<span style="color:#b45309;font-size:11px;">Unverified &#9888;</span>'
          : u.publication_date;
      return `<tr>
        <td style="${tdStyle}font-weight:600;white-space:nowrap;">${u.country}</td>
        <td style="${tdStyle}color:#555;white-space:nowrap;">${u.authority}</td>
        <td style="${tdStyle}">${u.summary}${translated}${attachLinks}</td>
        <td style="${tdStyle}color:#555;white-space:nowrap;">${u.effective_date || 'TBD'}</td>
        <td style="${tdStyle}color:#555;white-space:nowrap;">${pubDate}</td>
        <td style="${tdStyle}white-space:nowrap;"><a href="${url}" style="color:#1155cc;">Read more</a></td>
      </tr>`;
    }).join('');
    return `<table style="${tableStyle}">
      <thead><tr>
        <th style="${thStyle}width:85px;">Country</th>
        <th style="${thStyle}width:105px;">Authority</th>
        <th style="${thStyle}">Update</th>
        <th style="${thStyle}width:85px;">Effective</th>
        <th style="${thStyle}width:90px;">Published on</th>
        <th style="${thStyle}width:75px;">Source</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
  }

  function section(label, color, rows) {
    const header = `<div style="margin:28px 0 10px;padding:8px 14px;background:${color};border-radius:4px;">
      <strong style="font-size:15px;color:#ffffff;font-family:Arial,sans-serif;">${label}</strong>
    </div>`;
    if (!rows.length) {
      return header + `<p style="color:#888;font-size:13px;font-family:Arial,sans-serif;margin:0 0 20px;">No ${label} updates today.</p>`;
    }
    return header + buildTable(rows);
  }

  const counts = getCounts(updates);

  return `<div style="font-family:Arial,sans-serif;max-width:960px;margin:0 auto;color:#222222;background:#ffffff;">
    <div style="background:#1a1a2e;color:#ffffff;padding:20px 28px;border-radius:6px 6px 0 0;">
      <h2 style="margin:0;font-size:20px;font-family:Arial,sans-serif;color:#ffffff;">E-Invoicing Daily Brief</h2>
      <p style="margin:6px 0 0;color:#aaaaaa;font-size:13px;font-family:Arial,sans-serif;">Window: ${windowLabel} &nbsp;|&nbsp; Countries researched: ${allCountries.length}</p>
    </div>
    <div style="background:#ffffff;padding:24px 28px;border:1px solid #dddddd;border-top:none;border-radius:0 0 6px 6px;">
      <table style="border-collapse:collapse;margin-bottom:24px;"><tr>
        <td style="padding:4px 12px 4px 0;">
          <span style="background:#fce8e6;color:#c5221f;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:Arial,sans-serif;">CRITICAL: ${counts.nCrit}</span>
        </td>
        <td style="padding:4px 12px 4px 0;">
          <span style="background:#fef9e7;color:#b45309;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:Arial,sans-serif;">IMPORTANT: ${counts.nImp}</span>
        </td>
        <td style="padding:4px 0;">
          <span style="background:#e6f4ea;color:#137333;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:Arial,sans-serif;">GOOD TO KNOW: ${counts.nGtk}</span>
        </td>
      </tr></table>
      ${section('CRITICAL',     '#c5221f', critical)}
      ${section('IMPORTANT',    '#b45309', important)}
      ${section('GOOD TO KNOW', '#137333', goodToKnow)}
      ${noUpdateCountries.length ? `
      <div style="margin-top:24px;padding:14px 16px;background:#f8f8f8;border-radius:4px;border:1px solid #eeeeee;">
        <strong style="font-size:13px;font-family:Arial,sans-serif;">No updates today:</strong>
        <span style="font-size:13px;color:#666666;font-family:Arial,sans-serif;"> ${noUpdateCountries.join(', ')}</span>
      </div>` : ''}
      ${unreachable.length ? `
      <div style="margin-top:12px;padding:14px 16px;background:#fff8e1;border-radius:4px;border:1px solid #ffe082;">
        <strong style="font-size:13px;font-family:Arial,sans-serif;">Sources unreachable (manual check needed):</strong><br>
        <span style="font-size:12px;color:#666;font-family:Arial,sans-serif;">${unreachable.join('<br>')}</span>
      </div>` : ''}
      ${spotlight.length ? `
      <div style="margin-top:32px;padding:20px;background:#f0f4ff;border-radius:6px;border:1px solid #d0d9f0;">
        <strong style="font-size:14px;font-family:Arial,sans-serif;color:#1a1a2e;">E-Invoicing Spotlight</strong>
        <p style="font-size:12px;color:#666;margin:4px 0 16px;font-family:Arial,sans-serif;">Quiet day on the regulatory front. Here are three things worth knowing about e-invoicing globally.</p>
        ${spotlight.map(s => `
        <div style="margin-bottom:14px;padding-left:12px;border-left:3px solid #4a6cf7;">
          <strong style="font-size:13px;font-family:Arial,sans-serif;color:#1a1a2e;">${s.country}</strong>
          <p style="margin:4px 0 0;font-size:13px;color:#444;font-family:Arial,sans-serif;line-height:1.6;">${s.fact}</p>
        </div>`).join('')}
      </div>` : ''}
      <p style="margin-top:28px;font-size:11px;color:#aaaaaa;border-top:1px solid #eeeeee;padding-top:12px;font-family:Arial,sans-serif;">
        Generated by E-Invoice Agent &nbsp;|&nbsp; Official government sources only &nbsp;|&nbsp; Not legal advice
      </p>
    </div>
  </div>`;
}

// ─── WEEKLY EMAIL BUILDER ─────────────────────────────────────────────────
function buildWeeklyEmail(updates, subject) {
  const catOrder = { 'CRITICAL': 0, 'IMPORTANT': 1, 'GOOD_TO_KNOW': 2 };
  const catLabel = { 'CRITICAL': 'CRITICAL', 'IMPORTANT': 'IMPORTANT', 'GOOD_TO_KNOW': 'GOOD TO KNOW' };
  const catColor = { 'CRITICAL': '#c5221f', 'IMPORTANT': '#b45309', 'GOOD_TO_KNOW': '#137333' };
  const catBg    = { 'CRITICAL': '#fce8e6', 'IMPORTANT': '#fef9e7', 'GOOD_TO_KNOW': '#e6f4ea' };

  const nCrit = updates.filter(u => u.category === 'CRITICAL').length;
  const nImp  = updates.filter(u => u.category === 'IMPORTANT').length;
  const nGtk  = updates.filter(u => u.category === 'GOOD_TO_KNOW').length;

  const byCountry = {};
  updates.forEach(u => {
    if (!byCountry[u.country]) byCountry[u.country] = [];
    byCountry[u.country].push(u);
  });
  Object.keys(byCountry).forEach(c => {
    byCountry[c].sort((a, b) => (catOrder[a.category] || 99) - (catOrder[b.category] || 99));
  });
  const sortedCountries = Object.keys(byCountry).sort((a, b) => {
    const topA = catOrder[byCountry[a][0].category] || 99;
    const topB = catOrder[byCountry[b][0].category] || 99;
    if (topA !== topB) return topA - topB;
    return byCountry[b].length - byCountry[a].length;
  });

  const thStyle = 'background:#f0f0f0;padding:9px 12px;text-align:left;border-bottom:2px solid #cccccc;font-weight:600;font-size:12px;font-family:Arial,sans-serif;white-space:nowrap;';
  const tdStyle = 'padding:9px 12px;border-bottom:1px solid #eeeeee;vertical-align:top;font-size:12px;line-height:1.5;font-family:Arial,sans-serif;';

  let tableRows = '';
  if (updates.length) {
    sortedCountries.forEach(country => {
      const rows = byCountry[country];
      rows.forEach((u, idx) => {
        const isFirst  = idx === 0;
        const rowspan  = rows.length;
        const catBadge = `<span style="background:${catBg[u.category]||'#f5f5f5'};color:${catColor[u.category]||'#555'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;">${catLabel[u.category]||u.category}</span>`;
        const url      = (u.read_more_url && u.read_more_url.startsWith('http') && !u.read_more_url.includes('vertexaisearch')) ? u.read_more_url : '#';
        const pubDate  = !u.publication_date ? 'N/A'
          : u.publication_date === 'Unverified'
            ? '<span style="color:#b45309;font-size:10px;">Unverified &#9888;</span>'
            : u.publication_date;
        const countryCell = isFirst
          ? `<td style="${tdStyle}font-weight:700;white-space:nowrap;vertical-align:top;border-right:2px solid #e0e0e0;" rowspan="${rowspan}">${country}<br><span style="font-weight:400;font-size:11px;color:#888;">${u.authority}</span></td>`
          : '';
        tableRows += `<tr${isFirst ? ' style="background:#fafafa;"' : ''}>
          ${countryCell}
          <td style="${tdStyle}text-align:center;">${catBadge}</td>
          <td style="${tdStyle}">${u.headline}<br><span style="color:#666;font-size:11px;">${u.summary}</span></td>
          <td style="${tdStyle}color:#555;white-space:nowrap;">${u.effective_date || 'TBD'}</td>
          <td style="${tdStyle}color:#555;white-space:nowrap;">${pubDate}</td>
          <td style="${tdStyle}white-space:nowrap;"><a href="${url}" style="color:#1155cc;font-size:12px;">Read more</a></td>
        </tr>`;
      });
      tableRows += `<tr><td colspan="6" style="padding:0;background:#e8e8e8;height:2px;"></td></tr>`;
    });
  }

  const weekEnd = subject.split('w/e ')[1] || '';

  return `<div style="font-family:Arial,sans-serif;max-width:960px;margin:0 auto;color:#222;background:#fff;">
    <div style="background:#1a1a2e;padding:20px 28px;border-radius:6px 6px 0 0;">
      <h2 style="margin:0;color:#fff;font-size:20px;font-family:Arial,sans-serif;">E-Invoicing Week in Review</h2>
      <p style="margin:6px 0 0;color:#aaa;font-size:13px;font-family:Arial,sans-serif;">
        Week ending ${weekEnd} &nbsp;|&nbsp; ${sortedCountries.length} countries &nbsp;|&nbsp; ${updates.length} updates tracked
      </p>
    </div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #ddd;border-top:none;border-radius:0 0 6px 6px;">
      <table style="border-collapse:collapse;margin-bottom:28px;"><tr>
        <td style="padding:4px 12px 4px 0;">
          <span style="background:#fce8e6;color:#c5221f;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:Arial,sans-serif;">CRITICAL: ${nCrit}</span>
        </td>
        <td style="padding:4px 12px 4px 0;">
          <span style="background:#fef9e7;color:#b45309;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:Arial,sans-serif;">IMPORTANT: ${nImp}</span>
        </td>
        <td style="padding:4px 0;">
          <span style="background:#e6f4ea;color:#137333;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:Arial,sans-serif;">GOOD TO KNOW: ${nGtk}</span>
        </td>
      </tr></table>
      ${updates.length ? `
      <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:Arial,sans-serif;">
        <thead><tr>
          <th style="${thStyle}width:100px;">Country</th>
          <th style="${thStyle}width:95px;">Priority</th>
          <th style="${thStyle}">Update</th>
          <th style="${thStyle}width:85px;">Effective</th>
          <th style="${thStyle}width:85px;">Published on</th>
          <th style="${thStyle}width:70px;">Source</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>` : `<p style="color:#888;font-size:13px;font-family:Arial,sans-serif;">No updates tracked this week.</p>`}
      <p style="margin-top:28px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px;font-family:Arial,sans-serif;">
        Generated by E-Invoice Agent &nbsp;|&nbsp; Official government sources only &nbsp;|&nbsp; Not legal advice
      </p>
    </div>
  </div>`;
}

// ─── SPOTLIGHT (zero-update days) ─────────────────────────────────────────
function getEInvoiceSpotlight() {
  const prompt = `You are an e-invoicing expert. Today there are no regulatory updates from any country.

Generate a short "E-Invoicing Spotlight" section for a daily briefing email read by e-invoicing product teams and business partners.

Pick 3 different countries and for each write one interesting, accurate, specific fact about their e-invoicing journey.

Good examples:
- Italy processes over 2 billion e-invoices per year via SDI
- Mexico's CFDI uses a government-issued digital seal called a Timbre Fiscal Digital
- Chile was the first country in Latin America to mandate e-invoicing, back in 2003
- Singapore's InvoiceNow is the first PEPPOL network in Asia
- Brazil has 5 different electronic fiscal document types covering goods, services, transport, and fuel

Rules: verified facts only, specific numbers/dates where possible, 2 sentences max per country, vary countries each day, do not always pick the same 3 countries.

Respond ONLY in this exact JSON, no markdown:
{
  "spotlight": [
    { "country": "Country name", "fact": "2 sentence fact." },
    { "country": "Country name", "fact": "2 sentence fact." },
    { "country": "Country name", "fact": "2 sentence fact." }
  ]
}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
  };
  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
  );
  const data  = JSON.parse(response.getContentText());
  const raw   = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(clean).spotlight || []; } catch(e) { return []; }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function getCounts(updates) {
  return {
    nCrit: updates.filter(u => u.category === 'CRITICAL').length,
    nImp:  updates.filter(u => u.category === 'IMPORTANT').length,
    nGtk:  updates.filter(u => u.category === 'GOOD_TO_KNOW').length
  };
}

function buildSubject(counts) {
  const today  = new Date();
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `E-Invoice Brief — ${days[today.getDay()]} ${today.getDate()} ${months[today.getMonth()]} — ${counts.nCrit} Critical, ${counts.nImp} Important, ${counts.nGtk} GTK`;
}

function deduplicateUpdates(updates) {
  const seen = {};
  return updates.filter(u => {
    const key = (u.country + '|' + u.headline).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function getDateWindow() {
  const now = new Date();
  const day = now.getDay();
  let start, end;
  if (day === 1) {
    start = new Date(now); start.setDate(now.getDate() - 3); start.setHours(0,0,0,0);
    end   = new Date(now); end.setDate(now.getDate() - 1);   end.setHours(23,59,59,0);
  } else {
    start = new Date(now); start.setDate(now.getDate() - 1); start.setHours(0,0,0,0);
    end   = new Date(now); end.setDate(now.getDate() - 1);   end.setHours(23,59,59,0);
  }
  return {
    startDate:   start,
    endDate:     end,
    windowLabel: `${formatDate(start)} to ${formatDate(end)}`
  };
}

function getISOWeek() {
  return getISOWeekForDate(new Date());
}

function getISOWeekForDate(d) {
  const date = new Date(d);
  const day  = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getFullYear() + '-W' + String(week).padStart(2, '0');
}

function repairJson(str) {
  try { JSON.parse(str); return str; } catch(e) {}
  let depth = 0, lastValidClose = 0, inString = false, escape = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escape)                { escape = false; continue; }
    if (c === '\\' && inString){ escape = true;  continue; }
    if (c === '"')             { inString = !inString; continue; }
    if (inString)              continue;
    if (c === '{' || c === '[') depth++;
    if (c === '}' || c === ']') { depth--; if (depth === 0) lastValidClose = i; }
  }
  let trimmed = str.substring(0, lastValidClose + 1);
  const updatesMatch = trimmed.match(/([\s\S]*"updates"\s*:\s*\[)([\s\S]*)$/);
  if (updatesMatch) {
    let content = updatesMatch[2];
    let lastBrace = -1, d = 0, ins = false, esc = false;
    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      if (esc)              { esc = false; continue; }
      if (c === '\\' && ins){ esc = true;  continue; }
      if (c === '"')        { ins = !ins;  continue; }
      if (ins)              continue;
      if (c === '{') d++;
      if (c === '}') { d--; if (d === 0) lastBrace = i; }
    }
    if (lastBrace >= 0) {
      trimmed = updatesMatch[1] + content.substring(0, lastBrace + 1) + '], "no_updates": [], "unreachable": [] }';
    }
  }
  try { JSON.parse(trimmed); return trimmed; } catch(e) {}
  const matches = str.match(/\{[^{}]*"country"[^{}]*"summary"[^{}]*\}/g) || [];
  return JSON.stringify({
    updates: matches.map(m => { try { return JSON.parse(m); } catch(e) { return null; } }).filter(Boolean),
    no_updates: [],
    unreachable: []
  });
}

// ─── DEBUG / UTILITY — run manually only, never via trigger ───────────────

function debugGemini() {
  // Use when: API errors, empty responses, 429 quota issues
  const testPayload = {
    contents: [{ parts: [{ text: 'Reply with this exact JSON and nothing else: {"test": "ok"}' }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
  };
  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(testPayload), muteHttpExceptions: true }
  );
  Logger.log('HTTP status: ' + response.getResponseCode());
  Logger.log('Full response: ' + response.getContentText());
}

function listModels() {
  // Use when: debugGemini() returns 404 — shows available model names for your API key
  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`,
    { muteHttpExceptions: true }
  );
  Logger.log(response.getContentText());
}

function clearCache() {
  // Use ONLY when: added a new country, or previous run errored
  // WARNING: next runDailyBrief will call Gemini fresh — results may differ from earlier today
  // Do NOT use just to resend to new email addresses — run runDailyBrief directly instead
  const props    = PropertiesService.getScriptProperties();
  const todayStr = formatDate(new Date());
  props.deleteProperty('daily_cache_' + todayStr);
  Logger.log('Cache cleared for ' + todayStr + '. Next runDailyBrief will fetch fresh from Gemini.');
}

function clearTodaySeenMap() {
  // Always run this immediately after clearCache() for a genuine fresh re-run today
  const props    = PropertiesService.getScriptProperties();
  const seenKey  = 'seen_updates_v2';
  const todayStr = formatDate(new Date());
  let seenMap    = {};
  try { seenMap = JSON.parse(props.getProperty(seenKey) || '{}'); } catch(e) {}
  Object.keys(seenMap).forEach(k => { if (seenMap[k] === todayStr) delete seenMap[k]; });
  props.setProperty(seenKey, JSON.stringify(seenMap));
  Logger.log('Cleared today seenMap entries for ' + todayStr);
}
