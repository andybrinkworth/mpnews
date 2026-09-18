/**
 * Pushes digest entries into their Jekyll collection folders in the
 * mpnews GitHub Pages repo, as Markdown files with frontmatter
 * (including auto-detected tags). Jekyll rebuilds data/*.json from
 * whatever .md files exist — nothing here writes JSON directly.
 *
 * THREE FEEDS, THREE FUNCTIONS:
 *   pushMarketplaceIntel()  — running Doc, twice weekly. WORKING.
 *   pushCompetitorWatch()   — running Doc, weekly (Fridays). WORKING.
 *   pushBookerGroupNews()   — new Doc created each run (weekly). WORKING —
 *                             finds the most recent Doc titled "Booker
 *                             Group..." and pushes its whole body as
 *                             one entry, linked back to that Doc.
 *
 * SETUP (one-off):
 * 1. In script.google.com, create a new project, paste this whole file in.
 * 2. Project Settings > Script Properties, add:
 *      GITHUB_TOKEN            = a GitHub Personal Access Token (repo scope)
 *      GITHUB_REPO             = "andybrinkworth/mpnews"
 *      GITHUB_BRANCH           = "main"
 *      MARKETPLACE_INTEL_DOC_ID = the running Marketplace Intel Doc ID
 *      COMPETITOR_WATCH_DOC_ID  = the running Competitor Watch Doc ID
 * 3. Edit KEYWORD_TAG_MAP below to match what you actually want tagged.
 * 4. Run pushMarketplaceIntel, pushCompetitorWatch and pushBookerGroupNews
 *    once each manually to authorise them. Check the Execution log for
 *    "Found N entries" / "Using Doc" and "Pushed successfully" lines.
 * 5. Add a time-driven trigger for each: pushMarketplaceIntel a couple
 *    of hours after the twice-weekly run, pushCompetitorWatch after the
 *    Friday run, pushBookerGroupNews after the Monday run.
 *
 * TAGGING:
 * Every entry's heading + body text is lower-cased and checked against
 * KEYWORD_TAG_MAP. Any keyword found adds its mapped tag. Simple
 * substring matching, deliberately — predictable and easy to tune.
 */

const KEYWORD_TAG_MAP = {
  'mirakl': 'mirakl',
  'amazon': 'amazon',
  'commission': 'commission-model',
  'marketplace': 'marketplace',
  'dropship': 'dropship',
  'b2b': 'b2b',
  'funding': 'funding',
  'acquisition': 'ma',
  'merger': 'ma',
  'ai': 'ai',
  'personalisation': 'personalisation',
  'personalization': 'personalisation',
  'diy.com': 'diy-com',
  'kingfisher': 'kingfisher',
  'b&q': 'kingfisher',
  'screwfix': 'kingfisher',
  'castorama': 'kingfisher',
  'brico': 'kingfisher',
  'next plc': 'next',
  'bunzlone': 'bunzlone',
  'bunzl': 'bunzlone'
  // Add more "keyword: tag" pairs here as you notice patterns worth tracking.
};

// ---------------------------------------------------------------------
// FEED ENTRY POINTS
// ---------------------------------------------------------------------

function pushMarketplaceIntel() {
  pushRunningDocFeed({
    docIdProperty: 'MARKETPLACE_INTEL_DOC_ID',
    folder: '_marketplace_intel',
    headingPrefix: 'Marketplace Intel — ',
    commitPrefix: 'Add marketplace intel entry — '
  });
}

function pushCompetitorWatch() {
  pushRunningDocFeed({
    docIdProperty: 'COMPETITOR_WATCH_DOC_ID',
    folder: '_competitor_watch',
    headingPrefix: 'Competitor Watch — ',
    commitPrefix: 'Add competitor watch entry — '
  });
}

/**
 * Booker Group News creates a brand NEW Google Doc every run (titled
 * "Booker Group Weekly News Digest — <date>"), rather than appending to
 * a running Doc — so one Doc = one entry here, no date-splitting needed.
 * Finds the most recently created matching Doc, turns its whole body
 * into one entry, and links the entry back to that Doc itself.
 */
