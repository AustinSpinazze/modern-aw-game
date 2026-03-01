# /check

Run the full verification suite and report results. This is the checklist from CLAUDE.md.

Steps to run in order:
1. `npx tsc --noEmit` — report any type errors
2. `npm run build` — confirm production build passes
3. Check CLAUDE.md's "Verification Checklist" section and confirm each item is addressed

If any step fails, diagnose and fix the issue before reporting done.
Report a concise summary: what passed, what failed, what was fixed.
