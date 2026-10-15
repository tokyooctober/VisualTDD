# VisualTDD

VisualTDD shows how many tests cover each spec (requirement) in a project. It breaks each spec down by the kind of test (category) and by the layer of code under test (tier). Each test carries a one-line comment tag. VisualTDD reads the tags, checks them, and writes a single HTML dashboard that you commit with the project.

- Works with tests in JavaScript/TypeScript, Kotlin, Java, Python, Swift and Go, and other languages by configuration.
- One file, `visualtdd.mjs`, plus `template.html`. It needs only Node 22 and no packages.
- Every test is drawn the same width, so two specs with the same number of tests have bars of the same length.

## Quick start

```sh
# copy visualtdd.mjs and template.html into the project (for example into tools/visualtdd/), then:
node tools/visualtdd/visualtdd.mjs --init      # writes visualtdd.config.json from the test files it finds
node tools/visualtdd/visualtdd.mjs             # writes docs/test-map.html and prints a summary
```

Run it from the folder that holds `visualtdd.config.json`, or pass `--config path/to/visualtdd.config.json`.

## Tagging a test

Put one comment line directly above each test. If the test has annotations or decorators, the tag goes above those.

```js
// spec: FR-3; cat: logic
test('picks the nearest branch within 300 m', () => { ... });
```

```kotlin
// spec: NFR-4; cat: sec
@Test
fun theAppNeverSendsCredentials() { ... }
```

```python
# spec: FR-7; cat: input
@pytest.mark.parametrize("value", ["", "x" * 300])
def test_rejects_bad_names(value): ...
```

| Field | Required | Meaning |
|---|---|---|
| `spec` | yes, unless `specs.source` is `none` | One or more spec ids, separated by commas: `spec: NFR-3, FR-12`. A test that cites two specs appears in both rows. |
| `cat` | yes | The kind of test, from `categories`. Choose by what the test *asserts*, and use one category per test. |
| `tier` | only when the path does not decide it | The layer of code under test, from `tiers`. |

### Default categories

| Key | Name | Use it when the test checks |
|---|---|---|
| `ui` | UI / Visual | Colours, shapes, layout, navigation, accessibility, screen sizes |
| `input` | Input validation | What the user types: valid, invalid and boundary values |
| `logic` | Functional / Logic | Rules and behaviour, including thresholds such as "within 300 m" |
| `perf` | Performance | Rate limits, caching, response time, large lists |
| `data` | Data / Persistence | Saved, read back, survives a restart |
| `integ` | Integration / Contract | Parts working together, responses from external services |
| `sec` | Security | Secrets, permissions, privacy, what is reachable |
| `err` | Error handling | Offline, timeouts, server errors, empty states, retry |

### Default tiers

These are `ui`, `domain` and `data`, the classic three tiers. The tier is read from the path (`/ui/`, `/domain/`, `/data/` and similar names) unless the tag gives one. Add your own tiers, such as `proxy` or `tooling`, in the config.

## Commands

| Command | What it does |
|---|---|
| `node visualtdd.mjs` | Writes the dashboard and prints a summary table. A missing or bad tag prints a `WARNING`, that test is left out of the page, and the exit code is 0. |
| `node visualtdd.mjs --check` | Checks the tags only. Exits 1 if any test is untagged or uses an unknown spec, category or tier. Use it in CI or a pre-commit hook. |
| `node visualtdd.mjs --init` | Writes a starter `visualtdd.config.json`. It never overwrites an existing one. |
| `node visualtdd.mjs --json` | Prints the model (rows, tests, categories, tiers) as JSON. |

## Config (`visualtdd.config.json`)

All paths are relative to the project root, which is the config file's folder unless `root` says otherwise. See `visualtdd.config.example.json` for a full example.