function pushBookerGroupNews() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  const branch = props.getProperty('GITHUB_BRANCH') || 'main';

  const DOC_TITLE_CONTAINS = 'Booker Group';
  const LOOKBACK_DAYS = 3;

  const files = DriveApp.searchFiles(
    'title contains "' + DOC_TITLE_CONTAINS + '" and mimeType = "application/vnd.google-apps.document" and trashed = false'
  );

  let latest = null;
  while (files.hasNext()) {
    const f = files.next();
    if (!latest || f.getDateCreated() > latest.getDateCreated()) latest = f;
  }

  if (!latest) {
    Logger.log('No Doc found matching title containing "' + DOC_TITLE_CONTAINS + '".');
    return;
  }

  const ageDays = (Date.now() - latest.getDateCreated().getTime()) / 86400000;
  if (ageDays > LOOKBACK_DAYS) {
    Logger.log('Most recent matching Doc ("' + latest.getName() + '") is ' + Math.round(ageDays) +
      ' days old — older than LOOKBACK_DAYS (' + LOOKBACK_DAYS + '). Not pushing a stale doc.');
    return;
  }

  const docId = latest.getId();
  const docTitle = latest.getName();
  const docUrl = latest.getUrl();
  const dateStr = Utilities.formatDate(latest.getDateCreated(), 'Etc/UTC', 'yyyy-MM-dd');

  Logger.log('Using Doc: "' + docTitle + '" (id ' + docId + ', created ' + dateStr + ')');

  const summary = extractSingleDocBody(docId);
  const entry = { date: dateStr, heading: docTitle, summary: summary, link: docUrl };
  const tags = detectTags(entry.heading + ' ' + entry.summary);
  const slug = slugify(entry.heading);
  const path = '_booker_group_news/' + entry.date + '-' + slug + '.md';
  const markdown = buildFrontmatter(entry, tags);

  Logger.log('Pushing entry "' + entry.heading + '" to ' + path);
  pushTextToGitHub(token, repo, branch, path, markdown, 'Add Booker Group News entry — ' + entry.heading);
}

// For "one new Doc per run" feeds: turns the whole Doc body into one
// markdown blob, skipping the first hash-prefixed line (the Doc's own
// title, already used as this entry's heading) and normalising every
// other "#"-prefixed line to a "### " sub-heading.
function extractSingleDocBody(docId) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  const lines = [];
  let skippedTitle = false;

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const para = child.asParagraph();
      const plainText = para.getText().trim();
      if (!plainText) continue;

      const hashMatch = plainText.match(/^(#{1,6})\s*(.*)$/);
      const hashLevel = hashMatch ? hashMatch[1].length : 0;
      const contentAfterHash = hashMatch ? hashMatch[2].trim() : plainText;

      if (!skippedTitle && hashLevel > 0) {
        skippedTitle = true;
        continue;
      }

      lines.push(hashLevel > 0 ? ('### ' + contentAfterHash) : richTextToMarkdown(para));

    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      const item = child.asListItem();
      const plainText = item.getText().trim();
      if (!plainText) continue;
      const isNumbered = item.getGlyphType() === DocumentApp.GlyphType.NUMBER;
      lines.push((isNumbered ? '1. ' : '- ') + richTextToMarkdown(item));
    }
  }

  return lines.join('\n\n');
}

// ---------------------------------------------------------------------
// SHARED: running-doc feeds (Marketplace Intel, Competitor Watch)
// ---------------------------------------------------------------------

function pushRunningDocFeed(config) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  const branch = props.getProperty('GITHUB_BRANCH') || 'main';
  const docId = props.getProperty(config.docIdProperty);

  Logger.log(config.docIdProperty + ': ' + docId);
  Logger.log('GITHUB_REPO: ' + repo + '  GITHUB_BRANCH: ' + branch);

  const entries = extractEntriesFromDoc(docId, config.headingPrefix);
  Logger.log('Found ' + entries.length + ' entries to push.');

  if (entries.length === 0) {
    Logger.log('No entries found — no date-header line matching "DD MONTH YYYY", ' +
      'and no Heading 1/2 or bold paragraphs either.');
    return;
  }

  entries.forEach(entry => {
    const tags = detectTags(entry.heading + ' ' + entry.summary);
    const slug = slugify(entry.heading);
    const path = config.folder + '/' + entry.date + '-' + slug + '.md';
    const markdown = buildFrontmatter(entry, tags);

    Logger.log('Pushing entry "' + entry.heading + '" to ' + path);
    pushTextToGitHub(token, repo, branch, path, markdown, config.commitPrefix + entry.heading);
  });
}

