# WP-UI: interface shell and shared components

## Added

- Sidebar of 260 px with the navigation groups, the Beta badge of e-invoices, tax items filtered by the company's VAT and bookkeeping modes (all shown while no company is known), the company switcher and the sync status line at the bottom. Both listen to the `company:switched`, `company:list` and `sync:status` events and show a neutral state without them; picking another company emits `company:switch`.
- Phone bottom bar with a FAB menu (invoice, expense, payment, scan a receipt) that works with the keyboard, and the More screen.
- Keyboard shortcuts: Ctrl/Cmd+K opens the search dialog, N, Ctrl/Cmd+S, Ctrl/Cmd+Enter and Escape reach the active screen as `hotkey:new`, `hotkey:save`, `hotkey:issue` and `hotkey:escape`. N is ignored while typing.
- White Eagles strip fixed at the bottom of the main area on wide screens, and the same block at the end of the More screen and the Overview on phones. It replaces the small promo link in the sidebar.
- Component library in `app/src/components`: table with virtual scrolling (10 000 rows drawn well under 200 ms), configurable columns, Comfortable and Compact density, totals row, bulk selection and phone cards; text, number, amount (accepts "," and "."), date, select, checkbox and radio fields with aria wiring; autocomplete combobox; document status badge for every status with colour, icon and text; empty state with one main action; undo toast; confirmation of irreversible actions; tabs; filter bar with saved filters.
- "My company" wizard: language, sign-in choice (Google through `auth:signIn` or the transport, local, sample data), encryption through `encryption:setup` (skipped with a note while nobody answers), company lookup by IČO through the gateway with manual entry on failure, VAT mode, bookkeeping mode (a limited company is offered only invoicing or an accountant), IBAN with BIC suggestion, logo, Peppol now or later with the 2027 warning for non-payers, and "Issue the first invoice". The draft is kept on the device so the wizard can be left and resumed; the finished company is emitted as `onboarding:complete` and `company:switched`.
- Sample data mode with a demo company, ten contacts and thirty documents.
- Overview with widgets that can be moved (buttons or drag and drop) and hidden, with the layout kept on the device: quick actions, issued this month and year with last year, unpaid by age, VAT registration limit with warnings at 80 % and 100 %, tax calendar from the legislation file, top clients and debtors, sales and purchases, received e-invoices, account balances. Document packages provide data through `setDashboardSource`.
- Settings with all sections of the specification; Interface (language, theme, density, sample data) and About are working, the others are filled by their packages through `registerSettingsSection` or the `settings-<section>` containers.
- Help screen built like the WE Budget guide, with Slovak and English texts, including "Getting started" and "E-invoicing 2027: what do I have to do".
- Notice "new version, reload" when the service worker updates a running app, quick links `?quick=invoice&contact=...`, safe areas of the iPhone.
- Unit tests for all of the above, Playwright tests on three viewports and axe checks in both themes (`@axe-core/playwright`, `happy-dom` added as development dependencies).

## Changed

- The first start shows the Overview with a "Set up a company" action instead of an empty dashboard; an unfinished wizard is offered to be continued.
- The Help item was added to the navigation.
