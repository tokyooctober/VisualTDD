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

Run it from the folder that holds `visualtdd.config.json`, or pass `--config path/to/visualtdd.config.json`. See [Tag specification](#tag-specification) for how to tag tests and [Command line](#command-line) for every option.

## Tag specification

Every test carries one tag: a single line comment directly above the test. It says which spec the test proves, what kind of test it is and, if needed, which tier it belongs to.

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

```swift
// spec: FR-2, FR-5; cat: data; tier: data
func testSavesTheDraftWhenOffline() { ... }
```

### Syntax

```
tag     = indent comment field { ";" field }
comment = "//" | "#"
field   = key ":" value
key     = "spec" | "cat" | "tier"
value   = for spec: one or more spec ids separated by ","
          for cat and tier: one key
```

- **Comment.** Use the language's line comment: `//` for JS/TS, Kotlin, Java, Swift and Go, and `#` for Python. Block comments (`/* ... */`) are not read.
- **First word.** The comment must start with `spec`, `cat` or `tier`. `// note: x; spec: FR-1` is not a tag.
- **Case.** Keys and values are case-sensitive. `Spec:` is not a tag, and `cat: Logic` is not the `logic` category.
- **Order and spacing.** Fields can come in any order, and spaces around `:`, `;` and `,` are ignored. `//tier:data ;cat: logic;  spec: FR-1 ,FR-2` is valid.
- **Repeats and extras.** If a field appears twice, the last one wins. Other keys, such as `owner: sam`, are ignored, so you can add notes after the fields.

### Fields

| Field | Required | Value |
|---|---|---|
| `spec` | yes, unless `specs.source` is `none` | One or more spec ids, separated by commas: `spec: NFR-3, FR-12`. Each id must be in the spec list or in `extraSpecs`. A test that cites two specs is drawn in both rows but counted once in the totals. |
| `cat` | yes | One category key from `categories`, chosen by what the test *asserts*. See [Default categories](#default-categories). |
| `tier` | only when the path does not decide it | One tier key from `tiers`. It overrides the path. |

### Where the tag goes

- On the line **directly above** the line that starts the test. A blank line or any code in between means the test has no tag.
- If the test has annotations or decorators (lines starting with `@`, such as `@Test`, `@Ignore` or `@pytest.mark...`), the tag goes **above** them.
- Indentation does not matter, so a tag inside a `describe` block or a test class works.

Each language preset decides which files are test files and which line starts a test:

| Preset | Test files | A test starts at | Name shown on the page |
|---|---|---|---|
| `js` | `.test` or `.spec` files ending in `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`, `.mts` or `.cts` | `test(` or `it(`, including `.only`, `.skip` and `.todo` | The title string, as written |
| `kotlin` | `*Test.kt`, `*Tests.kt` | `@Test` | The function name, as words |
| `java` | `*Test.java`, `*Tests.java`, `*IT.java` | `@Test` | The method name, as words |
| `python` | `test_*.py`, `*_test.py` | `def test...` or `async def test...` | The function name without `test_`, as words |
| `swift` | `*Test.swift`, `*Tests.swift` | `func test...` or `@Test` | The function name without `test`, as words |
| `go` | `*_test.go` | `func TestX(t *testing.T)` | The function name without `Test`, as words |

"As words" means `savesTheFile`, `saves_the_file` and `test_savesTheFile` are all shown as `saves the file`. `describe(...)` blocks, helpers and setup functions are not tests, so they need no tag.

### How the tier is decided

1. The `tier` field in the tag, if there is one.
2. Otherwise, the first rule in `tierFromPath` whose pattern matches the test file's path.
3. Otherwise, `defaultTier`.
4. Otherwise, if the config has only one tier, that tier.

If none of these gives a tier, the test is reported.

### Tag problems

Each problem is reported with the file and line of the test. That test is left out of the dashboard and its counts. It isn't drawn in any row, not even the row of a valid spec it also cites.

| Problem | Example message |
|---|---|
| No tag, or the tag is not directly above the test | `src/ui/login.test.js:12  no "// spec: ...; cat: ..." line above "shows the form"` |
| No spec id, when there is a spec list | `src/ui/login.test.js:12  no spec id` |
| Unknown category | `src/ui/login.test.js:12  unknown cat "speed" (use ui, input, logic, perf, data, integ, sec, err)` |
| Unknown tier | `src/ui/login.test.js:12  unknown tier "cloud"` |
| No tier can be decided | `lib/util.test.js:3  the path does not decide the tier; add "tier: ..." (ui, domain, data)` |
| Unknown spec id | `src/ui/login.test.js:12  "FR-9" is not a known spec id` |

A normal run prints these as a warning and still writes the page. `--check` treats them as errors.

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

## Command line

```
node visualtdd.mjs [--check | --init | --json] [--config <file>]
```

| Option | What it does | Writes the page | Exit code |
|---|---|---|---|
| *(none)* | Reads the tags, prints a summary table, and writes the dashboard, stamped with the time it was generated. A missing or bad tag prints a `WARNING`, and that test is left out. | yes | 0, even with tag problems |
| `--check` | Checks the tags and prints the summary. Use it in CI or a pre-commit hook. | no | 1 if any test is untagged or uses an unknown spec, category or tier; otherwise 0 |
| `--init` | Writes a starter `visualtdd.config.json` from the test files it finds. It never overwrites an existing one. | no | 1 if the config already exists |
| `--json` | Prints the model (rows, tests, categories, tiers) as JSON. Warnings go to stderr, so stdout stays valid JSON. | no | 0 |
| `--config <file>` | Uses another config file, whose folder is the project root. Combine it with any option above. | | |

The config is `./visualtdd.config.json` unless `--config` names another. The run stops with a one-line message and exit code 1 if the config is missing, isn't valid JSON or has a mistake (such as an unknown language preset), or if a spec file is missing.

### Examples

Start in a project that has tests but no config:

```sh
node tools/visualtdd/visualtdd.mjs --init
```

```
wrote visualtdd.config.json: python tests under tests. Edit "specs" and "tiers" to suit the project.
```

Build the dashboard and print the summary:

```sh
node tools/visualtdd/visualtdd.mjs
```

```
3 tagged tests
2 of 3 specs have at least one test; 1 have none

                            ui    input logic perf  data  integ sec   err   total
US-1 Import                 .     .     .     .     1     .     .     1     2
US-2 Export                 .     .     .     .     .     1     .     .     1

wrote docs/test-map.html
```

Find untagged or badly tagged tests. The exit code is 1 when there are any:

```sh
node tools/visualtdd/visualtdd.mjs --check
```

```
1 problem(s):
  src/domain/cart.spec.ts:7  no "// spec: ...; cat: ..." line above "has no tag"
```

Use a config in another folder, for example in a monorepo:

```sh
node tools/visualtdd/visualtdd.mjs --config apps/web/visualtdd.config.json
```

Fail a CI job when a tag is missing or wrong (a GitHub Actions step):

```yaml
- run: node tools/visualtdd/visualtdd.mjs --check
```

Save the model as JSON, then list the specs that have no tests:

```sh
node tools/visualtdd/visualtdd.mjs --json > test-map.json
node -e "for (const r of require('./test-map.json').rows) if (!r.tests.length) console.log(r.id, r.name)"
```

Or add npm scripts, as this repo does:

```json
"scripts": {
  "map": "node tools/visualtdd/visualtdd.mjs",
  "map:check": "node tools/visualtdd/visualtdd.mjs --check"
}
```

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
- **Hiding categories:** click a category's name in the legend to hide its tests, so you can focus on the others. Hidden tests leave every bar and count, and the ruler shrinks to fit what is left. The stats line shows how many tests are still shown. Click the name again, or **Show all categories**, to bring them back. Like colours, the choice is saved in that browser only.

## Tests

```sh
npm test
```

The suite runs the tool on the fixture projects in `test/fixtures` (JS, Kotlin, Python) and on throwaway projects it writes to a temp folder. `examples/hiroapp.config.json` is the configuration of the project VisualTDD was extracted from.

`test/scenarios` holds scenario data: a **happy** project where every tag is valid, and a **negative** project where tags are wrong in every way found so far. Each has an `expected.json` that says exactly what the dashboard must draw. When you find a case the scenarios miss, add it to the data and to `expected.json`. See [test/scenarios/README.md](test/scenarios/README.md).

VisualTDD maps its own tests. `docs/spec.md` lists what the tool must do. Every test in `test/engine.test.mjs`, `test/cli.test.mjs`, `test/page.test.mjs` and `test/scenarios.test.mjs` is tagged with the spec it proves, and the file name decides the tier (engine, CLI or page). `npm run map` rebuilds [`docs/test-map.html`](docs/test-map.html), and `npm run map:check` checks the tags.

## Claude skill

`skill/SKILL.md` is a Claude skill. It tags a project's untagged tests, proposes the tags for review before writing anything, and builds the dashboard. To use it, copy the `skill/` folder into the project as `.claude/skills/visualtdd/`, or into `~/.claude/skills/visualtdd/` to have it in every project.
