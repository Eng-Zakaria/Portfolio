---
title: "A 0–100 health score for Revit models: the design, the formula, and what blocks a first run"
date: 2026-11-08
summary: "How my pyRevit model-health auditor turns Revit API checks into a single 0–100 score, the trade-offs behind the formula, and the defects a code review found before the tool has ever run on a live model."
tags: [BIM, Python, Automation]
draft: false
sources:
  - BIM_Pyrevit/BIMModelHealthAnalyzer.extension/tab/Model Health.panel/Model Audit.pushbutton/script.py
  - BIM_Pyrevit/BIMModelHealthAnalyzer.extension/tab/Model Health.panel/Model Audit.pushbutton/bundle.yaml
  - BIM_Pyrevit/BIMModelHealthAnalyzer.extension/lib/utils.py
  - BIM_Pyrevit/BIMModelHealthAnalyzer.extension/lib/revit_helpers.py
  - BIM_Pyrevit/BIMModelHealthAnalyzer.extension/ui/dialogs.py
  - BIM_Pyrevit/BIMModelHealthAnalyzer.CSharp/README.md
  - BIM_Pyrevit/BIMModelHealthAnalyzer.CSharp/FireRatingAuditCommand.cs
  - BIM_Pyrevit/DynamoSamples/README.md
  - BIM_Pyrevit/DynamoSamples/consistency_node.py
---

**Evidence: Portfolio tool, not yet run on a live Revit model.** There is no client, no saved report, no log file and no test suite. Everything below comes from reading the code: about 1,940 lines of Python in a pyRevit extension, plus a small C# add-in sample and a Dynamo sample.

I work on data pipelines, and the idea behind this project is one I use there every day: run checks, count what fails, and turn the count into a number someone can track. Here the dataset is a Revit model instead of a table.

## The problem

Revit is the building-design tool most architecture and engineering firms use. A Revit model is a database of *elements* (walls, doors, furniture, views, sheets). Each element has a *category* (Walls, Doors) and a set of named *parameters*, which work like columns: "Fire Rating", "Type Mark", "Level".

Models get messy the way shared tables do. Required parameters are left blank. Two walls get drawn on top of each other. Views pile up with no template and no naming convention. Nobody notices until a coordination meeting or a schedule export goes wrong. A BIM manager can check by hand, but not on every model every week.

So the question was: can a single button inside Revit audit the open model and give it a 0–100 grade, with a report behind the number?

## Architecture

The tool is a pyRevit extension. pyRevit is a plug-in host that adds ribbon buttons to Revit and runs a Python script against the open document when you click one. That matters for the design: the audit runs **inside Revit, on the live model**, through the Revit API. It does not read an exported file.

```text
Revit (open document)
   |
   | Revit API: FilteredElementCollector by category
   v
+---------------------------- script.py: ModelHealthAnalyzer ----------------------------+
|  orphaned / problem elements   parameter consistency   view audit   performance   worksets |
|  (geometry, missing params,    (80% majority rule)     (template,   (counts,      (borrowed |
|   duplicate walls, unhosted)                            empty, size, links)        elements)|
+----------------------------------------------------------------------------------------+
   |  each analyzer -> report.add_section(name, data)
   v
ModelHealthReport (utils.py)
   |  generate_summary(): critical = orphaned findings
   |                      warnings = parameter outliers + views with issues
   |  score = max(0, 100 - 10*critical - 2*warnings)
   v
+-------------------+   +------------------------+   +--------------------------------+
| JSON report       |   | HTML report (template) |   | WPF dashboard, 6 tabs          |
| ./reports/*.json  |   | ./reports/*.html       |   | (built in code, no XAML)       |
+-------------------+   +------------------------+   +--------------------------------+
```

Each analyzer is a method on one class. It collects elements by category, applies a rule, and adds a section of plain dicts to the report object. Settings live in a JSON config (`config/settings.json`), created with defaults on first run: which categories to check, required parameters per category (Fire Rating and Type Mark on walls and doors, Type Mark on windows), and thresholds such as 10,000 elements per view.

The checks are:

| Analyzer | What it flags | Counts toward score as |
|---|---|---|
| Orphaned / problem elements | Walls, floors, roofs, curtain panels whose geometry is `None` or throws; elements missing a required parameter; walls with the same start/end point (rounded to 0.01 ft); unhosted Generic Models | critical |
| Parameter consistency | Values held by less than 80% of a category's elements | warning |
| View audit | Views with no template, no elements, more than 10,000 elements, or a name that breaks a simple rule (plans need a `-`, sections need "Section"/"Sec") | warning (one per view) |
| Performance | More than 50,000 elements, more than 1,000 stairs/railings/ramps/topography, unloaded links | not scored |
| Worksharing | Borrowed elements, non-editable worksets | not scored |

## Decision 1: a subtractive score instead of a ratio

The score lives in two places, `ModelHealthReport.export_to_html` and the dashboard's overview panel, and both use the same line:

```python
health_score = max(0, 100 - (summary['critical_issues'] * 10) - (summary['warnings'] * 2))
```

Start at 100. Take off 10 points for each critical finding and 2 for each warning. Stop at 0. The dashboard colours it green at 80 or more, orange at 60 or more, and red below that.

I chose this because anyone can recompute it in their head. "You lost 30 points for three duplicate walls" is easy to explain in a meeting. A weighted ratio isn't.

