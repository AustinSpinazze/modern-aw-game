# /fix-errors

Use the Next.js MCP server to detect and fix all current errors. Steps:

1. Call `next-devtools: get_errors` to retrieve build errors, runtime errors, and type errors from the running dev server
2. Call `next-devtools: get_logs` to check for any relevant console output
3. For each error found:
   a. Identify the source file and line number
   b. Understand the root cause (don't just silence the error)
   c. Apply the minimal fix
4. After fixing, call `get_errors` again to confirm all errors are resolved
5. Run `npx tsc --noEmit` as a final check

Requires: `npm run dev` must be running in another terminal.
