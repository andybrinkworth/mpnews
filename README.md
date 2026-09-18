# Marketplace Intelligence Briefing

A GitHub Pages site (built with Jekyll) that surfaces three
Cowork-generated digests (Marketplace Intel, Booker Group News,
Competitor Watch) in one place, auto-updating whenever a new digest
lands.

**This is a personal reading tool, not a Marketplace team resource** —
the page header says so, and it's worth keeping in mind if you ever
think about sharing the link more widely.

## How it fits together

```
Cowork task runs  -->  writes/updates a Google Doc  -->  emails via Gmail
                                    |
                        Apps Script trigger fires
                                    |
                 reads the Doc, splits into entries,
              auto-detects tags from a keyword list,
                writes one Markdown file per entry
                                    |
        pushes each .md file into a collection folder
             (_marketplace_intel/, _booker_group_news/,
                        _competitor_watch/)
                                    |
        GitHub Pages runs Jekyll, which rebuilds
        data/*.json from whatever .md files now exist
                                    |
              index.html fetches that JSON, unchanged
```

Nothing hand-edits JSON any more. Dropping a `.md` file into the right
folder **is** the update — Jekyll regenerates the feed automatically
on the next Pages build (which GitHub triggers on every push).

## 1. Publish this repo to GitHub Pages

1. Create a new **public** GitHub repo and push these files to it.
2. Repo Settings > Pages > Source: deploy from branch `main`, folder `/ (root)`.
3. Your site will be live at `https://<username>.github.io/<repo-name>/`.

No extra config needed — `_config.yml` is all Jekyll needs to know
about the three collections.

## 2. Stop it being indexed

Two things already in this repo handle that:
- `robots.txt` (`Disallow: /`) — asks well-behaved crawlers not to index it.
- `<meta name="robots" content="noindex, nofollow">` in `index.html` — belt and braces.

**Important:** this only discourages search engines. It does not
password-protect the page — anyone with the direct URL can open it.
If that's not good enough for what's in the digests (e.g. competitor
intel), the honest options are a private repo on GitHub Team/Enterprise
(Pages can then be restricted to your org), or adding a real auth layer
in front of it.

## 3. Wire up auto-updates (one digest shown as an example)

`apps-script/marketplace-intel-push.gs` is a worked example for the
Marketplace Intel digest, since that one already writes into a single
running Doc. Setup steps are commented at the top of the file:

1. Create/attach an Apps Script project, paste in the script.
2. Set four Script Properties: `GITHUB_TOKEN`, `GITHUB_REPO`,
   `GITHUB_BRANCH`, `DOC_ID`.
3. Edit `KEYWORD_TAG_MAP` at the top of the script — this is where
   tagging actually happens (see below).
4. Run it once manually to authorise, then add a time-driven trigger
   just after each Cowork run.

The other two digests (Booker Group News, Competitor Watch) create a
**new** Doc each run rather than updating one running Doc — the same
push pattern applies, but the script needs to find *this run's* Doc
first (e.g. by searching Drive for a file created in the last 24
hours matching the digest's naming pattern) before extracting and
pushing it. Happy to write that version once the first one is working
and you're happy with how entries are being tagged.

## 4. How tagging works

Each entry is a Markdown file with frontmatter like this:

```yaml
---
title: "Amazon expands B2B marketplace commission tiers"
date: 2026-09-15
tags: [amazon, commission-model, marketplace]
link: ""
---

Summary text goes here.
```

`tags` is a plain YAML list. The Apps Script fills it in automatically
by checking the entry's text against `KEYWORD_TAG_MAP` — a simple
"if this word appears, add this tag" list you maintain at the top of
the script. It's substring matching, not anything clever, which is
deliberate: it stays predictable, and you can see exactly why an entry
got a given tag.

To improve tagging over time, just add more `'keyword': 'tag'` lines
to that map — no site changes needed, since Jekyll picks up whatever
tags are in the frontmatter and the search/filter UI already reads
from there.

On the page itself: the search box matches heading, summary and tags;
clicking a tag chip filters the current feed to that tag (click again
to clear).

## 5. Editing the look

`index.html` holds all the styling — colours, type and layout tokens
are in the `<style>` block at the top. It has no Jekyll frontmatter,
so it's served as-is; only the `data/*.json` files and the collection
folders go through the Jekyll build.
