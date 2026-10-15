---
name: visualtdd
description: Tag a project's tests with the spec, category and tier they cover, and build the VisualTDD dashboard of test counts per spec. Use when the user asks to tag tests, map tests to specs or requirements, show test coverage by spec, category or tier, set up VisualTDD, or rebuild the test map.
---

# VisualTDD

VisualTDD counts the tests that cover each spec and draws them on one HTML page, split by test **category** (colour) and **tier** (column). Each test carries one comment tag directly above it, above any annotations or decorators:

```
// spec: FR-3; cat: logic                 (JS, Kotlin, Java, Swift, Go)
# spec: FR-7; cat: input                  (Python)
// spec: NFR-3, FR-12; cat: perf; tier: tooling
```

The tool is two files, `visualtdd.mjs` and `template.html`, from https://github.com/tokyooctober/VisualTDD. It needs Node 22 and nothing else. The README there is the reference for the config and the commands.

## Workflow

1. **Install, if the project does not have it.** Copy `visualtdd.mjs` and `template.html` into `tools/visualtdd/` (or wherever the user prefers). Check with the user before adding files to their repo.
2. **Config.** If there is no `visualtdd.config.json`, run `node tools/visualtdd/visualtdd.mjs --init`, then review what it wrote with the user:
   - `specs`: ask where the project's requirements live. Use a Markdown spec with ids (`source: "markdown"` plus `idPattern`), a list in the config, or `none`. Do not invent spec ids.
   - `tiers` and `tierFromPath`: match the project's real layers and folder names. Add tiers such as `proxy` or `tooling` only when the code has them.
3. **Find the untagged tests.** Run `node tools/visualtdd/visualtdd.mjs --check`. Every untagged test is listed with its file and line.
4. **Propose tags. Do not write them yet.** Read each untagged test, including its body and what it asserts, and propose `spec`, `cat` and, where the path does not decide it, `tier`, using the rules below. Show the proposals as a table (file:line, test name, spec, cat, tier, one-line reason) and flag the uncertain ones. Wait for the user to approve or correct them.
5. **Write the approved tags.** Insert one tag line above each test (above annotations or decorators), matching the file's indentation. Change nothing else in the test files.
6. **Check and build.** Run `--check`, which must exit 0, then run the tool without flags to write the dashboard. Run the project's own tests to confirm nothing broke. Report the counts from the summary: how many specs have no tests, which tiers are empty, and anything surprising.

## Classification rules

- **One category per test, chosen by what it asserts, not by what it touches.** "Submitting an empty name shows an error" asserts input handling, so it is `input`, even though it goes through the UI.
- `logic`: rules and behaviour, including thresholds and boundaries of business rules ("within 300 m" is logic, not input).
- `input`: only what a user (or caller) supplies: valid, invalid and boundary values, and their error messages.
- `sec`: secrets and credentials, permissions, content filtering, privacy (what is logged or sent), what is reachable.
- `err`: failures and recovery: offline, timeouts, 4xx and 5xx, retries, empty and error states.
- `perf`: rate limits, queues, caching that exists to save calls, latency budgets, large data.
- `data`: stored, read back, survives restart, migrations.
- `integ`: a contract with another component or service: request shape, response parsing, recorded fixtures.
- `ui`: visual and interaction checks: colours and design tokens, layout, navigation, accessibility.
- **Spec:** cite the requirement the test proves. If none covers it, say so. Use an `extraSpecs` id (for example a task id) only with the user's agreement, and never invent a requirement. A test may cite two specs when it truly proves both.
- **Tier:** where the code under test lives, not where the test file sits. Tests of build or one-off scripts are `tooling`, not the tier of the feature they serve.
- When unsure between two categories, pick one, say why in the proposal table, and mark it for the user to confirm.

## Colours

The categories have default colours that were checked for colour-blind readers. The user can change them per category in the config (`color`, `colorDark`). They can also change them in the dashboard by clicking a legend swatch, then use **Copy as config** to make the change permanent. If the tool prints a colour warning, tell the user which two categories clash, and suggest a colour that clears it.

## Do not

- Do not add `--check` to CI or hooks unless the user asks.
- Do not tag tests the user has not approved.
- Do not edit the generated dashboard. Edit the config or the template and rebuild.
