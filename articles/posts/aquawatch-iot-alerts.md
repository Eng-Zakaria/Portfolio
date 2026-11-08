---
title: "AquaWatch: sensor alerts with cooldown logic"
date: 2026-11-08
summary: "A fish-farm monitoring prototype with simulated sensors, an Airflow load into TimescaleDB, and a 15-minute alert cooldown per pond and parameter. What the cooldown does, and what I found when I tested the alert rules."
tags: [IoT, Streaming, Alerting]
draft: false
sources:
  - AquaWatch/README.md
  - AquaWatch/docs/ARCHITECTURE.md
  - AquaWatch/docs/PRD.md
  - AquaWatch/docs/ROADMAP.md
  - AquaWatch/docs/RISK_REGISTER.md
  - AquaWatch/sensors/sensor_simulator.py
  - AquaWatch/airflow/dags/ingest_sensor_data.py
  - AquaWatch/alerting/alert_manager.py
  - AquaWatch/backend/main.py
  - AquaWatch/provisioning/docker-compose.yml
  - AquaWatch/provisioning/postgres/init.sql
  - AquaWatch/Dockerfile.sensor
---

**Evidence: portfolio project, simulated sensors only.** No physical probes, no farm, and no real SMS or phone calls. AquaWatch is a local prototype. A Python simulator writes fake readings for fish ponds, an Airflow DAG loads them into TimescaleDB, and a separate alert module checks thresholds and holds back repeat alerts with a cooldown. This post covers how that cooldown works, the trade-offs behind it, and what turned up when I tested the alert rules directly. Some of it is not flattering.

## The problem

Water quality in a fish pond can go bad between two manual checks. The PRD lists four parameters that matter: pH, dissolved oxygen, ammonia, and temperature. It targets small operators with 1 to 5 ponds. The success metrics it sets are alert latency under 5 minutes and 95%+ uptime in local testing. Those are targets. I never measured either one.

Any threshold alert has an obvious failure mode. A pond that sits above the ammonia limit for an hour crosses the threshold on every reading. If every crossing sends an email, the operator gets a pile of identical messages and starts ignoring them. The cooldown is meant to stop that.

## Architecture

```text
 sensors/sensor_simulator.py
   pH, dissolved_oxygen, ammonia, temperature per pond
   writes one JSON line per pond per tick
            |
            v
   logs/sensor_readings.jsonl
            |
            v
 airflow/dags/ingest_sensor_data.py   (schedule: '@every_5_minutes')
   reads the whole file, flattens to (time, pond_id, parameter, value)
   execute_batch(page_size=100)
            |
            v
 TimescaleDB  sensor_readings  (create_hypertable on 'time')
            |
            +--> backend/main.py (FastAPI: /readings, /alerts, /analytics)
            +--> Grafana 10.1.5 container (no dashboards checked in)

 alerting/alert_manager.py   <-- NOT called by the DAG or the API
   thresholds + 15-min cooldown per (pond_id, parameter)
   -> alerts.jsonl, SMTP email, mock_sms.log
```

The bottom box matters most for the rest of this post. `AlertManager` is a self-contained class with a `__main__` example. Nothing in the DAG, the API, or Docker Compose imports it. The architecture doc draws an arrow from the database to the alert module, but the code doesn't have that link yet.

There's no MQTT either. Readings move as lines in a JSONL file. The only mention of MQTT is a comment in the mock actuator endpoint ("In a real system this would push a command to an MQTT topic").

## Decision 1: cooldown keyed on pond and parameter

This is the core of the alert module:

```python
def _get_alert_key(self, pond_id: int, parameter: str) -> str:
    return f"{pond_id}_{parameter}"

def _should_alert(self, pond_id: int, parameter: str) -> bool:
    key = self._get_alert_key(pond_id, parameter)
    current_time = datetime.now()
    if key in self.last_alert_times:
        if current_time - self.last_alert_times[key] < timedelta(minutes=self.alert_cooldown_minutes):
            return False
    self.last_alert_times[key] = current_time
    return True
```

What it does:

- **Scope:** one timer per pond and parameter pair. Ammonia in pond 1 and ammonia in pond 2 are tracked separately, and so are ammonia and temperature in the same pond. Nothing is scoped per farm. The code has no farm concept at all.
- **Duration:** `alert_cooldown_minutes` defaults to 15. The FastAPI app also reads an `ALERT_COOLDOWN_MINUTES` environment variable (default 15), but it never uses it.
- **Re-arm:** the timer only resets when an alert actually fires. Inside the window, breaches are dropped without being counted.
- **State:** a plain Python dict in memory, so restarting the process clears it.

**Trade-off.** Keying on pond and parameter is the right granularity for an operator. "Pond 2 ammonia" is something you can act on, and one noisy pond can't hide an alert from another. The cost comes from keying on the *parameter* and not the *severity*. I didn't see it until I tested the code: the first alert in a window blocks the rest, including a later critical one. Keeping the state in memory makes the class easy to test, but a scheduled job that starts a new process on each run would never suppress anything, and a long-running process loses its state on every deploy.

## Decision 2: a file and a batch DAG, not a message stream

The simulator appends JSON lines to a file. The DAG reads the whole file, flattens each reading into four rows, creates the table and hypertable, and inserts with `execute_batch(..., page_size=100)`.

