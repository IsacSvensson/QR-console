Read CLAUDE.md, SPEC.md, PLAN.md, PROGRESS.md and DECISIONS.md in full.

Then build QR Console autonomously by working through the milestones in PLAN.md in order,
starting from the milestone PROGRESS.md marks as current.

Rules that matter most:
- A milestone is done only when its acceptance command passes. Never weaken tests to get there.
- Do not stop to ask me anything. Decide, record the choice in DECISIONS.md, continue.
- Never violate a Locked decision in SPEC.md; if one blocks you, note it under
  "Blocked / needs human" in PROGRESS.md and continue with what you can.
- Commit after each milestone. Keep `npm run check` green on main.
- Update PROGRESS.md after each milestone.
- Respect the scope ceiling in CLAUDE.md. The goal is a working, proven prototype.
- Do not claim real-phone camera testing; that is my manual check.

When all milestones are done (or you cannot progress further), finish REPORT.md and give me a short
summary: what works, how to run the demo, benchmark headlines, and what failed or is unverified.
