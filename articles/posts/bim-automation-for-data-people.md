---
title: "BIM automation for data people: pyRevit, Revit API, Dynamo"
date: 2026-11-08
summary: "How I treat a Revit model like a database: collectors as queries, parameters as columns, validation as data quality. Patterns and mistakes from two pyRevit portfolio tools, a C# add-in, a Dynamo graph and the IFC/COBie work in my estates lakehouse."
tags: [BIM, Python, Automation]
draft: false
sources:
  - Profile/Portfolio/articles/posts/revit-model-health-score.md
  - Profile/Portfolio/articles/posts/parametric-interiors-boq.md
  - Profile/Portfolio/articles/posts/estates-warehouse-governed.md
  - Py-Revit/InteriorsToolkit.extension/lib/interiors_toolkit/revit_compat.py
  - Py-Revit/src/Interiors.Batch/README.md
  - Py-Revit/src/Interiors.Batch/ResizeChairsCmd.cs
  - Py-Revit/src/Interiors.Batch/BatchBuildCmd.cs
  - Py-Revit/dynamo/README.md
  - Py-Revit/out/bulk_resize_report.md
  - Workspace/BIM_Pyrevit/BIMModelHealthAnalyzer.extension/ui/dialogs.py
  - Workspace/BIM_Pyrevit/DynamoSamples/README.md
  - estates-data-portfolio/STATUS.md
  - estates-data-portfolio/docs/ACCEPTANCE_P11.md
  - estates-data-portfolio/docs/ACCEPTANCE_P12.md
  - estates-data-portfolio/projects/p11-ifc-analytics/src/ifc2tables/extract.py
---

Evidence: two portfolio BIM tools (an [interiors generator](../articles/parametric-interiors-boq.html) that built nine Revit models from JSON, and a [model health auditor](../articles/revit-model-health-score.html) that has never run on a live model), plus the IFC and COBie projects in my estates lakehouse and the [estates warehouse](../articles/estates-warehouse-governed.html). These projects use synthetic or demo data.

I'm a data engineer, not an architect. I came to Revit because the problems inside it are ones I already knew: missing values, inconsistent categories, numbers that drift between two systems. This guide is about how I approach BIM automation with a data engineer's habits, what I got wrong, and when I reach for which tool.

## A Revit model is a database

The mental model that made the Revit API click for me:

| Revit concept | Data engineering equivalent |
|---|---|
| Element (wall, door, chair) | Row |
| Category (Walls, Furniture) | Table |
| Parameter ("Fire Rating", "Price") | Column |
| Type vs instance parameter | Dimension attribute vs fact attribute |
| `FilteredElementCollector` | `SELECT ... WHERE` |
| `Transaction` / `TransactionGroup` | Database transaction / batch |
| Model checks | Data quality rules |
| IFC property set | Entity-attribute-value table |

Once you see it this way, most BIM automation is ETL. You query elements, turn them into records, check them against rules, and write a few values back inside a transaction. The two differences that matter are that the "database" only exists inside a running Revit process, and that its query language is a .NET API.

## The tools, and when I reach for each

```text
                 needs live Revit?   iterate speed   who edits it
pyRevit script   yes                 fast            me (Python)
C# add-in        yes (or headless)   slow            me (compiled)
Dynamo graph     yes                 medium          a BIM team (visual)
ifcopenshell     no                  fast            me (CPython)
```

**pyRevit** is my default. It adds ribbon buttons to Revit and runs a Python script against the open document. Both of my BIM tools are pyRevit extensions. In the interiors project, `pyrevit run` opened a template, built each project from its JSON spec and saved a `.rvt`. Nine of ten specs have a Revit build behind them, and every build log ends with `"errors": []`.

**C#** is for when the code has to run where nobody can click a dialog: Revit Batch Processor or Design Automation. I wrote `Interiors.Batch` (net48) for that. `ResizeChairsCmd` is complete in code: it finds furniture whose family name matches a filter, duplicates each chair type once, sets Width and Depth, and swaps the instances. `BatchBuildCmd` is a skeleton. Its own comment says it "validates + logs the plan" but "does not create elements yet". CI doesn't build the C# project, and the repo has no log of either command running inside Revit.