The trade-off is that it ignores model size, and it hits zero fast. Ten critical findings already give a score of 0. On a real project, ten walls missing a Fire Rating is a normal Tuesday, so most real models would score 0 and the number would stop telling you anything. Three critical findings and fifteen warnings give 100 − 30 − 30 = 40, whether the model has 500 elements or 500,000.

The views tab already does it the other way. It shows its own "Health Score" as `(total_views - problematic_views) / total_views * 100`, a ratio. So the tool currently reports two scores built on different ideas. The next version should pick one. I'd go with a ratio of findings per checked element, with a weight for each severity.

## Decision 2: majority vote instead of expected values

For parameter consistency I did not want users to write a rule for every parameter. `ParameterAnalyzer.analyze_parameter_consistency` groups a category's elements by parameter value, takes the most common value as "expected", and flags every group that holds less than 80% of the elements:

```python
if len(parameter_values) > 1:
    for value, elems in parameter_values.items():
        if len(elems) < len(elements) * 0.8:  # Less than 80% have this value
```

This works without setup, and it's the same idea as a profiling check on a column: if 95% of rows say "2 HR", the other 5% are worth a look.

It has two weaknesses. First, if no value reaches 80%, every group gets flagged, including the majority, so a parameter split 60/40 turns 100% of its elements into warnings. Second, the parameters it checks are hard-coded as `Type Mark`, `Family` and `Type Name`. Family and Type Name are *supposed* to vary across a category, so they mostly produce noise. Type Mark is a type parameter, and an instance-level `LookupParameter` normally won't find it at all. The Dynamo sample (`consistency_node.py`) uses the same 80% rule but adds an optional expected-value input. That's the better design: majority vote by default, explicit expected values where the team has a standard.

## Decision 3: run inside Revit rather than on exported data

Running in pyRevit means no export step. The tool sees the live model, including geometry, view templates, links and worksets, and the one write action (deleting duplicate walls) can go through a Revit transaction. `RevitHelper.safe_execute_in_transaction` starts a transaction, runs the function, commits, and rolls back on any exception.

The cost is testability. Every check calls the Revit API directly, so none of it runs without Revit, and there are no tests. In a separate pyRevit toolkit I split the logic differently: a thin Revit script turns elements into plain dicts, and the audit rules run on those dicts, so they can be unit-tested with ordinary Python. This tool would benefit from the same split.

## Results

There are no run results to report. The repository has no `reports/` folder, no `logs/model_health.log`, no `config/settings.json` (it would be created on first run), and no tests. The C# README says plainly that its sample was "not compiled or tested here", and the Dynamo README says the graph was authored "without a live Revit session".

What I could check without Revit was the code itself. One check I ran: the HTML report template is filled with `str.format`, but it has CSS rules like `body { font-family: ... }` inline. Running the same pattern in Python gives `KeyError(' font-family')`, so the HTML export would fail before writing a file.

Reading the rest of the code turned up these blockers for a first run:

| Area | Defect |
|---|---|
| Start-up | `RevitHelper.__init__` reads `doc.Application.ActiveUIDocument`. That property belongs to `UIApplication`, not the database `Application`, so the constructor fails. |
| Runtime | The scripts use f-strings and `os.makedirs(..., exist_ok=True)`. pyRevit's default engine is IronPython 2.7, which rejects both, and there is no `#! python3` engine marker. |
| Imports | `script.py` adds only `lib/` to `sys.path`, then imports `ui.dialogs`. It also uses `datetime` and `MessageBoxIcon` without importing them. |
| Counting | `analyze_model_performance` calls `GetElementCount()` on a collector with no filter. The Revit API requires a filter first. |
| Checks | The unhosted-family check tests `hasattr(family, 'FamilySymbol')`, but a family instance exposes `Symbol`, so the check never fires. |
| Reports | Apart from the `KeyError`, the HTML section builder reads keys (`element`, `value`, `expected`) that the parameter records don't have (`element_name`, `current_value`, `expected_value`). |
| Fix-ups | `fix_common_issues` calls `fix_parameter_consistency` and `cleanup_duplicate_views`, which aren't defined. The dashboard's Delete, Select, Export and Fix buttons only show a message box. |
| Packaging | `bundle.yaml` points to a `BIMModelHealthAnalyzer.dll` and an `icon.png`, and neither is in the folder. |

!!! note "Where this stands"
    The audit → score → report design is complete and the scoring rule is clear. The implementation is a first draft. It has never run against a live model, so I have no recorded score, runtime or issue count to report.

## What I'd do next

1. **Make it run.** Fix the start-up and import defects, choose one Python engine (CPython via pyRevit's `#! python3` marker, or rewrite for IronPython 2.7), and build the HTML report with a templating step that escapes CSS braces.
2. **Split extraction from rules.** Have the Revit script turn elements into plain dicts, and run the checks on those dicts with pytest, using a small fixture model.
3. **Normalise the score.** Score findings per checked element, give each severity a weight, and use the same formula in the HTML report and on every dashboard tab.
4. **Configurable consistency rules.** Drop Family and Type Name. Check instance and type parameters separately. Let the config name expected values, and fall back to majority vote only where none are set.
5. **Record evidence.** Run it on a sample model (Autodesk ships some), and commit the JSON report and the timing log so the numbers in the write-up can be checked.

## Links

- Case study: [BIM Model Health Analyzer](../projects/bim-model-health.html)
