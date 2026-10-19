# XSD schemas of Finančná správa

The XML files of the tax reports must validate against the XSD schemas that Finančná správa SR publishes next to each electronic form on its form server (`https://pfseform.financnasprava.sk/Formulare/eFormVzor/DP/form.<ID>.sk.xsd`; the kontrolný výkaz under its namespace address on `ekr.financnasprava.sk`). The schemas are published for software makers, but no licence that allows redistributing them is stated, so they are not committed here. `sources.json` names the official address and the SHA-256 of every schema.

`packages/core/tax/xsd.test.js` validates every `*.xml` of the golden examples against the schema named in `packages/core/tax/forms/*.json` (field `xsdFile`). It looks for the schema in this order:

1. the folder in the environment variable `TAX_XSD_DIR`;
2. the local cache `node_modules/.cache/we-invoice-xsd/`;
3. a download from the `url` given for the file in `sources.json`, saved to the cache.

A schema found in any of these places must have the SHA-256 given in `sources.json`, otherwise the test fails: a new version on the server has to be reviewed, and its checksum updated, on purpose. When no schema can be found, or `xmllint` (libxml2) is not installed, the test is skipped with a warning. Before release the test must run with all three schemas and pass.
