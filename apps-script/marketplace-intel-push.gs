/**
 * Pushes each entry from the Marketplace Intel Google Doc into its own
 * Markdown file (with frontmatter, including auto-detected tags) inside
 * _marketplace_intel/ in the GitHub Pages repo. Jekyll picks these up
 * automatically on the next build and regenerates data/marketplace-intel.json
 * — there is no JSON to hand-edit any more.
 *
 * SETUP (one-off):
 * 1. In script.google.com, create a new project.
 * 2. Project Settings > Script Properties, add:
 *      GITHUB_TOKEN   = a GitHub Personal Access Token (repo scope)
 *      GITHUB_REPO    = "your-username/your-repo-name"
 *      GITHUB_BRANCH  = "main"
 *      DOC_ID         = the Google Doc ID for the marketplace intel doc
 * 3. Edit KEYWORD_TAG_MAP below to match the topics you actually want
 *    tagged — this is the bit that makes tagging "automatic": add a
 *    keyword, pick the tag it should produce, done.
 * 4. Run `pushMarketplaceIntel` once manually to authorise it.
 * 5. Add a time-driven trigger to run it shortly after each Cowork
 *    task completes.
 *
 * TAGGING:
 * Every entry's heading + body text is lower-cased and checked against
 * KEYWORD_TAG_MAP. Any keyword found adds its mapped tag — an entry can
 * pick up several tags. This is intentionally simple (substring match,
 * not NLP) so it stays predictable and easy for you to tune by eye.
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
  'personalization': 'personalisation'
  // Add more "keyword: tag" pairs here as you notice patterns worth tracking.
};

function pushMarketplaceIntel() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  const branch = props.getProperty('GITHUB_BRANCH') || 'main';
  const docId = props.getProperty('DOC_ID');

  Logger.log('DOC_ID: ' + docId);
  Logger.log('GITHUB_REPO: ' + repo + '  GITHUB_BRANCH: ' + branch);

  const entries = extractEntriesFromDoc(docId);
  Logger.log('Found ' + entries.length + ' entries to push.');

  if (entries.length === 0) {
    Logger.log('No entries found — the Doc has no date-header line matching "DD MONTH YYYY" (e.g. "15 SEPTEMBER 2026"), and no Heading 1/2 or bold paragraphs either.');
    return;
  }

  entries.forEach(entry => {
    const tags = detectTags(entry.heading + ' ' + entry.summary);
    const slug = slugify(entry.heading);
    const path = '_marketplace_intel/' + entry.date + '-' + slug + '.md';
    const markdown = buildFrontmatter(entry, tags);

    Logger.log('Pushing entry "' + entry.heading + '" to ' + path);
    pushTextToGitHub(token, repo, branch, path, markdown,
      'Add marketplace intel entry — ' + entry.heading);
  });
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

const MONTHS = {
  JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04', MAY: '05', JUNE: '06',
  JULY: '07', AUGUST: '08', SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12'
};

// Matches a standalone line like "15 SEPTEMBER 2026" — the date header
// this Doc actually uses to mark the start of each digest run. Returns
// "YYYY-MM-DD" or null if the text doesn't match that shape.
function parseDateHeading(text) {
  const match = text.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[2].toUpperCase()];
  if (!month) return null;
  return match[3] + '-' + month + '-' + match[1].padStart(2, '0');
}

function extractEntriesFromDoc(docId) {
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
      const text = para.getText().trim();
      if (!text) continue;

      // A new digest run starts at its date line (e.g. "15 SEPTEMBER 2026").
      // Real Heading 1/2 style or a fully-bold paragraph also counts, in
      // case the Doc's formatting changes in future.
      const dateHeading = parseDateHeading(text);
      const headingStyle = para.getHeading();
      const isHeadingStyle = headingStyle === DocumentApp.ParagraphHeading.HEADING1 ||
                              headingStyle === DocumentApp.ParagraphHeading.HEADING2;
      const isTitle = !!dateHeading || isHeadingStyle || isBoldParagraph(para);

      if (isTitle) {
        if (current) entries.push(current);
        current = {
          date: dateHeading || new Date().toISOString().slice(0, 10),
          heading: 'Marketplace Intel — ' + text,
          summaryLines: [],
          link: ''
        };
        continue;
      }

      // Short ALL-CAPS lines (e.g. "TOP 3 HEADLINES", "WIDER ROUNDUP") read
      // as sub-section headers in this Doc, even though they're not styled
      // as headings — render them as markdown headings so the structure
      // survives on the page.
      const isSubHeader = text.length < 60 && text === text.toUpperCase() && /[A-Z]/.test(text);
      appendLine(isSubHeader ? ('### ' + text) : text);

    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      const item = child.asListItem();
      const text = item.getText().trim();
      if (!text) continue;
      const isNumbered = item.getGlyphType() === DocumentApp.GlyphType.NUMBER;
      appendLine((isNumbered ? '1. ' : '- ') + text);
    }
  }
  if (current) entries.push(current);

  // Turn each entry's collected lines into a proper markdown body —
  // blank line between blocks so paragraphs/headings/lists render
  // correctly once Jekyll converts this file's markdown to HTML.
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
