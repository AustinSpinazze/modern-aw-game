# /commit

Stage all changed source files, write a concise commit message summarizing what changed and why,
then commit. Follow this process:

1. Run `git status` to see what changed
2. Run `git diff` to understand the actual changes
3. Run `git log --oneline -5` to match the existing commit style
4. Stage relevant files with `git add` (be specific — avoid `git add -A` which may pick up .env or build artifacts)
5. Write a commit message:
   - First line: imperative mood, ≤72 chars, no period
   - If multiple logical changes exist, use a bullet body
   - End with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
6. Commit using a HEREDOC to preserve formatting
7. Run `git status` to confirm success

Do NOT push unless the user explicitly asks.
