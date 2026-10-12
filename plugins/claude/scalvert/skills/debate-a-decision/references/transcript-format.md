# Transcript format

Every council session writes a transcript file. The transcript is for the user's audit and for the skill's own learning over time.

## Location

```
~/.local/state/scalvert/debate-a-decision/transcripts/YYYY-MM-DD-<topic-slug>/
├── transcript.md          # the discussion itself
├── glossary.md            # session glossary of conflation-prone terms
├── provenance-log.md      # all artifacts read with provenance levels
└── escalations/
    └── <persona>-<question-slug>.md   # subagent reports, one per escalation
```

The directory is created on Phase 0 entry. Closing a session does not delete it.

## transcript.md structure

The transcript is plain markdown, written as the session progresses (not reconstructed at the end).

```markdown
# Council session: <topic>

Date: YYYY-MM-DD
Personas: <list>
Topic: <one-line summary>
Output produced: <type, or "none">

## Phase 0: Artifacts read
- <source 1> [direct-read]
- <source 2> [direct-read]
- ...

## Phase 0.5: Glossary
See glossary.md.

## Phase 1: Position confirmed
> <the user's position, quoted from artifacts where possible>

Confirmed by the user at <timestamp>.

## Phase 2: Round-one statements
### <persona>
<position with provenance tags>

### <persona>
<position with provenance tags>

## Phase 3: Cross-examination
<turn-by-turn, including any user redirections>

## Phase 4: Synthesis
**Contested:**
- <claim>: <which sides hold what, what would change each mind>

**Agreed:**
- <claim>

**Unknown:**
- <question>

## Phase 5: Output
<what was produced, or "none requested">

## Lessons
<the user's optional notes — what worked, what failed, what to fold back into the skill>
```

## glossary.md

A running list of terms at risk of conflation in this session. Each entry has the term, the distinct meanings it could have in this session, and which personas are using which meaning.

```markdown
# Session glossary

## skills
- **Paradigm**: a host-native primitive
- **Format**: a particular file shape with frontmatter
- **Delivery mechanism**: text content returned by a tool result
- Used by distinguished-engineer in mechanism sense; political-realist in paradigm sense.
```

## provenance-log.md

Every artifact read during the session with timestamp, source URL or path, and the level of access (full read vs. excerpt).

```markdown
# Provenance log

| Time | Artifact | Access | Notes |
|---|---|---|---|
| 14:02 | https://docs.example.com/document/d/... | full read | RFC v3 |
| 14:08 | https://example.slack.com/archives/.../p... | thread read | 47 messages |
```

## Lessons footer

The "Lessons" section in transcript.md is optional but valuable. The user can drop notes about what the council got wrong, what missing personas would have helped, or what failure mode showed up. Periodically, lessons can be folded back into `examples/failure-modes.md` so the skill learns from its own runs.

## Privacy

Transcripts can contain confidential artifact content (Slack threads, internal docs, customer names). They live in `~/.local/state/scalvert/debate-a-decision/transcripts/` and are not shared anywhere by the skill itself. The user is responsible for not committing transcripts to public repos.

## Linked references

- `[[escalation]]` — where subagent reports go.
- `[[examples/failure-modes]]` — destination for promoted lessons.
