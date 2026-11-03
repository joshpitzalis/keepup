# KeepUp

KeepUp measures and builds a developer's understanding of their own codebase through quizzes, katas and checks.

## Language

### Multiple-choice questions

**Question spec**:
A multiple-choice question as the agent wrote it, with options and answer key, before it is shown to the learner.
_Avoid_: Draft (LearnHarness uses drafts for a learner's unfinished selection)

**Posed question**:
A question spec after shuffling and storage, with its options fixed in display order; the form the learner sees, minus the answer key.
_Avoid_: Shown question, rendered question

**Answer key**:
The option or options the agent marked correct in a question spec. Fixed once the question is posed.

**Answer**:
The learner's exact words in reply to a question, preserved as logged evidence.
_Avoid_: Submission

**Response**:
The learner's answer resolved to a selection of options in a posed question, or "don't know".
_Avoid_: Selection, submission

**Verdict**:
The grade computed from a posed question and a response: whether it matches the answer key.
_Avoid_: Result, score
