# QUaD Field Sales iOS

This is the isolated native SwiftUI replacement for the QUaD employee field-sales experience.

- The existing web mobile client remains available during acceptance testing.
- The default API URL is local-only: `http://127.0.0.1:3000`.
- Production URLs, signing, distribution, and Railway deployment are intentionally not configured.
- Customer ordering files are not part of this target.

Generate the Xcode project with XcodeGen:

```bash
xcodegen generate
open QUaDFieldSales.xcodeproj
```
