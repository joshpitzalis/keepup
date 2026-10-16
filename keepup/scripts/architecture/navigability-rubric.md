# Experimental navigability rubric v1

Average `1 / (1 + necessary external-module implementation transitions)` over the
fixed exact comprehension questions. Retain the owning logical module, sufficient
reviewed source trail, evidence locations and reason each inspection is necessary.

Start at the owning module and count each logical-module boundary crossed by the
ordered necessary implementation trail, including return crossings. Consecutive
implementation steps in one module add nothing. Public interface references and
private helpers hidden from the comprehension task add nothing; genuinely necessary
helper implementation inspection must instead use implementation kind.

The trail explains the minimum sufficient answer, not an evaluator's browsing history,
tokens, elapsed time or number of files. Incomplete trails, unresolved branches,
ambiguous ownership and missing evidence stay unavailable, with only explicitly
labelled partial observed counts. Empty question inventories never score perfectly.

Removing a necessary pass-through can help. Adding hidden private helpers cannot hurt.
Giant-file consolidation that hides internal readability problems cannot earn an
improvement: obscured or unclear readability makes that question unavailable.
Preserve interface leverage and publish naming issues and reviewer disagreements.
Navigability concerns where to look; change locality concerns where to change policy.
Reviewed results grant no learning or quiz credit.
