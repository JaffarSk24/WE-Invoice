# WP-QA

## Added

- A build mode `e2e` (`vite build --mode e2e`, output `dist-e2e/`, never published) that the end-to-end tests run against: the web build with the PBKDF2 round count lowered to 1000, so a test of the encryption or of a synced workspace does not wait on key derivation. Every other build and the unit tests keep 600 000 rounds; `app/build-modes.test.js` checks that.
- `tests/e2e/support/axe.js`: one axe helper (WCAG 2.1 AA tags, serious and critical issues only) with a time allowance per audited screen, used by every accessibility test.
- `tests/e2e/first-run.timing.spec.js`: the 60 second budget of the first run (register lookup to the first invoice) now runs in the `timing` project, alone, after the other projects.

## Changed

- The `timing` project runs with one worker, so a time budget is measured without other tests competing for the machine.
- The audit of all menu screens is split by menu group (one test per group and theme), so each test stays short and the groups spread over the workers.
- The phone tests of sales, CRM and Peppol seed the company directly instead of walking through the company wizard; the wizard keeps its own tests.
- The keyboard path takes the "skip to content" link before tabbing into the editor and the card, instead of tabbing through the whole menu each time.
- `first-run.spec.js` and `onboarding.spec.js` check the flow only; the time budget lives in the timing test.

## Fixed

- `bank.spec.js` waited for the app to start before seeding, so the first run could no longer write an empty workspace over the seeded one.
- `seams-card.spec.js` and `sync-attachments.spec.js` acted on the card of a document while it was still building its PDF preview on the main thread, so the e-mail window or the added attachment could show up after the expectation's timeout; they now wait until the card is settled (`tests/e2e/support/card.js`). The long closed VAT period scenario has its own 60 second allowance.
- `peppol-flow.spec.js` pressed the Peppol send button while the card could redraw after a background round and close its menu; it now presses the button once, by its click event.