| Key | Default | Meaning |
|---|---|---|
| `title` | `Test map` | Page title. |
| `output` | `docs/test-map.html` | Where the dashboard is written. |
| `theme` | `auto` | The dashboard's theme: `auto` follows the reader's system setting, `light` or `dark` fixes it. Readers can still switch it with the **Theme** picker on the page, and their choice is saved in their browser. |
| `root` | `.` | Project root, relative to the config file. |
| `testRoots` | `["."]` | Folders or files to scan. `node_modules`, `build`, `dist`, `target`, `vendor` and dot-folders are skipped. |
| `languages` | all presets | Presets by name (`js`, `kotlin`, `java`, `python`, `swift`, `go`), or objects that override a preset (`{ "preset": "js", "files": "\\.test\\.mjs$" }`) or define a new one: `files` (regex on the path), `marker` (regex on the line that starts a test), `nameGroup` (the capture group holding the name), `next` (regex for the name on one of the next lines), `fnName` (turn a function name into words), `comment` (`//` or `#`). |
| `specs` | `{ "source": "none" }` | Where the spec list comes from (see below). |
| `extraSpecs` | none | `{ "group": "...", "items": { "ID": "name" } }`: ids tests may cite that are not in the spec list. They are shown only when used. |
| `categories` | the 8 above | Keys, or objects `{ k, name, what, color, colorDark, text, textDark }`. A known key keeps its default name and colours unless you override them. A new key needs `color`. |
| `tiers` | `ui`, `domain`, `data` | Keys, or objects `{ k, name, what }`. With a single tier, the tier columns are hidden. |
| `tierFromPath` | rules for the default tiers | `[{ "pattern": "regex on the path", "tier": "key" }]`. The first match wins. |
| `defaultTier` | none | Tier for tests that no rule matches and that have no `tier:` in the tag. |

### Spec sources

- **Markdown tables** (`"source": "markdown"`): reads table rows whose first cell starts with an id followed by the spec's name, for example `| FR-3 Current library | ... |`. `idPattern` is a regex with the named groups `prefix` and `num`. `groups` maps a prefix to a group heading, and its order sets the order of the groups.
- **A list** (`"source": "list"`): `"items": [{ "id": "LOGIN", "name": "Sign in", "group": "Account" }]`.
- **None** (`"source": "none"`): no spec rows. The dashboard has one row per test folder, and tags need only `cat`.

Specs with no tests are still listed, with a dashed "no tests yet" bar, so gaps are visible.

## Colours

- **In the config:** set `color` (light theme) and `colorDark` (dark theme) per category. The text printed on a bar is picked automatically for contrast, or set it with `text` and `textDark`. The default colours were chosen so that neighbouring categories stay distinguishable for colour-blind readers. When you change them, VisualTDD checks each neighbouring pair and prints a warning if two have become too close. The warning never fails the build.
- **In the dashboard:** click a category's swatch in the legend to pick a new colour. The bars change at once, for the theme you are viewing. The choice is saved in that browser only. The same colour-blind check runs as you pick and flags clashing categories. **Copy as config** copies the current colours as JSON. Paste it into `visualtdd.config.json` and rebuild to make them permanent for everyone. **Reset colors** goes back to the config.

## Tests

```sh
npm test
```

The suite runs the tool on the fixture projects in `test/fixtures` (JS, Kotlin, Python) and on throwaway projects it writes to a temp folder. `examples/hiroapp.config.json` is the configuration of the project VisualTDD was extracted from.

`test/scenarios` holds scenario data: a **happy** project where every tag is valid, and a **negative** project where tags are wrong in every way found so far. Each has an `expected.json` that says exactly what the dashboard must draw. When you find a case the scenarios miss, add it to the data and to `expected.json`. See [test/scenarios/README.md](test/scenarios/README.md).

VisualTDD maps its own tests. `docs/spec.md` lists what the tool must do. Every test in `test/engine.test.mjs`, `test/cli.test.mjs` and `test/page.test.mjs` is tagged with the spec it proves, and the file name decides the tier (engine, CLI or page). `npm run map` rebuilds [`docs/test-map.html`](docs/test-map.html), and `npm run map:check` checks the tags.

## Claude skill

`skill/SKILL.md` is a Claude skill. It tags a project's untagged tests, proposes the tags for review before writing anything, and builds the dashboard. To use it, copy the `skill/` folder into the project as `.claude/skills/visualtdd/`, or into `~/.claude/skills/visualtdd/` to have it in every project.
