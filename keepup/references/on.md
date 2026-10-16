# Keep up while agents work

Use for `/keepup on`, including from a second terminal. Run the installed skill's `scripts/keepup.mjs` from the learner's repository. This is an interactive conversation: present one item, wait for a response, and continue until the learner says “stop”. Stopping ends the session without inventing a learning event. Inspect code privately; never write a target's refactor.

1. Run `in-play`, then `status --json`; surface their warnings. Match the returned paths against current status files. If none remain, use the debt ranking. Choose **one** file, preferring high debt with a useful change to explain; use path order for ties. Avoid repeating an unchanged file already offered in this conversation. If no fresh item remains, say so and wait for another request; do not poll or manufacture activity. Empty scope means report that no scoped file is available and stop without logging anything. Reading or selecting a file grants no evidence.
2. Read that file and its relevant diff/callers. Use its current learning state to offer one item:
   - **Dark:** a walkthrough card explaining its job, main flow, important dependency and one concrete product consequence. Keep diagrams within 30 columns by 12 rows.
   - **Exposed, with a due check:** offer one delayed question about that file. Follow [the check workflow](check.md) for this selected due file rather than switching to a different candidate. Wait for an actual answer and log only the actual quiz. A question alone is not a shown explanatory card. If the learner declines, record their response without quiz evidence.
   - **Exposed, without a due check:** one paragraph orienting the learner to the change and its effect.
   - **Verified or practised:** one line explaining what changed, with an offer to practise a nearby measured smell. When history cannot establish a change, say what the file currently does; do not invent a before/after claim.
3. After presenting an explanatory card, log `shown` for that one file with `depth` `walkthrough`, `paragraph` or `line`, matching what was delivered. Do not log presentation in advance, or use a response event as proof of presentation. Never ask an immediate quiz during `on`; a delayed question requires fresh `due: true` status and the CLI's eligibility check.
4. Let the learner reply **got it**, **skip**, **kata**, **next** or **stop**. Wait for their actual choice; do not prefill a response. Stop immediately for “stop”; these are session controls, not quiz evidence. Map “got it” to `got-it`, and the other three learning choices to their identical stored values. Clarify an ambiguous reply. Log their chosen learning response against the offered file, using a fresh ID:

   ```json
   {"id":"unique-response-attempt","type":"response","files":["src/example.ts"],"response":"got-it"}
   ```

   Replace the example choice and path with the actual ones. Acknowledgements and skips grant no quiz accuracy or verification. Reuse the same ID and payload only when retrying that action.
5. **Got it / skip / next:** rerun from step 1 and present at most one new item, then wait again. After an answered delayed check, also wait for this choice before continuing. **Kata:** pause the learning session, read [the kata workflow](kata.md), then recheck staged and unstaged cleanliness immediately before selecting or starting the exercise. A file being edited by another agent cannot become a kata target. Offer a clean nearby candidate or explain that none is safe; never reset edits, silently start on a dirty file or write the refactor. Follow the kata workflow's pre-quiz and second clean/content recheck before logging a start. Resume the learning session only when the learner asks.

Example shown payload after a paragraph has actually been delivered:

```json
{"id":"unique-card-attempt","type":"shown","files":["src/example.ts"],"depth":"paragraph"}
```

Concurrent agents can change code between inspection and presentation. Reread the selected file before giving code-specific claims; if it has changed, refresh the offer. CLI commands serialize log access, but a second terminal never proves who authored an edit. Preserve unrelated work and log only interactions that happened.
