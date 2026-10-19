# WP-PEPPOL

## Changed

- The gateway proxy forwards the `Idempotency-Key` header to the Peppol provider, so a send retried from the browser after a lost answer is not delivered twice; the header is described in `gateway/openapi.yaml`.
- The data model describes the e-invoice fields already written by the app: `autoReceive`, `emailCopy`, `vpdsDone` and `registered` in the Peppol settings of a company, and `attempts`, `nextAttemptAt`, `statusChecks` and `nextCheckAt` in the Peppol state of a document.
