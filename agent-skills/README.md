# Local agent workflow overrides

These are user-owned overrides of `implement-spec` and `coding-best-practices`.
They preserve the task-graph workflow while checking GitHub before stopping for
missing tickets, reviewing acceptance evidence before dependent work, and keeping
implementation instructions separate from review references.

Install: `node scripts/install-agent-skills.ts`.
Verify: `node scripts/install-agent-skills.ts --check`.
Use `$implement-spec` and `$coding-best-practices` in Codex. The installer updates
the existing `cbp` directory (its declared skill name is `coding-best-practices`)
and `implement-spec` under the configured Codex skills directory. Changed files
are backed up outside that directory before replacement. `--directory <path>`
supports another skills directory and isolated installation rehearsals.

The sources here are authoritative for these local overrides. Update them here,
review the diff, then reinstall. Vendor plugin caches are left intact.
