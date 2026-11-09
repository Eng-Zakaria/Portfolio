---
title: "Ten interior specs, one priced BOQ: parametric Revit generation from JSON"
date: 2026-11-08
summary: "How I drive Revit 2026 from JSON specs: one file per interior builds the model through pyRevit, writes an IFC4 copy, and prices a bill of quantities that comes to $156,733 across nine projects."
tags: [BIM, Python, Automation]
draft: false
---

Evidence: **Portfolio project, demo content.** The geometry is original and the specs are hand-written. The Revit models were built on my own machine, and the prices are illustrative figures I typed into the specs, not supplier quotes. Every number below comes from the build logs, the generated report, or the BOQ CSVs in the repo.

## The problem

Interior fit-out documentation repeats itself. Every project needs the same work done in the same order: levels, grids, walls, openings, rooms with finishes, then sockets, sanitaryware, furniture and lights, then sheets. Someone also has to count all of it and put a price on it. Doing this by hand in Revit is slow. The quantities also drift: someone moves a sofa in the model and the spreadsheet never hears about it.

I wanted one source of truth per project, a JSON file, and a pipeline that turns it into three things: a Revit model, an open IFC copy, and a priced bill of quantities (BOQ). The pipeline also had to be testable on a machine with no Revit installed.

## Architecture

Each project is one schema v2 JSON spec in `InteriorsToolkit.extension/projects/`. There are ten of them: a 45 m² studio, 2-bed, 3-bed and 4-bed apartments, a duplex, a penthouse, a 240 m² office, a 60 m² hotel suite, a 250 m² two-level villa, and a hand-sketch apartment (P05). P05 is walls, doors, windows and rooms only, with no fixtures or furniture.

```text
 projects/P01..P10.json  (schema v2: levels, grids, walls, openings,
        |                 rooms+finishes, electrical, plumbing,
        |                 furniture, lighting, sheets, views)
        |
        +--> project_builder_core.validate_project()   pure Python, no Revit
        |          |
        |          +--> build_plan()             counts, wall lengths/areas
        |          +--> build_element_inventory() one dict per fixture (qty-expanded)
        |                     |
        |                     +--> audit_core.audit_elements()  missing Manufacturer/Model/Price,
        |                     |                                 invalid price, no level ...
        |                     +--> boq_core.build_boq()         group + price -> *.boq.csv
        |          => tools/build_projects.py --report out --boq-csv
        |             (projects_report.html + out/plans/*.plan.json, *.boq.csv)
        |
        +--> Revit 2026 via pyRevit
        |      BuildPortfolioRVT.py -> ProjectBuilder.build_single()
        |      TransactionGroup, one Transaction per element -> SaveAs .rvt
        |      => out/P0x-build-log.json  (created counts + errors[])
        |
        +--> tools/build_production_ifc.py  (CPython + ifcopenshell) -> out/*.ifc (IFC4)
```

So there are two halves. The validation, audit and BOQ half is plain CPython and runs anywhere. The modelling half runs inside Revit 2026 through `pyrevit run`. It opens a copy of a base template, calls `build_single()`, and saves the result as a native `.rvt`. The IFC files don't come out of Revit. A separate ifcopenshell script writes them straight from the same specs.

## Decision 1: keep the logic pure and IronPython-safe

All the rules live in `interiors_toolkit/*_core.py`: schema checks, plan totals, inventory expansion, audit and BOQ grouping. They are written for IronPython 2.7 as well as CPython 3, so no f-strings, no dataclasses, no pathlib, and only the standard library. The module docstring states it directly: "All functions operate on plain dicts/lists (unit-testable)."

The benefit is that the test suite and the batch report run without Revit. The repo has 12 pytest files with 54 tests, and all 54 pass locally in about four seconds. The GitHub Actions workflow runs the same suite on `windows-latest`, plus a no-Revit demo and a `compileall` of the extension.

The trade-off is that the Revit-facing code in `ProjectBuilder.pushbutton/script.py` (about 700 lines) is only exercised when I run it in Revit. CI can't catch a placement bug in it. The build logs are the only record of what happened in those runs.

## Decision 2: the BOQ comes from the spec, not from the model

`boq_core.build_boq()` groups elements by `(category, family, type, level)`, counts them, and multiplies by a unit price read from each element's `Price` parameter:

```python
for (cat, fam, typ, level), items in sorted(groups.items()):
    prices = []
    for el in items:
        p, ok = _parse_price((el.get("params") or {}).get("Price"))
        if ok and p >= 0:
            prices.append(p)
    unit_price = max(prices) if prices else 0.0
    qty = len(items)
```

In the batch report, those elements come from `build_element_inventory(spec)`, not from a Revit model. Each furniture, lighting, electrical or plumbing row in the spec is expanded by its `qty` and given a synthetic sequential id starting at 1001. That's why the `element_ids` column in the CSVs reads `1009;1010` and not real Revit ElementIds.

