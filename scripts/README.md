# Scripts

Utilities for visual validation during development.

## Usage

### `screenshot.mjs`
Takes a screenshot of the game canvas for visual inspection.

```bash
# Basic usage - saves to scripts/map-screenshot.png
node scripts/screenshot.mjs

# Custom output path
node scripts/screenshot.mjs output.png

# Crop to specific region (x, y, width, height)
node scripts/screenshot.mjs zoom.png --zoom 100 100 400 300
```

Requires: `npx playwright install chromium` (one-time setup)

### `diag.mjs`
Diagnostic screenshot utility for debugging rendering issues.

## Notes for AI Agents
- Generated PNG files can be deleted after inspection
- Keep these utilities for automated visual validation
- Run before/after rendering changes to verify correctness
