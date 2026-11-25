---
name: write-clearly
description: Write or rewrite clear, plain prose that reads as if a person wrote it, for any audience. Covers docs, specs, PR descriptions, review comments, messages, proposals and personal writing. Combines plain-language and Simplified Technical English principles with a pass that removes AI-writing patterns, plus a script that checks the mechanical rules. Use when asked to write, rewrite, edit, tighten or humanize text, and before another skill returns prose to a person.
---

# Write clearly

The goal is writing that is easy to understand on the first read and sounds like a person wrote it. Use technical-writing discipline without making every document sound like an aircraft maintenance manual.

## Default behavior

- Return only the finished prose unless the user asks for an audit, an explanation, alternatives, or a draft history.
- Preserve the source's facts, meaning, links, citations, names, numbers, dates, and intended claims.
- Never invent facts, sources, examples, quotes, or confidence.
- Match the audience, purpose, medium, and appropriate level of formality.
- When the user provides a writing sample, study it first. Match its natural sentence rhythm, vocabulary, punctuation, and level of directness unless the user asks for a different style.
- Do not add drafting commentary, process notes, generic encouragement, or a closing such as "I hope this helps."

## Process

1. Identify the purpose, the audience, and the action or understanding the writing should produce.
2. Separate facts from opinions, assumptions, requests, and open questions.
3. Put the main point first. Lead with the answer, problem, decision, or request.
4. Organize the content around the reader's path through the idea, not the order in which the writer thought of it.
5. Rewrite for clarity and natural voice.
6. Run the plain-language and humanizer checks below, then the script check.
7. Verify that the final version introduces no unsupported claim and contains no avoidable AI patterns.

## Clarity and plain language

- Express one main idea per sentence.
- Use concrete subjects and strong verbs. Name the actor.
- Prefer active voice, present tense, and ordinary words. Use "is," "are," "has," and "can" when they are the clearest choice.
- Remove filler such as "in order to," "due to the fact that," "it is important to note," and "has the ability to."
- Replace abstract nouns with verbs when that makes the sentence clearer.
- Define a necessary technical term once, then use the same term consistently. Do not cycle through synonyms for variety when the concepts are the same.
- Break noun clusters longer than three words into a clearer phrase.
- Keep one topic per paragraph. Delete a sentence that only repeats its heading.
- Use examples when they make an abstract concept easier to understand. Do not invent examples when they would add factual claims.
- Keep procedural sentences near 20 words and descriptive sentences near 25 words, as targets, not rigid limits.
- Use articles and demonstratives. Do not remove "a," "the," "this," or "these" just to shorten a sentence.
- State warnings, prerequisites, and conditions before the action they govern.

## Proportional technical-writing rules

Apply ASD-STE100 Simplified Technical English principles in proportion to the audience and document type. Use the principles, not the controlled vocabulary.

For technical, operational, or safety-sensitive writing, be stricter:

- Use one meaning per term and one term per concept.
- Give one instruction per sentence, and use numbered steps for procedures.
- Put prerequisites before steps, and state the expected result after an important action.
- Avoid ambiguous pronouns, implied actors, and vague references such as "it," "they," or "the above" when the referent is unclear.
- Use exact names for APIs, fields, commands, products, and system components.
- Preserve required technical terms, but explain them when the audience may not know them.

For general, persuasive, creative, or personal writing, keep the same preference for clarity but allow more voice, variation, emotion, and rhythm. Do not flatten writing that is intentionally informal or personal.

## Humanizer pass

Generated text drifts toward the most likely sentence. It replaces a specific, unusual fact with a generic, positive one, so the subject becomes vaguer and more inflated at the same time. Readers who notice the patterns below stop trusting the rest of the text. Most of them come from Wikipedia's field guide, [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).

Fix the sentence, not the word. Each pattern usually marks an empty claim. Swapping "delve into" for "dig into" keeps the empty sentence and only hides the sign. Replace the claim with the specific fact it stands in for, or cut it.

### Content

- Claims about significance and legacy: "plays a pivotal role," "marks a shift," "reflects broader trends," "sets the stage for," "a testament to," "an indelible mark," "the evolving landscape." State what happened. Say what it means only when a source says so.
- Analysis attached to a fact with an "-ing" clause: "..., highlighting its importance," "ensuring," "reflecting," "showcasing," "contributing to," "fostering." Cut it, or make it a separate sentence with evidence.
- Vague association: "associated with," "in connection with," or "connected to" when you know the actual relation. Write "Doe ran ExampleCorp," not "Doe was associated with ExampleCorp's leadership."
- Vague attribution and inflated consensus: "experts argue," "industry reports," "observers have cited," "several sources" for one source, or "such as" before a list that is complete. Name the source or drop the claim.
- Coverage instead of content: saying that a source covers, features or identifies something instead of saying what it says.
- Promotional language and unsupported praise such as "groundbreaking," "vibrant," "seamless," or "world-class."
- Formula endings: "Despite these challenges," "faces several challenges," "continues to evolve," a "Future outlook" section, or a generic positive conclusion that adds no fact or decision.
- Disclaimers about sources: "based on available information," "not widely documented," "while specific details are limited." If you did not find something, say once what you checked and what was missing.
- Corrective framings nobody asked for: "X should be treated as A rather than B," "this does not by itself establish," "Y rather than X." State what is true. Use a contrast only when the reader likely holds the wrong view.

### Language

