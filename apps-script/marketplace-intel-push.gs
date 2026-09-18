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

  const entries = extractEntriesFromDoc(docId);

  entries.forEach(entry => {
    const tags = detectTags(entry.heading + ' ' + entry.summary);
    const slug = slugify(entry.heading);
    const path = '_marketplace_intel/' + entry.date + '-' + slug + '.md';
    const markdown = buildFrontmatter(entry, tags);

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

function extractEntriesFromDoc(docId) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  const entries = [];
  let current = null;
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;

    const para = child.asParagraph();
    const heading = para.getHeading();
    const text = para.getText().trim();
    if (!text) continue;

    const isHeading = heading === DocumentApp.ParagraphHeading.HEADING1 ||
                       heading === DocumentApp.ParagraphHeading.HEADING2;

    if (isHeading) {
      if (current) entries.push(current);
      current = { date: today, heading: text, summary: '', link: '' };
    } else if (current) {
      current.summary += (current.summary ? ' ' : '') + text;
    }
  }
  if (current) entries.push(current);

  return entries;
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
  if (code >= 200 && code < 300) {
    Logger.log('Pushed successfully: ' + path);
  } else {
    Logger.log('GitHub push failed (' + code + '): ' + response.getContentText());
  }
}
