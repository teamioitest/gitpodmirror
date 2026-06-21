# gitpodmirror

Autonomous Web Replication setup for mirroring `ona.com` (formerly compared to Gitpod).

## Structure
- `ona/`: Directory containing crawler scripts, public static files, and verification scripts.
  - `harvest_subpages.js`: Stealth Playwright-based crawler to download pages and assets.
  - `server.js`: Local static file server with API mocks.
  - `verify.js`: Visual and console log parity verification scripts.
  - `public/`: Output directory containing harvested HTML pages and assets.
