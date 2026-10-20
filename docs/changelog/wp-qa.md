## End-to-end testing and acceptance (WP-QA), follow-up

### Fixed

- A received e-invoice whose XML referred to a character that XML does not allow (such as `&#0;` or a lone surrogate) was read anyway, and the character then reached the exports for the accountant and made their XML invalid; such a document is now refused as invalid XML.

### Changed

- The reports and the stock valuation meet their budgets over 10 000 documents and moves: the aging, sales, profitability and cash flow reports keep their sums as exact decimal numbers until the end and read only the amounts they need, rounding skips amounts that are already written with the wanted places, and the FIFO valuation keeps the stock on hand as a running total instead of adding up every layer after each move. Every result is the same as before.
- The feature coverage counts the Shoptet order import as done.
- The release checklist has a live check that the desktop and the web app see the same Drive data.
