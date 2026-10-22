# WP-UI

## Added

- A layout guard in the end-to-end tests (`tests/e2e/layout-guard.spec.js`): every menu screen and the main cards at 1440 and 375 px, in Slovak and Russian, are checked for horizontal page scroll, text squeezed into a column so narrow that words break by letters, table headers that do not cover every column, cards of one grid row that start at different heights and icons left undrawn.

## Fixed

- The icons of a tab panel (the documents of a contact), of the tax screen headers and of the search field are drawn.
- Long names in the lists end with an ellipsis instead of pushing the last columns out of the table; the phone cards keep the name on one line and no longer widen the page.
- Statement, summary and template tables wrap their text inside the card; amounts stay on one line.
- Checkboxes and radio buttons keep their size next to text fields; fields and selects of one row have the same height on the phone.
- Segmented filters, the more menu, dialog buttons and the action buttons on the phone keep their labels on one line.
- On a tablet the settings show the section select instead of the side menu, the quick sale puts the cart under the catalog, and wide dashboard widgets take one column when the dashboard is narrow.
- The ledger tiles keep room for long book names, the closing statements sit side by side only when there is room, and the spacing of the ledger cards no longer leaks into other screens.
- The recurring template lines, the stock filters, the tax closing bar and the VAT record columns (number, date, VAT ID) no longer squeeze or wrap their content.
