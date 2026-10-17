# Experimental change-locality rubric v1

For the fixed confirmed-rule inventory, average `1 / independent policy sites`.
Show each rule's raw site count and evidence. Calls to a shared implementation do
not count as independent sites. Two independent copies in one file still count twice.
A missing implementation, absent evidence or empty confirmed inventory stays unavailable.
Proposed/unclear semantic equivalence never silently enters the confirmed denominator.

Affected owners for representative changes remain separate from this score. Historical
co-change and syntactic similarity may suggest an investigation, but cannot prove that
sites implement the same policy or prove immediate refactoring improvement.

Consolidating duplicate policy can help; merging files cannot. Necessary repeated
validation at separate trust boundaries must remain, even when its count lowers locality.
Reviewers must explain semantic equivalence and retain disagreements/exclusions.
Scores are advisory judgements, never learner evidence or automatic exercise pass gates.