// ---------------------------------------------------------------------
// SHARED: parsing helpers
// ---------------------------------------------------------------------

const MONTHS = {
  JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04', MAY: '05', JUNE: '06',
  JULY: '07', AUGUST: '08', SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12'
};

// Matches a standalone line like "15 SEPTEMBER 2026" or "18 September 2026",
// tolerating a literal leading "#"/"##" etc. if the Doc has typed one in
// as plain text rather than applying a real heading style.
function parseDateHeading(text) {
  const stripped = text.replace(/^#+\s*/, '').trim();
  const match = stripped.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[2].toUpperCase()];
  if (!month) return null;
  return match[3] + '-' + month + '-' + match[1].padStart(2, '0');
}

function extractEntriesFromDoc(docId, headingPrefix) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  const entries = [];
  let current = null;

  function appendLine(line) {
    if (current) current.summaryLines.push(line);
  }

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const para = child.asParagraph();
      const plainText = para.getText().trim();
      if (!plainText) continue;

      // This Doc types literal "#"/"##"/"###" characters as plain text
      // rather than applying real heading styles — strip any leading
      // hashes off before checking content, so both this and a Doc that
      // uses genuine heading styles (no hashes at all) work the same way.
      const hashMatch = plainText.match(/^(#{1,6})\s*(.*)$/);
      const hashLevel = hashMatch ? hashMatch[1].length : 0;
      const contentAfterHash = hashMatch ? hashMatch[2].trim() : plainText;

      // A new entry starts at its date line (e.g. "15 SEPTEMBER 2026" or
      // "## 18 September 2026"), OR a real Heading 1/2 style, OR a fully-
      // bold paragraph — covers every formatting variant seen so far.
      const dateHeading = parseDateHeading(contentAfterHash);
      const headingStyle = para.getHeading();
      const isTopHeading = headingStyle === DocumentApp.ParagraphHeading.HEADING1 ||
                            headingStyle === DocumentApp.ParagraphHeading.HEADING2;
      const isTitle = !!dateHeading || isTopHeading || isBoldParagraph(para);

      if (isTitle) {
        if (current) entries.push(current);
        current = {
          date: dateHeading || new Date().toISOString().slice(0, 10),
          heading: headingPrefix + contentAfterHash,
          summaryLines: [],
          link: ''
        };
        continue;
      }

      // A real Heading 3+ style, a literal "###"-style prefix, or a short
      // ALL-CAPS line, all read as a sub-section header — render as a
      // markdown heading so the structure survives on the page.
      const isSubHeadingStyle = headingStyle && headingStyle !== DocumentApp.ParagraphHeading.NORMAL &&
                                 !isTopHeading;
      const isHashSubHeader = hashLevel > 0; // any hash prefix that wasn't the date title
      const isAllCapsSubHeader = contentAfterHash.length < 60 &&
                                  contentAfterHash === contentAfterHash.toUpperCase() &&
                                  /[A-Z]/.test(contentAfterHash);

      if (isSubHeadingStyle || isHashSubHeader || isAllCapsSubHeader) {
        appendLine('### ' + contentAfterHash);
      } else {
        appendLine(richTextToMarkdown(para));
      }

    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      const item = child.asListItem();
      const plainText = item.getText().trim();
      if (!plainText) continue;
      const isNumbered = item.getGlyphType() === DocumentApp.GlyphType.NUMBER;
      appendLine((isNumbered ? '1. ' : '- ') + richTextToMarkdown(item));
    }
  }
  if (current) entries.push(current);

  entries.forEach(e => {
    e.summary = e.summaryLines.join('\n\n');
    delete e.summaryLines;
  });

  return entries;
}

