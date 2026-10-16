# Experimental behavioural-testability rubric v1

Qualifying scenarios / fixed agreed scenarios. A qualifying scenario requires an
observed successful execution of its exact existing selected test, a reviewed
observable outcome through the intended interface, and a justified dependency
strategy with all necessary production compatibility checks passing.

Pure computation, local substitutes, owned remote adapters and true external adapters
require different strategies. Owned remote and true external dependencies require
explicit compatibility checks. Local substitutes never erase required contract checks.
Assertions about mock calls alone do not prove orchestration behaviour.

An agreed scenario without a test remains a known gap. Relevant failed/skipped tests
cannot qualify. Missing tools, undiscovered selected cases and incomplete scenario
discovery make evidence unavailable. Empty inventories never score perfectly.
Deleting scenarios changes the comparison definition; deleting tests creates gaps.
The fraction does not establish overall correctness, safety or learner understanding.