I chose this because it makes the BOQ reproducible and testable without Revit. The same function also runs inside Revit on collected elements (the BOQ panel's Export BOQ button). The cost is that the published BOQ proves the spec is internally consistent, not that the model matches it. The link between the two is the Revit build log. For every project, it records the same element counts the spec asks for.

The prices themselves are what you would expect from demo data. They are typed into each spec item, `"manufacturer": "BoConcept", "model": "Aria 3-Seat", "price": 1899`, using real brand and model names at catalogue-style levels. The spec has no currency field, no supplier quote and no price date. The README presents them in dollars. Scope is limited too: rows cover only electrical fixtures, plumbing fixtures, furniture and lighting, counted in `pcs`. Walls, finishes, doors, windows and labour aren't priced.

!!! note "A small mismatch in boq_core"
    The comment says the unit price is the "most common non-zero price", but the code takes `max(prices)`. It makes no difference here, because every element in a group comes from the same spec row and shares one price. With real collected elements carrying mixed prices, it would overstate the total.

## Decision 3: per-element transactions, logged, never fatal

`build_single()` wraps a project in one `TransactionGroup` and gives every level, grid, wall, opening, room, fixture and sheet its own `Transaction` inside a try/except. A failure rolls back that one element and is appended to `created["errors"]`. The rest of the build continues. Missing families are added to `created["skipped"]` without stopping the run.

Fixtures and furniture are placeholders. `find_symbol()` picks the first family type in the template whose name matches a hint, falling back to any type in that category. The spec's Manufacturer, Model, Finish and Price are then written onto the instance as parameters. So a "Jung LS990 socket" in the `.rvt` is a template family carrying Jung's parameters, not a Jung content family.

Views aren't created at all. Every build log says `"N views logged only (create/apply templates manually)"`.

I also wrote a compiled C# add-in, `src/Interiors.Batch` (net48), for headless runners such as Revit Batch Processor and Design Automation. It reads `PROJECT_JSON` and `HEADLESS` from environment variables. When `HEADLESS=1` it skips the `TaskDialog` and logs to `%TEMP%\Interiors.Batch\`. `RevitApiStubs.cs` lets it compile without Revit. The scope is limited, though. `ResizeChairsCmd` is a complete command, but `BatchBuildCmd` is documented in its own code as a skeleton that "validates + logs the plan … but does not create elements yet". The CI workflow doesn't build the C# project. Every model in this portfolio was built by the pyRevit path.

## Results

From `out/projects_report.html` (generated 2026-10-03) and the BOQ CSVs:

| Code | Project | Rooms | D/W | E/P | F/L | Sheets | BOQ rows | BOQ total |
|------|---------|-------|-----|-----|-----|--------|----------|-----------|
| P01 | Studio 45 m² | 2 | 3/4 | 9/4 | 4/4 | 2 | 15 | 6,054 |
| P02 | 2-bed 75 m² | 4 | 4/4 | 13/5 | 9/7 | 3 | 19 | 10,138 |
| P03 | 3-bed 120 m² | 6 | 6/7 | 19/11 | 13/15 | 4 | 26 | 16,743 |
| P04 | Duplex 160 m² | 7 | 6/7 | 22/10 | 10/17 | 4 | 30 | 14,996 |
| P05 | Sketch 3-bed 140 m² | 12 | 10/8 | 0/0 | 0/0 | 2 | 0 | 0 |
| P06 | Penthouse 185 m² | 9 | 11/7 | 33/12 | 15/23 | 5 | 31 | 24,302 |
| P07 | Office 240 m² | 8 | 9/7 | 38/9 | 42/24 | 5 | 24 | 39,544 |
| P08 | Villa 250 m² | 10 | 9/8 | 30/13 | 13/23 | 5 | 33 | 21,407 |
| P09 | Hotel suite 60 m² | 4 | 4/4 | 8/4 | 7/7 | 3 | 19 | 8,980 |
| P10 | Family 4-bed 150 m² | 7 | 10/8 | 17/6 | 15/12 | 4 | 22 | 14,569 |

- **BOQ total: 156,733** (the README uses $). It sums nine priced projects and 219 rows. I re-summed the nine CSVs and got the same figure, with zero unpriced rows.
- **Zero errors** has three specific meanings. First, `validate_project()` returned 0 schema errors for all 11 specs in the report (the ten projects plus a legacy sample). Second, `audit_core` found 0 issues on each spec-derived inventory. Third, the nine Revit build logs (P01–P04, P06–P10) all end with `"errors": []`, and their created counts match the spec.
- **Independent check:** `VerifyPortfolio.py` reopened two saved models and counted them. P06 has 12 walls, 11 doors, 7 windows and 9 rooms. The P08 build has 17 walls, 9 doors, 8 windows and 10 rooms on L1 and L2.
- **IFC4:** all ten projects have an `.ifc` with `FILE_SCHEMA(('IFC4'))`. The plan PNGs are matplotlib renders of the specs. Revit 3D and plan view exports exist for P01–P04.

!!! note "What the numbers don't cover"
    P05's `.rvt` is byte-identical to the empty base template, so P05 exists as a spec, an IFC and a plan image only. For P08, the built model is saved as `P08build.rvt`. The file named `P08-villa-250m2.rvt` is a base copy that was never renamed. Nine projects have a Revit build behind them, not ten.

## What I'd do next

- **Read the BOQ from the model.** Run `build_boq()` on elements collected from each saved `.rvt` and diff the result against the spec BOQ with `diff_boq()`, which already exists. That turns "the spec is consistent" into "the model matches the spec".
- **Give prices a source.** Add `currency`, `price_date` and `supplier_ref` to the schema, and have the audit flag any price without them. Then the total can be described as more than illustrative.
- **Finish `BatchBuildCmd`.** Port the seven build phases to C#, retarget to `net8.0-windows` for Revit 2025+, and add a `dotnet build` step to CI against the stubs.
- **Fix the loose ends.** Rename the P08 model, either build P05 or drop its `.rvt`, create the views the specs list, and swap `max()` for a real mode in `boq_core`.
- **Price the shell.** Add wall, finish and opening quantities to the BOQ, since the spec already carries wall lengths and room finishes.

## Links

- Case study: [Interiors Toolkit](../projects/interiors-toolkit.html)
