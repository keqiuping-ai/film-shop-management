# Retail cloud release

- Retail URL: `/retail/index.html`, English by default; locale stored on the device. Five UI languages: en/es/ja/ko/zh. Customer messages and entered values are never translated automatically.
- Main customer workspace: **零售专属链接 / 网页咨询**. Create/copy a private customer link, send through the existing authorized channel, and reply in the retail panel. Creating a link does not send it.
- Links expire after 90 days. Replacing/revoking invalidates prior links and cookies. Possession of a link identifies the customer conversation, not verified legal identity; do not forward it. Only retail-channel messages and quotes are exposed, not other customer history.
- General visitors receive isolated guest sessions. Messages/contact submissions create an inquiry in the customer center. No name/phone guessing or automatic matching.
- Deposits use existing public Stripe payment links with a booking reference. No card data is collected. Payment remains unverified until checked by the shop; redirecting or returning is never payment evidence. No live payment was made during QA.
- No new Railway environment variables, new service, or production data migration is required. The standalone loopback preview server and its unauthenticated admin are excluded.
- Tests: `node scripts/test-retail.js`, `node scripts/test-retail-assets.js`, appointment visibility regression, isolated real-server login/customer/link/chat persistence and data audit. Browser QA covers languages, mobile layout, film selection/video, booking entry and staff reply.
- Asset package excludes unused render intermediates. All 228 gallery records and their swatches remain.