- AI vocabulary. These are strong signs on their own: "delve," "tapestry," "testament," "underscore," "showcase," "pivotal," "intricate," "interplay," "meticulous," "garner," "foster," "multifaceted," "deep dive," and "landscape" as an abstract noun. These are fine alone but a sign in a cluster: "additionally" at the start of a sentence, "align with," "bolster," "crucial," "emphasize," "enduring," "enhance," "highlight," "robust," "valuable," "leverage," "prioritize," "quietly," "steady," and "resonate." The favored words change with each model generation. The script holds the full list.
- "Serves as," "stands as," "functions as," "represents," "marks," "boasts," "features," "offers," or "holds the distinction of" where "is" or "has" would do.
- Negative parallelisms: "not only ... but also," "it's not just X, it's Y," "it's not X, it's Y," and "no X, no Y, just Z."
- "Why this matters," "this matters because," and "the distinction matters." Say the consequence instead.
- Forced groups of three when two items or a normal sentence would be more natural.
- False ranges such as "from X to Y" when the endpoints are not on a meaningful scale.
- Excessive synonym cycling, hedging, signposting such as "In this section, we will discuss," and meta-commentary.
- Trailing negations such as "no guessing" or "no wasted motion" instead of a complete clause.
- Staccato fragments and manufactured punchlines. Use a short sentence for emphasis only when it sounds natural.
- A run of short sentences that are all about the same length. Current models write this way, so a sentence-length target is a ceiling, not a mold. Vary the length, and join two short sentences when they carry one idea.
- Aphorisms and abstract formulas that make an ordinary point sound profound.

### Formatting

- Headings in title case when sentence case is enough, or more than one top-level heading.
- Emoji, decorative bolding, and lists of bold labels followed by colons, unless the requested format requires them.
- Em dashes, en dashes, and double hyphens used as punctuation. Use a period, comma, colon, parentheses, or a clearer sentence.
- Curly quotes and apostrophes in Markdown, code comments, commit messages, or terminal output. Leave them in text whose editor inserts them.

### Chat left in the text

- Replies to the person who asked for the text: "Certainly!", "Great question," "You're absolutely right," "I hope this helps," "Would you like me to," "Here is a detailed breakdown."
- Instructions to that person left in the deliverable, such as "Delete this section before submitting" or "Customize this further."
- Unfilled placeholders such as "[Your Name]," "[Year]," "2026-XX-XX," or "INSERT_URL_HERE."
- Customer-service tone: "I have carefully reviewed," "apologize for any inconvenience," "if there are specific issues, please point them out."

### Change summaries

Commit messages, PR descriptions, review replies, and reports of finished work have their own signs.

- Say what changed, in specifics. "Moved the retry loop into `fetchPage`" tells the reader more than "improved the structure."
- Do not grade your own work with "improved clarity and flow," "ensured consistency," "streamlined," "enhanced readability," or "refined."
- Do not list what you preserved, retained, avoided, or left alone, unless the reader would otherwise assume it changed.
- Do not say that you addressed the feedback. Say what changed because of it.
- Do not assure the reader that the work follows the rules. Name a rule only when it explains a specific change.

Do not overcorrect. Perfect grammar, technical vocabulary, a formal tone, a single transition word, a single word from the cluster list, or a single complex sentence is not evidence of AI writing. Preserve specific details, genuine uncertainty, mixed feelings, useful asides, and natural variation in sentence length.

## Structure

- Choose the smallest structure that makes the content easy to use.
- Lead with the conclusion or answer. Use sentence case headings and short paragraphs.
- Use bullets for parallel items, numbered steps for sequences, and tables only when the reader compares attributes across items.
- For a request or proposal, state the observable problem first, then the proposed option.
- For an information request, label the section "Question:" instead of pretending to propose a solution.
- End with concrete next steps or open questions when they matter. Do not add a generic conclusion.

## Voice and boundaries

- Sound direct, calm, and human.
- Do not add personality to encyclopedic, technical, legal, or reference content unless the source calls for it.
- In personal, opinion, or persuasive writing, preserve the writer's stance and uncertainty. Do not manufacture warmth, humor, confidence, or emotion.
- Do not make every sentence the same length or every paragraph the same shape.
- Do not simplify away distinctions that matter. Do not replace a precise technical term with a vague one when precision is required; explain the term instead.
- Preserve quotations, code, commands, field names, URLs, citations, and proper names exactly unless the user asks to edit them.

## Script check

Run the mechanical rules on the draft. `<skill>` is the folder that holds this SKILL.md:

```sh
node <skill>/scripts/agent-review.mjs prose draft.md      # or pipe text on stdin
```

It flags em dashes, en dashes, double hyphens used as dashes, emoji, title-case headings, unfilled placeholders, and the AI phrases and sentence shapes above. It flags a cluster word only when two different ones share a paragraph. It cannot judge vague association, coverage instead of content, or a corrective framing without a fixed phrase, so check those yourself. Code blocks, inline code, URLs and block quotes are exempt. A flag is a prompt to rewrite the sentence, not to delete the word. Fix each flag or leave it on purpose for a stated reason, such as a quoted title.

For text that will be posted to GitHub, such as a PR description, a review comment or a reply, add `--github`:

```sh
node <skill>/scripts/agent-review.mjs prose --github draft.md
```

It also flags code outside backticks, escaped backticks, a review's finding numbers and internal keys ("finding 2", F1), unclosed backticks, and code blocks with no language.

## Final check

Before returning the prose, confirm:

- The first sentence gives the reader a useful starting point.
- Each sentence has a clear subject and one main idea.
- The wording is plain without losing precision, and terms are used consistently.
- The structure fits the audience and purpose.
- The text contains no unsupported factual claims, filler, hype, AI-pattern phrasing, or meta-commentary.
- The prose check passes, or each remaining flag is deliberate.
- The output is only the reader-facing prose unless the user asked for analysis.

## Audit mode

If the user explicitly asks for a writing audit, explain the most important issues briefly and show targeted before-and-after examples. If the user asks for a humanized rewrite, run the audit internally and return only the final rewrite.