**Trade-off.** A file is easy to inspect and needs no broker, which suits a laptop prototype. The cost is latency and correctness. In the best case, data lands in the database on a 5-minute schedule. It also has three problems I can see from reading the code. I haven't run the stack to confirm them:

- The DAG reads the full file on every run and never truncates it or stores an offset, so every run would re-insert every earlier reading.
- `create_hypertable('sensor_readings', 'time')` runs every time without `if_not_exists`, which TimescaleDB rejects once the table is already a hypertable.
- `'@every_5_minutes'` is not one of Airflow's schedule presets. I'd expect the DAG to fail at parse time until that line is changed to a cron string or a `timedelta(minutes=5)`.

The cadence numbers need a caveat too. The simulator class defaults to `sampling_interval=300` seconds and a 10% anomaly rate. The container runs the file's `__main__` block, though, which uses `sampling_interval=10` and `anomalies_probability=0.3`. So the Docker setup samples every 10 seconds with a 30% anomaly rate, not every 5 minutes with 10%.

## Decision 3: real email, mocked SMS

`send_email_alert` uses `smtplib` with STARTTLS. That path is real, but the shipped config has placeholder credentials, so it fails and logs an error until someone sets up SMTP. SMS is fully mocked. `log_sms_alert` writes a Twilio-shaped JSON record (`'to': f'+1{pond_id}000'`, `'from': '+1AQUAwatch'`) to `mock_sms.log`. Nothing is sent to a phone, and there's no Telegram, voice, or SNS integration.

**Trade-off.** Mocking SMS keeps the project free and offline, and it still shows the message format. But it also means the portfolio card's "farms that phone home" line has nothing real behind it. The only network notification is email, and only if you configure it.

## Results

There are no tests in the repo and no saved outputs (`grafana/provisioning/`, `dashboard/`, `dags/`, and `plugins/` are empty). So I wrote a small probe that imports `AlertManager` and the simulator directly, with email turned off and every output going to a scratch folder. No services ran. Here are five calls against one fresh manager:

| Input | Expected | What the code did |
|---|---|---|
| ammonia 2.5 ppm | critical (above 2.0) | one alert labelled **high**. The critical check was suppressed by the cooldown that the high alert had just set |
| ammonia 3.0 ppm, seconds later | suppressed | suppressed (the cooldown works) |
| dissolved oxygen 7.0 mg/L | no alert (healthy) | **CRITICAL** alert |
| dissolved oxygen 3.0 mg/L | critical (below 4.0) | no alert |
| pH 6.0 | alert if low-pH rules existed | no alert. pH thresholds are never found |
| temperature 29.0 °C | high (above 28.0) | high (correct) |

There are three separate bugs here:

1. **Severity is lost.** The loop checks levels in dict order (`high` before `critical`), and both checks share one cooldown key. Whichever level matches first takes the window, so a critical reading is always reported as high.
2. **Dissolved oxygen is inverted.** Its thresholds are `{'low': 5.0, 'critical': 4.0}`, but every comparison is `value > threshold`. A healthy pond triggers a critical alert, and a pond running out of oxygen triggers nothing. That's the opposite of what the alert is for, on the parameter most likely to kill fish quickly.
3. **pH never alerts.** The thresholds dict uses the key `'pH'`, but the lookup is `thresholds.get(parameter.lower())`, which asks for `'ph'`.

The simulator has its own issues. Over 20,000 generated readings with a fixed seed:

- about **45%** of ammonia readings marked normal were above the 1.0 ppm high threshold, because "normal" values come from the full 0–2.0 range;
- about **18%** of parameter readings had an `is_anomalous` flag that didn't match their `note`, because the flag rolls the dice a second time;
- about **0.7%** of values were negative (ammonia or temperature anomalies that drop below zero).

!!! note "What actually holds up"
    The per-pond, per-parameter cooldown does what it says: a repeat breach inside 15 minutes is dropped, and different ponds and parameters don't block each other. Temperature and ammonia high-threshold checks fire correctly. The FastAPI read endpoints are coherent SQL against `sensor_readings`. But the `alerts` table they query is never created anywhere: `init.sql` only enables the TimescaleDB extension.

Other gaps: there's no `.env.example` even though the README says to copy one. The compose file has no backend service. And the compose paths are written as if run from the repo root while the file sits in `provisioning/`.

## What I'd do next

In order of how much damage each bug can do:

1. **Fix the comparisons.** Give each threshold a direction (`above` / `below`), and check levels from most to least severe so critical wins.
2. **Key the cooldown on (pond, parameter, severity)**, or let a higher severity break through an active lower-severity window. An escalation should never be quiet.
3. **Persist cooldown state** in the `alerts` table (create it first). Then "should I alert?" becomes a query for the last alert per key, and restarts stop mattering.
4. **Wire the alerting into the pipeline.** Run it as a second DAG task after the load, over only the rows that task just inserted.
5. **Make ingestion incremental.** Track a file offset or a max ingested timestamp, add `if_not_exists => TRUE`, and fix the schedule string.
6. **Write the tests I just ran by hand** as pytest cases, and fix the simulator's double roll and its "normal" range.
7. **Check in a Grafana datasource and dashboard JSON**, then actually measure alert latency against the 5-minute target.

None of this needs MQTT or a real SMS provider. Both would make sense later, once the rules are correct.

## Links

- Case study: [AquaWatch — Fish-Farm Monitoring](../projects/aquawatch.html)
- Code: local project, no public repository.
