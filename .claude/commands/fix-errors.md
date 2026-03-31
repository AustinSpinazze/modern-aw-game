# /fix-errors

Fix build, type, and runtime errors using the project toolchain (no framework-specific MCP required).

1. Run `npx tsc --noEmit` and fix all reported TypeScript errors.
2. Run `pnpm build` (or `npm run build`) and fix any Vite/build failures.
3. With `pnpm dev` running in another terminal, exercise the app in Electron or the browser and check DevTools **Console** for runtime errors.
4. Apply minimal, root-cause fixes (don’t silence errors without understanding them).
5. Re-run `npx tsc --noEmit` and `pnpm build` to confirm a clean state.

Requires: dev server optional for step 3 but recommended for UI/runtime issues.
