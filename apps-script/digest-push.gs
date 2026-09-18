/**
 * Pushes digest entries into their Jekyll collection folders in the
 * mpnews GitHub Pages repo, as Markdown files with frontmatter
 * (including auto-detected tags). Jekyll rebuilds data/*.json from
 * whatever .md files exist — nothing here writes JSON directly.
 *
 * THREE FEEDS, THREE FUNCTIONS:
 *   pushMarketplaceIntel()  — running Doc, twice weekly. WORKING.
 *   pushCompetitorWatch()   — running Doc, weekly (Fridays). WORKING.
 *   pushBookerGroupNews()   — creates a NEW Doc each run (Mondays).
 *                             STUB — see the comment on that function;
 *                             no real Doc exists yet to build against.
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
 * 4. Run pushMarketplaceIntel and pushCompetitorWatch once each manually
 *    to authorise them. Check the Execution log for "Found N entries"
 *    and "Pushed successfully" lines.
 * 5. Add a time-driven trigger for each: pushMarketplaceIntel a couple
 *    of hours after the twice-weekly run, pushCompetitorWatch a couple
 *    of hours after the Friday run.
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
 * STUB — not wired up yet.
 *
 * Booker Group News creates a brand NEW Google Doc every Monday run,
 * rather than appending to one running Doc, so this needs a different
 * approach: search Drive for the most recently created Doc matching
 * this run, then treat its whole body as a single entry (no need to
 * split by date header, since one Doc = one week's entry).
 *
 * This can't be finished blind — we don't yet know the real title
 * Cowork gives these Docs, or exactly how it formats sub-sections
 * (plain paragraphs vs real headings, whether it uses bullet lists,
 * whether links are embedded). Once the Monday task has actually run
 * once, either:
 *   a) tell me the Doc's title/ID and I'll finish this properly, or
 *   b) fill in DOC_TITLE_CONTAINS below yourself and adjust the
 *      parsing loop to match what you see in the real Doc — it can
 *      mostly reuse richTextToMarkdown/isBoldParagraph/detectTags
 *      from this file.
 */
function pushBookerGroupNews() {
  const DOC_TITLE_CONTAINS = 'Booker Group'; // adjust once you see the real title
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
    Logger.log('No Doc found matching title containing "' + DOC_TITLE_CONTAINS + '". ' +
      'This is expected until the Monday task has run at least once — check back after that, ' +
      'or tell Claude the real Doc title/ID once you have one.');
    return;
  }

  const ageDays = (Date.now() - latest.getDateCreated().getTime()) / 86400000;
  if (ageDays > LOOKBACK_DAYS) {
    Logger.log('Most recent matching Doc ("' + latest.getName() + '") is ' + Math.round(ageDays) +
      ' days old — older than LOOKBACK_DAYS (' + LOOKBACK_DAYS + '). Not pushing a stale doc. ' +
      'Adjust LOOKBACK_DAYS if this is wrong.');
    return;
  }

  Logger.log('Found candidate Doc: "' + latest.getName() + '" (id ' + latest.getId() + ', created ' + latest.getDateCreated() + '). ' +
    'Parsing logic for this feed is not finished yet — see the comment on pushBookerGroupNews.');
  // TODO once we've seen a real Doc: extract its body (reuse
  // richTextToMarkdown / isBoldParagraph / detectTags below), build one
  // entry from the whole thing, and push to _booker_group_news/.
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

// Matches a standalone line like "15 SEPTEMBER 2026" or "18 September 2026".
function parseDateHeading(text) {
  const match = text.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
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

      // A new entry starts at its date line (e.g. "15 SEPTEMBER 2026"),
      // OR a real Heading 1/2 style, OR a fully-bold paragraph — covers
      // both digests' actual formatting plus any future variation.
      const dateHeading = parseDateHeading(plainText);
      const headingStyle = para.getHeading();
      const isTopHeading = headingStyle === DocumentApp.ParagraphHeading.HEADING1 ||
                            headingStyle === DocumentApp.ParagraphHeading.HEADING2;
      const isTitle = !!dateHeading || isTopHeading || isBoldParagraph(para);

      if (isTitle) {
        if (current) entries.push(current);
        current = {
          date: dateHeading || new Date().toISOString().slice(0, 10),
          heading: headingPrefix + plainText,
          summaryLines: [],
          link: ''
        };
        continue;
      }

      // A real Heading 3+ style, or a short ALL-CAPS line, reads as a
      // sub-section header (e.g. "TOP 3 HEADLINES", "### DIY.com") —
      // render as a markdown heading so structure survives on the page.
      const isSubHeadingStyle = headingStyle && headingStyle !== DocumentApp.ParagraphHeading.NORMAL &&
                                 !isTopHeading;
      const isAllCapsSubHeader = plainText.length < 60 && plainText === plainText.toUpperCase() &&
                                  /[A-Z]/.test(plainText);

      if (isSubHeadingStyle || isAllCapsSubHeader) {
        appendLine('### ' + plainText);
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
