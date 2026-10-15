# Scenario data

Each folder here is a small project with tagged tests, plus an `expected.json` that says exactly what the VisualTDD dashboard must show for it. `test/scenarios.test.mjs` builds each project, renders the page, runs the page's own script, reads back what it drew, and compares that with `expected.json`.

| Folder | What it covers |
|---|---|
| `happy/` | Every tag is valid. JS, Python and Kotlin tests across the three default tiers and six categories. It includes a test citing two specs, a spec with no tests, a tier set by the tag, the `defaultTier` fallback, an extra spec, and nine tests in one segment (the tooltip shows eight and "+ 1 more"). |
| `negative/` | Every way a tag can be wrong, found so far. Each is reported with its file and line, and its test is left out of the dashboard. FR-2 is cited only by bad tests, so it must show as having no tests. |

## What `expected.json` holds

| Key | Meaning |
|---|---|
| `about` | What the scenario is for. Not compared. |
| `problems` | Every tag problem, exactly as printed, in order. Empty for a happy scenario. |
| `stats` | The counts above the chart. |
| `rulerMax` | The last number on the ruler. Every bar track is this many tests wide. |
| `tierHeaders` | Each tier column's name and its number of unique tests. |
| `names` | For each spec row, every test name the page shows, read from the tooltips of its **All tiers** segments in drawing order. A segment of more than eight tests ends with `"+ n more"`. |
| `rows` | One entry per spec row, in page order: its group heading, `spec` (id and name), `total`, the `all` bar, and the bar in each tier column. A bar is a list of `"category count"` segments in drawing order. `"—"` is an empty tier, and `"no tests yet"` with `tiers: null` is a spec with no tests. |
| `whenHidden` | Optional. A list of cases, each with `hide` (category keys, clicked in the legend) and the `stats`, `rulerMax`, `tierHeaders`, `names` and `rows` the page must show with those categories hidden. The runner then clicks **Show all categories** and checks the page is back to the main expectation. |
| `changeRequests` | Optional. `generatedAt` (the fixed page time used for these cases) and `cases`. Each case has `click` (cells to click, chosen like `tooltips`), optional `untick` (`file:line`s to untick), `set` (`cat` and/or `tier`), and the exact `text` lines that **Copy change request** must copy. |
| `tooltips` | Segments to hover, chosen by `spec`, `column` (`"all tiers"` or a tier name) and `cat`, with the exact tooltip `lines`. |

Each requirement has its own test in `test/scenarios.test.mjs` that compares only its part of `expected.json`: for example, the FR-1 test checks `stats` and `names`, and the FR-5 test checks `rows` and `tierHeaders`. That way the scenarios show up in the **Page** column for each of those specs on VisualTDD's own map. A separate test per scenario compares the whole file.

The runner also checks, for every segment, that its width is its count times one unit, and that `--check` fails exactly when `problems` is not empty.

## Adding a case

1. Add the test (with its tag, good or bad) to `happy/` or `negative/`, or add a new folder with its own `visualtdd.config.json`. A new folder also needs a test line in `test/scenarios.test.mjs` and its name in `CHECKED`.
2. Work out by hand what the dashboard should show, and edit `expected.json` to match.
3. Run `npm test`. If it fails, either the expectation is wrong or you have found a bug.

`UPDATE_SCENARIOS=1 npm test` rewrites every `expected.json` from what is drawn now. It is a shortcut for big changes only. It turns whatever the tool does into the expectation, so read the whole git diff before you commit it.
