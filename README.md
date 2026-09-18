# Marketplace Intelligence Briefing

A GitHub Pages site (built with Jekyll) that surfaces all three
Cowork-generated digests (Marketplace Intel, Competitor Watch, Booker
Group News) in one place, auto-updating whenever a new digest lands.

**This is a personal reading tool, not a Marketplace team resource** —
the page header says so.

## How it fits together

```
Cowork task runs  -->  writes/updates a Google Doc  -->  emails via Gmail
                                    |
                        Apps Script trigger fires
                                    |
       reads the Doc, splits into entries at each dated
   section, converts headings/lists/links to real Markdown,
              auto-detects tags from a keyword list
                                    |
        pushes each entry as a .md file into a collection
      folder (_marketplace_intel/, _competitor_watch/, ...)
                                    |
        GitHub Pages runs Jekyll, which rebuilds
        data/*.json from whatever .md files now exist
                                    |
              index.html fetches that JSON, renders it as HTML
```

## 1. Publish this repo to GitHub Pages

1. Create a new **public** GitHub repo and push these files to it.
2. Repo Settings > Pages > Source: deploy from branch `main`, folder `/ (root)`.
3. Your site will be live at `https://<username>.github.io/<repo-name>/`.

## 2. Stop it being indexed

- `robots.txt` (`Disallow: /`) and `<meta name="robots" content="noindex, nofollow">`
  in `index.html` discourage search engines. Neither password-protects
  the page — anyone with the direct URL can open it.

## 3. Set up the Apps Script

`apps-script/digest-push.gs` is one script covering all three feeds —
paste the whole file into a single Apps Script project (script.google.com).

Script Properties needed (Project Settings > Script Properties):

| Property | Value |
|---|---|
| `GITHUB_TOKEN` | a GitHub Personal Access Token (repo scope) |
| `GITHUB_REPO` | `andybrinkworth/mpnews` |
| `GITHUB_BRANCH` | `main` |
| `MARKETPLACE_INTEL_DOC_ID` | the running Marketplace Intel Doc's ID |
| `COMPETITOR_WATCH_DOC_ID` | the running Competitor Watch Doc's ID |

Booker Group News doesn't need a Doc ID property — it creates a new Doc
each run, so the script finds the most recent one titled "Booker
Group..." itself (see `DOC_TITLE_CONTAINS` in `pushBookerGroupNews` if
that naming ever changes).

Run `pushMarketplaceIntel`, `pushCompetitorWatch` and
`pushBookerGroupNews` once each manually to authorise them and confirm
entries are found, then add a time-driven trigger for each — a couple
of hours after that feed's scheduled Cowork run.

## 4. How tagging works

Every entry gets a `tags` array in its frontmatter, filled in
automatically by checking the entry's text against `KEYWORD_TAG_MAP`
at the top of the script — a plain `'keyword': 'tag'` list you extend
as you notice patterns worth tracking. Substring matching, deliberately
simple and predictable rather than clever.

On the page: the search box matches heading, summary and tags; clicking
a tag chip filters the current feed to that tag.

## 5. Formatting

Entries are converted to real Markdown, not squashed plain text:
paragraph breaks are preserved, short ALL-CAPS lines (or real Heading
3+ styles) become `### ` sub-headings, numbered/bulleted list items are
kept as lists, and hyperlinks inside the Doc (e.g. "Links to find out
more") are preserved as real links rather than being silently dropped.
Jekyll converts that Markdown to HTML at build time, and `index.html`
renders it directly — styling for headings/lists inside an entry lives
in the `.body` rules in its `<style>` block.

## 6. Editing the look

`index.html` holds all the styling — colours, type and layout tokens
are in the `<style>` block at the top.
