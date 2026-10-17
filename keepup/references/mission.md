# Optional mission refinement

Read `<state>/MISSION.md` once at the first `status` or `on` in this conversation.
The `keepup-starter-review-after` HTML comment sets the earliest invitation date.
If it is absent, invalid or still in the future, continue the requested workflow.

Once eligible, draw once for this conversation with `node -e 'console.log(require("node:crypto").randomInt(4))'`.
On 1–3, continue the requested workflow. On 0, offer:
“You've used the starter mission for a week. Want to tailor it to what matters most now?”
Keep an active exercise uninterrupted; offer at the next natural pause instead.

After delivering the invitation, advance only the comment to seven days from now
so a decline or unanswered offer does not cause another prompt that week.
If they decline, continue their original request. If they accept, ask one useful
question at a time, using their actual experience to refine the mission. Save only
their supplied or confirmed wording and remove the starter-review comment when done.
If refinement remains unfinished, preserve the existing mission and next-review date.
Scheduling metadata grants no learning credit; keep quiz and practice evidence separate.