**Dynamo** is for when a BIM team, not a developer, should own the logic. I've written two graphs: a furniture resize graph that reads a JSON plan, and a fire-rating consistency sample for the health auditor. Neither has a recorded run in a live Revit session. The resize plan they consume was produced headless: 14 updates and 22 skips across the first five specs.

**ifcopenshell** is what I use when I don't need Revit at all. In the interiors project, the IFC4 files for all ten specs were written straight from the JSON with ifcopenshell, not exported from Revit. In the estates lakehouse, an IFC file goes to ten Parquet tables with no Revit anywhere.

**WPF** is behind the health auditor's six-tab dashboard, built in code through `clr.AddReference('PresentationFramework')` with no XAML. That auditor has never run, so the dashboard has never been on screen.

## Pattern 1: turn elements into plain dicts at the boundary

The most useful decision I made was to keep Revit objects out of my rules. In the interiors toolkit, one function converts an element into the plain dict that the audit and BOQ modules use. Every field is read defensively:

```python
def element_to_dict(element, doc=None):
    """Convert a Revit element to the plain dict used by audit/BOQ core.

    Every field is wrapped in try/except: one corrupt element must never
    break a batch of thousands. ...
    """
    d = {"id": 0, "category": "Unknown", "family": "?", "type": "?",
         "level": "", "room": "", "host_id": None, "params": {},
         "point": None, "workset": ""}
    try:
        d["id"] = eid_value(element.Id)
    except Exception:
        pass
```

After that line, nothing downstream knows Revit exists. Validation, audit and BOQ grouping work on lists of dicts, so they run under ordinary pytest. The repo has 54 tests in 12 files, and all of them pass on a machine with no Revit. CI runs them on `windows-latest`.

This is the same idea as a staging layer in a warehouse. Extract once into a neutral shape, then test the transforms on fixtures.

The health auditor shows what happens without it. Every check calls the Revit API directly, so none of it can run without Revit, and it has no tests at all. That's the main reason it carries defects I only found by reading the code.

## Pattern 2: validation is data quality, with the same trade-offs

Model checks are data quality rules with a different vocabulary. The health auditor's parameter check is a profiling rule: group a category by value, call the most common value "expected", and flag any group that holds less than 80% of the elements. The interiors audit flags elements with no Manufacturer, Model or Price, or with an invalid price. On the estates side, the COBie validator reads a 19-sheet spec and scores a workbook. The clean synthetic workbook scores 100.0. The seeded one scores 39.0 with 34 blocking and 20 warning issues, and exits 1, so it can gate CI. The loader is idempotent: a second load of the same workbook gives `inserted=0 ... unchanged=8`.

The trade-offs are the ones you'd expect from data quality work:

- **Majority vote is cheap but noisy.** If a parameter splits 60/40, the 80% rule flags every element, majority included. My Dynamo sample adds an optional expected value. That's the better design: explicit rules where the team has a standard, majority vote only as a fallback.
- **Format checks are not lookups.** In the estates warehouse, Uniclass is a regex on the code's shape, so `Ss_99_99_99` passes. The Uniclass mapper in the estates lakehouse goes further (hybrid matching at 97.81% top-1 against 21.49% for fuzzy alone), but it still runs on placeholder tables, because the project doesn't have the official NBS ones yet.
- **A single score hides scale.** The auditor's `100 - 10×critical - 2×warnings` hits zero after ten missing Fire Ratings, whatever the model size. A ratio of findings per checked element is the fix.

IFC fits the same mould. The estates IFC extractor writes property sets as a long table, one row per element, property set and property:

```python
for rel in f.by_type("IfcRelDefinesByProperties"):
    defn = rel.RelatingPropertyDefinition
    if defn and defn.is_a("IfcPropertySet"):
        for p in defn.HasProperties or []:
            ...
            for rel_obj in rel.RelatedObjects or []:
                prop_rows.append({"global_id": rel_obj.GlobalId,
                                  "pset": defn.Name, "property": p.Name,
                                  "value": val, "unit": None})
```

That's an entity-attribute-value table, and anyone who has pivoted one in SQL knows what to do next. Against a synthetic model with planted defects, the QA report found every one, and the extract of 32 spaces and 5 elements took 0.49 s.

