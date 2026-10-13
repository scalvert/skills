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

Remove patterns that make prose sound generated, inflated, or overly polished:

- Inflated claims about importance, impact, legacy, or broader trends.
- Promotional language and unsupported praise such as "groundbreaking," "vibrant," "seamless," or "world-class."
- Vague attributions such as "experts say" or "industry reports show" without a named source.
- Trailing participle phrases such as "highlighting," "underscoring," "ensuring," "showcasing," or "reflecting" that add no concrete information.
- AI-heavy vocabulary such as "delve," "foster," "garner," "interplay," "intricate," "landscape," "pivotal," "showcase," "testament," and "underscore" when a plainer word works.
- "Serves as," "stands as," "boasts," or "features" where "is" or "has" would do.
- Repeated "not only ... but also" and "not just ... it's" constructions.
- Forced groups of three when two items or a normal sentence would be more natural.
- False ranges such as "from X to Y" when the endpoints are not on a meaningful scale.
- Excessive synonym cycling, hedging, signposting, and meta-commentary.
- Generic positive conclusions that add no fact or decision.
- Trailing negations such as "no guessing" or "no wasted motion" instead of a complete clause.
- Staccato fragments and manufactured punchlines. Use a short sentence for emphasis only when it sounds natural.
- Aphorisms and abstract formulas that make an ordinary point sound profound.
- Headings in title case when sentence case is enough.
- Emoji, decorative bolding, and lists of bold labels followed by colons, unless the requested format requires them.
- Em dashes, en dashes, and double hyphens used as punctuation. Use a period, comma, colon, parentheses, or a clearer sentence.

Do not overcorrect. Perfect grammar, technical vocabulary, a formal tone, a single transition word, or a single complex sentence is not evidence of AI writing. Preserve specific details, genuine uncertainty, mixed feelings, useful asides, and natural variation in sentence length.

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
node <skill>/scripts/check-prose.mjs draft.md      # or pipe text on stdin
```

It flags em dashes, en dashes, double hyphens used as dashes, emoji, title-case headings, and the listed AI phrases. Code blocks, inline code, URLs and block quotes are exempt. A flag is a prompt to rewrite the sentence, not to delete the word. Fix each flag or leave it on purpose for a stated reason, such as a quoted title.

## Final check

Before returning the prose, confirm:

- The first sentence gives the reader a useful starting point.
- Each sentence has a clear subject and one main idea.
- The wording is plain without losing precision, and terms are used consistently.
- The structure fits the audience and purpose.
- The text contains no unsupported factual claims, filler, hype, AI-pattern phrasing, or meta-commentary.
- `check-prose.mjs` passes, or each remaining flag is deliberate.
- The output is only the reader-facing prose unless the user asked for analysis.

## Audit mode

If the user explicitly asks for a writing audit, explain the most important issues briefly and show targeted before-and-after examples. If the user asks for a humanized rewrite, run the audit internally and return only the final rewrite.
