# Security policy

## Reporting a vulnerability

Please report security problems privately through [GitHub private vulnerability reporting](https://github.com/JaffarSk24/WE-Invoice/security/advisories/new). Do not open a public issue for them.

Describe what you found, how to reproduce it and what it affects. You get an answer within a few working days; a fix and a release follow as soon as the problem is confirmed, and you are credited in the advisory unless you prefer otherwise.

## What WE Invoice protects

- Business data is encrypted on the user's device (AES-GCM 256) before it reaches Google Drive. The data key is wrapped by the user's password (PBKDF2-SHA256, 600 000 iterations) and by a 24-word recovery key. Neither the password nor the keys ever leave the device.
- The gateway stores no business data. Peppol provider keys and tokens pass through it only for the duration of a request, and are never logged, cached or stored. Upstream hosts come from an allowlist; private and reserved addresses are refused at connect time.
- The desktop app runs its page with context isolation and the sandbox, allows navigation only within the app, opens links in the system browser, refuses webviews and grants a page no permission except notifications, clipboard writes and the camera. Updates are verified by their sha512 before they are installed.
- The repository has protected branches and release tags, pinned GitHub Actions, secret scanning with push protection, CodeQL and Dependabot security updates.

## Supported versions

Only the latest release receives security fixes.