## Pattern 3: one transaction per element, failures logged

Writes go through transactions. In both the pyRevit builder and `ResizeChairsCmd`, I wrap the whole job in one `TransactionGroup` and give each element its own `Transaction` inside a try/except. One bad family rolls back one element and is added to an error list. The batch continues. It's the same as quarantining a bad row instead of failing the load.

The C# collector reads like a query with a WHERE clause:

```csharp
IList<Element> all = new FilteredElementCollector(doc)
    .OfCategory(BuiltInCategory.OST_Furniture)
    .WhereElementIsNotElementType()
    .ToElements();
```

`WhereElementIsNotElementType()` matters. Without it you get type definitions mixed in with placed instances, which is like joining a dimension table into your fact table by accident.

## Mistakes I made: IronPython 2.7 and the Revit API

pyRevit's default engine is IronPython 2.7, not CPython 3. Reading the health auditor's code, I found it would fail before its first check:

- **f-strings and `os.makedirs(..., exist_ok=True)`** are Python 3 only. IronPython 2.7 rejects both, and the scripts have no `#! python3` marker to switch engines.
- **Wrong object.** `doc.Application.ActiveUIDocument` doesn't exist. `ActiveUIDocument` belongs to `UIApplication`, not the database `Application`.
- **Unfiltered collector.** `GetElementCount()` on a collector with no filter isn't allowed. The API wants a filter first.
- **Wrong attribute name.** I tested `hasattr(family, 'FamilySymbol')`, but a family instance exposes `Symbol`. Because `hasattr` doesn't raise, the check just never fires. Silent failures like this are the worst kind.
- **Braces in templates.** The HTML report fills a template with `str.format`, and the inline CSS braces make it raise `KeyError(' font-family')`.

The interiors toolkit is where I applied the lessons. Its core modules avoid f-strings, dataclasses and pathlib, use only the standard library, and start with `from __future__ import print_function, division`, so `/` behaves the same under 2.7 and 3. Revit imports happen lazily inside functions, so the modules import cleanly in tests.

Version drift in the API itself is the other trap. Revit 2024 made `ElementId` 64-bit, and `.IntegerValue` stops working there. So the toolkit reads ids through one helper:

```python
def eid_value(eid):
    try:
        return int(eid.Value)
    except Exception:
        pass
    try:
        return int(eid.IntegerValue)
    except Exception:
        return 0
```

Units are the same story. Revit stores lengths in feet. The Dynamo graph tries `DisplayUnitType.DUT_MILLIMETERS` (Revit 2021 and earlier), then `UnitTypeId.Millimeters` (2022 and later), then falls back to dividing by 304.8.

!!! note "Spec versus model"
    The interiors BOQ ($156,733 at demo prices, across nine projects) is built from the JSON specs, not read back from the saved models. It proves the spec is consistent. The Revit build logs show the same element counts, but the project doesn't yet diff a model-derived BOQ against the spec one. In data terms, I reconciled counts, not values.

## When I'd choose something else

- **Don't need live geometry or views?** Skip Revit and work on IFC with ifcopenshell. It runs in CPython, tests are easy, and CI needs no licence.
- **Running unattended on many models?** Use a compiled C# add-in that reads settings from environment variables and never opens a dialog. `ResizeChairsCmd` does this. Mine still needs a real build against `RevitAPI.dll` and a run.
- **A BIM team will maintain it?** Dynamo, with the rules in a JSON plan rather than in node defaults.
- **Prototyping a check?** pyRevit, but with the extract-to-dicts boundary from day one, and with one engine chosen on purpose.

## Where this stands

- Interiors toolkit: portfolio. Nine Revit builds, IFC4 for all ten specs, 54 passing tests, demo prices.
- Health auditor: portfolio, never run on a live model. The defects above block a first run.
- C# add-in: `ResizeChairsCmd` complete in code, `BatchBuildCmd` a skeleton, no recorded Revit run.
- Dynamo graphs: authored, no recorded live run.
- Estates IFC and COBie work: portfolio, synthetic data, with acceptance docs and tests (6 for IFC, 17 for COBie).
