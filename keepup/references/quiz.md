# First or standalone comprehension quiz

1. Run `status --json`; read the mission and available initial-assessment report.
   Choose a small representative sample across up to three important modules,
   preferring unassessed files and consequential public workflows. Inspect the
   source privately, including relevant callers. Keep target files closed for the
   learner until they answer. A quiz needs no test command or refactoring target.
2. Ask three code-checkable predict, trace or impact questions, one at a time.
   Use actual implementation behaviour and a specific concept/file for each.
   For multiple choice, keep options parallel with equal word counts and vary
   the correct answer position. Keep the answer key private; wait for each answer.
   Clarify ambiguous responses. A skipped question provides no answer evidence.
3. Grade only actual answers against the source and show a short explanation after
   each answer. If the relevant code changed during the quiz, recheck it and restart
   affected questions before recording a grade. Preserve the learner's exact words.
4. Log the actual answered questions through the supported CLI, with a fresh retry
   ID, `type: "quiz"`, `phase: "pre"`, the exact answered `files`, and complete
   answer objects (`file`, `concept`, `question`, `answer`, `correct`). Omit
   `kataNumber`: this is a standalone quiz. On an uncertain write, retry the same
   ID and identical payload. Read the accepted event; rejection grants no credit.
5. Run `health` to refresh comprehension debt and save the updated summary. Explain
   how many sampled answers were correct and which source they covered; this is
   sampled evidence, not a whole-codebase knowledge certification. First-quiz credit
   remains subject to the existing quiz cap; delayed verification is separate.
   Offer `kata` for practice or `on` while agents work. The learner owns any edits.

If no safe code question can be established, explain why and record no quiz. An
interrupted quiz may record only questions actually answered and graded, never
invent missing responses or grant practice credit.

When the learner requests an invitation or next-step options, preserve these alternatives:
“Would you like to take your first quiz to see how well you understand your codebase?
Run `/up quiz`.” Then: “Or skip this introductory quiz and start `/up kata`.” On its
own line: “You can also use `/up on` next time you have an agent working.” Use `$up`
in Codex and the installed skill name when different. These invitations do not append
to the compact init summary and never make a quiz a prerequisite for kata/on.