function isBoldParagraph(para) {
  const text = para.editAsText();
  const full = text.getText();
  if (!full || !full.trim()) return false;
  const idx = full.search(/\S/);
  const checkIndex = idx === -1 ? 0 : idx;
  return text.isBold(checkIndex) === true;
}

// Walks a Paragraph or ListItem's text runs, preserving hyperlinks as
// markdown [text](url) and bold as **text** — otherwise plain runs of
// getText() lose both, which is how "Links to find out more" bullets
// were silently becoming dead text.
function richTextToMarkdown(el) {
  const text = el.editAsText();
  const full = text.getText();
  if (!full) return '';

  const indices = text.getTextAttributeIndices();
  const parts = [];

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = (i + 1 < indices.length) ? indices[i + 1] - 1 : full.length - 1;
    if (end < start) continue;
    const runText = full.substring(start, end + 1);
    const url = text.getLinkUrl(start);

    if (url) {
      parts.push('[' + runText + '](' + url + ')');
    } else if (text.isBold(start)) {
      parts.push('**' + runText + '**');
    } else {
      parts.push(runText);
    }
  }
  return parts.join('');
}

function detectTags(text) {
  const lower = text.toLowerCase();
  const tags = [];
  Object.keys(KEYWORD_TAG_MAP).forEach(keyword => {
    if (lower.indexOf(keyword) !== -1) {
      const tag = KEYWORD_TAG_MAP[keyword];
      if (tags.indexOf(tag) === -1) tags.push(tag);
    }
  });
  return tags;
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildFrontmatter(entry, tags) {
  const tagsYaml = '[' + tags.map(t => JSON.stringify(t)).join(', ') + ']';
  const front = [
    '---',
    'title: ' + JSON.stringify(entry.heading),
    'date: ' + entry.date,
    'tags: ' + tagsYaml,
    'link: ' + JSON.stringify(entry.link || ''),
    '---',
    '',
    entry.summary,
    ''
  ];
  return front.join('\n');
}

// ---------------------------------------------------------------------
// TEMPORARY DEBUG — remove once formatting is confirmed
// ---------------------------------------------------------------------

function debugInspectCompetitorWatchDoc() {
  const docId = PropertiesService.getScriptProperties().getProperty('COMPETITOR_WATCH_DOC_ID');
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  for (let i = 0; i < Math.min(numChildren, 25); i++) {
    const child = body.getChild(i);
    const type = child.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const para = child.asParagraph();
      const text = para.getText();
      const heading = para.getHeading();
      const bold = text.length > 0 ? para.editAsText().isBold(0) : null;
      Logger.log('[PARAGRAPH] heading=' + heading + ' bold@0=' + bold + ' text="' + text.slice(0, 70) + '"');
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      const item = child.asListItem();
      Logger.log('[LIST_ITEM] glyph=' + item.getGlyphType() + ' text="' + item.getText().slice(0, 70) + '"');
    } else {
      Logger.log('[' + type + ']');
    }
  }
}

// ---------------------------------------------------------------------
// SHARED: GitHub push
// ---------------------------------------------------------------------

function pushTextToGitHub(token, repo, branch, path, textContent, commitMessage) {
  const apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + path;
  const contentBase64 = Utilities.base64Encode(textContent, Utilities.Charset.UTF_8);

  let sha = null;
  try {
    const existing = UrlFetchApp.fetch(apiUrl + '?ref=' + branch, {
      headers: { Authorization: 'token ' + token },
      muteHttpExceptions: true
    });
    if (existing.getResponseCode() === 200) {
      sha = JSON.parse(existing.getContentText()).sha;
    }
  } catch (e) {
    // File doesn't exist yet on first run — fine.
  }

  const body = { message: commitMessage, content: contentBase64, branch: branch };
  if (sha) body.sha = sha;

  const response = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    contentType: 'application/json',
    headers: { Authorization: 'token ' + token },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  Logger.log('GitHub response code for ' + path + ': ' + code);
  if (code >= 200 && code < 300) {
    Logger.log('Pushed successfully: ' + path);
  } else {
    Logger.log('GitHub push failed (' + code + '): ' + response.getContentText());
  }
}
