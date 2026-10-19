# XSD schemas of Finančná správa

The XML files of the tax reports must validate against the XSD schemas that Finančná správa SR publishes in the catalogue of electronic forms (section "Schémy XSD" of financnasprava.sk). The schemas are published for software makers, but no licence that allows redistributing them is stated, so they are not committed here.

`packages/core/tax/xsd.test.js` validates every `*.xml` of the golden examples against the schema named in `packages/core/tax/forms/*.json` (field `xsdFile`). It looks for the schema in this order:

1. the folder in the environment variable `TAX_XSD_DIR`;
2. the local cache `node_modules/.cache/we-invoice-xsd/`;
3. a download from the `url` given for the file in `sources.json`, saved to the cache.

When none of these gives the schema, or `xmllint` (libxml2) is not installed, the test is skipped with a warning. Before release the schemas must be downloaded, their URLs filled in `sources.json` and the test must pass.
