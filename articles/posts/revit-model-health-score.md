---
title: "A 0–100 health score for Revit models: design and scoring trade-offs"
date: 2026-11-08
summary: "How my pyRevit model-health auditor turns Revit API checks into a single 0–100 score, the trade-offs behind the formula, and the next steps to a first run on a live model."
tags: [BIM, Python, Automation]
draft: false
---

**Evidence: Portfolio tool, not yet run on a live Revit model.** About 1,940 lines of Python in a pyRevit extension, plus a small C# add-in sample and a Dynamo sample.

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

The cost is testability. Every check calls the Revit API directly, so none of it runs without Revit. In a separate pyRevit toolkit I split the logic differently: a thin Revit script turns elements into plain dicts, and the audit rules run on those dicts, so they can be unit-tested with ordinary Python. This tool would benefit from the same split.

## Where this stands

The audit → score → report design is complete and the scoring rule is clear. The implementation is a first draft, and the first run on a live model is the next milestone.

## Next steps

1. **First run on a sample model.** Pin the Python engine (pyRevit's `#! python3` marker), tidy the start-up path and imports, build the HTML report with a templating step that handles CSS braces, then run it on an Autodesk sample model and commit the JSON report and timing log.
2. **Split extraction from rules.** Have the Revit script turn elements into plain dicts, and run the checks on those dicts with pytest, using a small fixture model.
3. **Normalise the score and the consistency rules.** Score findings per checked element with a weight per severity, use the same formula everywhere, and let the config name expected values, falling back to majority vote only where none are set.

## Links

- Case study: [BIM Model Health Analyzer](../projects/bim-model-health.html)
