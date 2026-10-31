---
name: write-linkedin-post
description: Write or revise LinkedIn posts that read as if a person wrote them, with a hook before the see-more fold, plain text that LinkedIn displays as written, a source for every claim, and native media. Includes a script that checks length, the fold, and formatting LinkedIn won't render. Use when asked to write, draft, revise, or plan a LinkedIn post or a series of posts, for example to share a project, release, video, talk, or article. Never posts anything.
---

# Write a LinkedIn post

Draft posts the user publishes themselves. Never post, schedule, or message anyone on the user's behalf, even if a tool could.

## 1. Gather before writing

- **The subject.** Read what the post is about: the README, docs page, changelog, release notes, script, or transcript. Don't write from memory.
- **One source per claim.** Every factual claim (what it does, how, numbers, names) needs a source you read. Drop a claim you can't source, or ask.
- **What's actually new.** Check release dates or the changelog before calling anything "new", "just shipped", or "launched". A feature from an older release is "how X works", not news.
- **The link and the media.** Find the one page the reader should open, and check that the URL resolves. Find the media to attach, such as a video, image, or PDF.
- **The author's voice.** Use first person. Don't invent anecdotes, feelings, results, or numbers the user didn't give you.

## 2. Shape the post

Use this order. Drop any part that has nothing real in it.

1. **The hook.** LinkedIn folds a post after about 200 characters (fewer on mobile), behind "...see more". The first paragraph must stand on its own above the fold. State the reader's problem or the concrete thing, in plain words. Don't open with "I'm excited to announce" or a question for engagement.
2. **What it is.** One or two sentences, with the exact name of the project or feature.
3. **How it works.** Use a numbered list for a sequence of steps, and short paragraphs otherwise. Use the names the docs use.
4. **The proof.** Say what the media shows, and say it's real when it is ("a real Claude Code session"). Label anything illustrative.
5. **The link.** Give the full URL, on its own or at the end of a sentence.
6. **In a series:** say which post this is, and name the next one. The last post says where to find all of them.

Aim for 800 to 1,500 characters. LinkedIn's limit is 3,000.

## 3. Format for LinkedIn

LinkedIn shows the text as typed and renders no Markdown.

- No `**bold**`, `_italics_`, headings, backticks, or `[text](url)` links. They appear as literal characters. Write code names and file names as plain words: docs_fetch, SKILL.md.
- No "bold" or "italic" Unicode letters. Screen readers spell them out, and search doesn't find them.
- Use a blank line between paragraphs. Use `1.` lists for steps, and plain sentences for everything else.
- No emoji or hashtags unless the user asks for them. If they do, put at most three hashtags at the end.
- Typing a name doesn't tag the person or company. Write the name, and tell the user to tag it in LinkedIn's editor.
- Follow the write-clearly skill (no em dashes, no AI phrasing, plain words) if it's installed.

## 4. Media

- **Upload media natively.** For a video, the user uploads the file to LinkedIn so it plays in the feed, and doesn't post a link to a player. Feed videos start muted, so the video needs burned-in captions or a caption file.
- **Name the file.** Give the exact file to attach with each post.
- **Pages may lag.** If the linked page won't show the media yet, for example until a release, say so in the notes.

## 5. Check, then deliver

Run the check on the draft file. `<skill>` is the folder that holds this SKILL.md:

```sh
node <skill>/scripts/check-post.mjs posts.md     # or pipe one post on stdin
```

In a Markdown file, each fenced block tagged `text` is one post. Any other file is one post. For each post, the script prints the length and what shows above the fold. It flags these:

- over 3,000 characters;
- a hook that runs past the fold;
- Markdown that LinkedIn won't render;
- Unicode bold letters, emoji, and dashes;
- more than three hashtags;
- stock openers and engagement bait.

Errors exit 1. Fix each flag, or keep it for a reason you tell the user. Then run write-clearly's script check, if it's installed. Open every URL in the posts and confirm it resolves.

Deliver the drafts in a Markdown file with one fenced `text` block per post. Above the blocks, add short notes: the media for each post, the posting order and spacing, and anything the user must do in LinkedIn's editor, such as tags. In chat, give the file path and a one-line summary of each post. Don't paste the full posts unless asked.
