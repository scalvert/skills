---
name: draft-reply
description: Draft a reply or a post for a chat thread, an email or a comment, in your voice and ready to paste. Reads the whole thread, checks the facts before it writes, leads with the answer, formats for where the text will go, and delivers each message as a plain text file and on the clipboard so the line breaks survive. Use when asked to help me reply, help me respond, draft a message, write an update I can post, or answer this thread. Never sends anything.
---

# Draft a reply

Input: a thread or a message, and what the user wants to say. Output: one plain text file per message, with the first one on the clipboard.

The user sends it. Never send, post or schedule a message for the user, even when a tool can.

## Steps

### 1. Read the thread and the audience

Read every message in the thread, from the first one. Note who is in it: a team, an executive, a customer or the public. That decides the length and what can be said.

- An executive wants the answer and the decision they must make. Leave out how you found it.
- A customer or partner thread gets a professional tone and no internal detail.
- A team thread can be short and direct.

### 2. Check the facts first

Verify every fact the reply will state, and every claim in the thread that the reply answers. Use `check-claims` when the thread makes several. When the answer can be looked up, look it up and state it. Do not hedge about something you can check.

### 3. Find the user's voice

Read a few of the user's own messages in the same channel or thread. Match how they open, how long their messages are and how they format. When the user points to an earlier post of the same kind, such as the last release announcement, use it as the model.

### 4. Write

- Put the answer or the request first.
- Use a few short bullets for parallel points, and plain sentences for the rest.
- Keep it as short as the question allows.
- Use first person. Do not invent feelings, anecdotes, thanks or praise the user did not give you.
- Start with the content. Leave out an opener such as "In short" or "Quick update".
- Use no emoji, blockquotes or dashes, unless the user's own messages use them.
- Name things by what they are. A label from this conversation means nothing to the reader.

Follow `write-clearly`.

### 5. Format for the destination

| Destination | Format |
|---|---|
| Slack and similar chat | `*bold*` with single asterisks, `_italic_`, backticks for code, `- ` for bullets, full URLs. Leave out headings, tables, `**bold**` and `[text](url)` links, because chat shows them as typed. |
| Email | Plain paragraphs. No Markdown. |
| GitHub | GitHub Markdown, with code in backticks. |
| A document comment | Plain text. Quote the passage you reply to on its own line first. |

Put a blank line between paragraphs in every format.

### 6. Deliver

Chat views and Markdown previews collapse line breaks, so text copied from them arrives as one block.

1. Write each message to its own plain text file, such as `reply-1.txt`.
2. On macOS, put the first one on the clipboard: `pbcopy < reply-1.txt`.
3. Check it: `pbpaste | wc -l` matches the file.
4. In chat, give the file paths and show each message in a fenced `text` block.

Below the drafts, list the lines that state an opinion or a feeling as the user's, so they can change them. Say which facts you checked and how.

## Done when

- Every fact in the reply was checked, or is marked as unchecked.
- Each message is in its own plain text file, and the first is on the clipboard with its line breaks.
- Nothing was sent.
