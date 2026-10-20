## End-to-end testing and acceptance (WP-QA), follow-up

### Fixed

- A received e-invoice whose XML referred to a character that XML does not allow (such as `&#0;` or a lone surrogate) was read anyway, and the character then reached the exports for the accountant and made their XML invalid; such a document is now refused as invalid XML.

### Changed

- The feature coverage counts the Shoptet order import as done.
