---
name: apply-change-list
description: Apply a list of requested changes from a client or a stakeholder to a site or an app, and nothing else. Turns their document, email or notes into a checklist in their words, asks about anything unclear before starting, makes each change, shows it in a preview, and deploys only when you say so. Use when asked to make the changes in this document, apply this feedback, here are more changes from the client, or make these edits and deploy.
---

# Apply a change list

Input: a document, an email, a message or notes that list changes, and the repo to change. Output: a checklist with the state of every item, and a preview to approve.

## Steps

### 1. Read the whole request

Read every page of every file the user gave you, including images and comments. A PDF or a word-processor file may need to be converted to text first. Say when you could not read part of it.

### 2. Write the checklist

One item per change, in the requester's own words, with where it applies and where in their document it came from. Split an item that asks for two things.

Then mark the items you cannot act on yet:

- **Unclear:** two readings are possible.
- **Conflicting:** it disagrees with another item, or with an earlier decision.
- **Missing something:** it needs a file, a photo, some text or an account you do not have.

Ask about these before you start. Large files such as video often cannot be attached to a chat, so ask how the user wants to hand them over.

### 3. Apply one item at a time

Make the change the item asks for. Do not improve nearby text, restyle a section or fix something else while you are there. When you see something worth changing that is not on the list, add it to a separate list of suggestions.

Keep the site's existing components, styles and tone. A change to the wording keeps the requester's wording.

### 4. Check each item

Open the changed page and look at it at phone and desktop widths. Take a screenshot. Confirm that the change is there and that nothing next to it moved.

### 5. Show a preview

Push the branch and give the user the preview URL, with the checklist:

| Item | State | Where to see it |
|---|---|---|
| The requester's words | Done, not done or needs an answer | The page, or the screenshot |

The user, or their client, approves the preview.

### 6. Deploy when asked

Deploying to production changes what the public sees. Do it only when the user says to, in this conversation, for this set of changes. Then check the live site: the changed pages load, the changes are there, and the version or build marker is the new one.

### 7. Report

Give the final checklist, the suggestions list, and anything the requester still has to supply.

## Done when

- Every item in the request has a row and a state.
- Nothing changed that is not on the list.
- The live site shows the changes, when the user asked for a deploy, and was not deployed when they did not.
