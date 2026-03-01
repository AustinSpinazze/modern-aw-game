# /pr

Create a pull request for the current branch. Follow this process:

1. Run `git status` and `git diff main...HEAD` to understand all changes since branching from main
2. Run `git log main...HEAD --oneline` to see all commits in this branch
3. If there are uncommitted changes, run `/commit` first
4. Push the branch to origin if not already pushed: `git push -u origin HEAD`
5. Create the PR with `gh pr create`:
   - Title: concise, ≤70 chars, imperative mood
   - Body template:
     ```
     ## Summary
     - <bullet 1>
     - <bullet 2>

     ## Test plan
     - [ ] `npx tsc --noEmit` passes
     - [ ] `npm run build` passes
     - [ ] Manual test: <specific things to verify in the browser>

     🤖 Generated with [Claude Code](https://claude.com/claude-code)
     ```
6. Return the PR URL

Do NOT force push or push to main directly.
