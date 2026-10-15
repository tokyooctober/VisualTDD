# VisualTDD spec

What VisualTDD must do. The tests in `test/` cite these ids in their tags, and `docs/test-map.html` shows how many tests cover each one. Rebuild the map with `npm run map`.

## Functional requirements

| ID | What it must do |
|---|---|
| FR-1 Find tests | Scan `testRoots` (folders or single files) for test files of each configured language: js, kotlin, java, python, swift, go. Skip `node_modules`, build output and dot-folders. |
| FR-2 Test names | Keep a string title (JS) as written. Turn a function name into lower-case words: camelCase, snake_case, and a leading `test` / `Test` prefix removed. |
| FR-3 Read tags | Read the one comment line directly above a test, above its annotations or decorators: `spec`, `cat` and optional `tier`, in any order. A test may cite several specs and is then counted in each row but once in the total. |
| FR-4 Report bad tags | Report, with file and line, a test that has no tag, no spec id (when there is a spec list), or an unknown category, tier or spec id. Leave that test out of the counts. |
| FR-5 Tier | Take the tier from the tag, else the first matching `tierFromPath` rule, else `defaultTier`, else the only tier. Report a test whose tier is still unknown. |
| FR-6 Specs from Markdown | Read spec ids and names from table rows in one or more Markdown files, using `idPattern`. Order them by the `groups` order, then by number. Keep each id once. |
| FR-7 Specs from a list, or none | Read specs from a list in the config, in order, with groups. With `source: none`, show one row per test folder instead. Specs with no tests stay as rows. |
| FR-8 Extra specs | Accept the `extraSpecs` ids in tags, and show their rows only when a test cites them. |
| FR-9 Config | Fill in defaults for every key. Report config mistakes (unknown language preset, bad spec source, a tier rule naming an unknown tier) and stop. A language object may override a preset. |
| FR-10 Category colours | A category keeps its default name and colours unless overridden. A new category needs a valid hex colour. Bar text is dark or white, whichever reads better. Warn, without failing, when neighbouring colours are hard to tell apart. |
| FR-11 Dashboard page | Write one self-contained HTML page holding the model, the title and the colour checks, with no template placeholders left. |
| FR-12 Summary | Print the number of tagged tests, how many specs have a test, and a table of counts per spec and category. |
| FR-13 Normal run | Without flags, warn about bad tags, still write the page (creating its folder), and exit 0. |
| FR-14 Check | `--check` validates the tags only: exit 1 on any problem, exit 0 when all tests are tagged, and never write the page. |
| FR-15 Init | `--init` writes a starter config from the languages and test folders it finds, and never overwrites an existing config. |
| FR-16 JSON | `--json` prints the model as JSON and writes no page. |
| FR-17 Config file and errors | `--config` picks another config file, whose folder is the project root. A missing config, unreadable JSON or a missing spec file ends with a one-line message and exit 1, not a stack trace. |
| FR-18 Edit colours in the page | In the dashboard, a legend swatch changes a category's colour for the current theme, saved in that browser, with a live clash warning. **Copy as config** and **Reset colors** work. |

## Non-functional requirements

| ID | What it must do |
|---|---|
| NFR-1 No dependencies | Run on Node 22 or later with no packages: only Node built-in modules. |
| NFR-2 Colour-blind safe defaults | The default category colours raise no clash warning in either theme. |
| NFR-3 Same width per test | Every test is drawn the same width, so specs with the same number of tests have bars of the same length. |
| NFR-4 Safe page | Test names, spec names and the title cannot break out of the page's HTML or script. |
| NFR-5 Same paths on every OS | Report file paths with forward slashes on Windows too. |
| NFR-6 Fast scan | Scan 1,000 test files with 5,000 tests in under 2 seconds. |
