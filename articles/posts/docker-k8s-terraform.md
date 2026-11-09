---
title: "Platform as code: Docker Compose, Kubernetes, Terraform, Jenkins"
date: 2026-11-08
summary: "How I containerise services with Docker Compose, gate repos with GitHub Actions, and write Terraform, Kubernetes and Jenkins configuration, with the exact status of each piece in the projects I draw from."
tags: [DevOps, Docker, Infrastructure as Code]
draft: false
---

This guide covers how I package and ship data services: Docker and Compose, CI on GitHub Actions, Terraform, Kubernetes manifests, Jenkins and Prometheus. Evidence: drawn from my production work at Waffarha (the assistant's Docker Compose deploy on Huawei Cloud, and the recommender's Docker image built on the company CI), the estates lakehouse's GitHub Actions setup, and several portfolio stacks linked below. Each one is labelled with its status.

## Where each tool shows up

| Tool | Where | Status in that project |
|---|---|---|
| Docker Compose | Waffarha assistant, Docker Compose deploy on Huawei Cloud | Production; one-command deploy |
| Dockerfile + Jenkins | Waffarha recommender, built on the company CI | Production, live service |
| GitHub Actions | Estates lakehouse: ci, nightly, docs, release, security + a reusable workflow | Written; getting it green on GitHub is next |
| Compose stacks | Retail (15 services), petroleum (16 + 4 override = 20), fraud (infra only) | Portfolio |
| Terraform | Estates (S3/Glue/Athena), telecom (10 Azure modules), petroleum | Written; validate in CI planned |
| Kubernetes, Jenkins (JCasC) | Petroleum platform | Scaffold |
| Prometheus | Retail API `/metrics`; scrape configs in retail, petroleum, e-finance | Portfolio |

## Docker and Compose: the part I use every week

I reach for Compose whenever a service has more than one dependency, which for data work is almost always. The Waffarha assistant's file is the pattern I now copy into new projects. Three habits in it matter more than the rest.

Health checks with conditional startup, so the API never boots against a database that isn't ready:

```yaml
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      ollama:
        condition: service_started
```

Memory limits and reservations on every service (2 GB for Postgres, 512 MB for Redis, 8 GB for Ollama, 4 GB for the backend), so one container can't starve the others on a single host. And profiles: the frontend dev server only starts with `--profile dev`, the nginx reverse proxy only with `--profile prod`, so one file covers both.

The recommender's Dockerfile shows the image-level habits: a slim Python base, a non-root `appuser`, and a `HEALTHCHECK` that calls the service's own `/status` endpoint, so the orchestrator restarts a process that is up but not answering. The backend image of the assistant does the same with a multi-stage build that keeps compilers out of the runtime layer.

### Compose lessons

- **Unpinned images.** The assistant pulls `ollama/ollama:latest`, and the retail stack uses `prom/prometheus:latest`. A rebuild next month can change behaviour without a code change. I pin versions now.
- **Dev conveniences in a "production-ready" file.** The backend service bind-mounts `./backend` over the code baked into the image. That is great for editing live and wrong for a deploy, where the image should be the artifact. Compose files also carried default database credentials inline; those belong in an env file.
- **Half-containerised stacks.** In the [fraud-scoring project](../articles/fraud-scoring-kafka.html), Compose runs Postgres, Redis, Kafka, Airflow and MLflow, but the API, consumer and dashboard are started by hand and have no Dockerfile. In the [petroleum platform](../articles/petroleum-nifi-beam-flink.html), `nifi-2` and the Flink JobManager both bind host port 8081.

## CI with GitHub Actions: a gate is only a gate if it goes green

The estates lakehouse has the most complete CI setup I've written. The `ci` workflow runs one long job:

```text
ruff lint + format -> mypy -> pytest (coverage >= 80%)
  -> generate small synthetic profile -> ingest bronze/silver + reconcile
  -> dbt build -> DQ gate (fails on error severity) -> sqlfluff
  -> terraform fmt + init -backend=false + validate -> tflint
  -> docker compose config --quiet -> Airflow DagBag import test
  -> mkdocs build --strict -> governance pack checks
```

Around it sit a `nightly` full-profile run at 02:00 that opens an issue on failure, a `docs` workflow that builds dbt docs and the demo pages and deploys them to GitHub Pages, a `release` workflow, and a weekly `security` workflow with pip-audit, gitleaks and CodeQL. Shared lint-and-test steps live in a reusable `workflow_call` file.

The design is lint and tests first, then the dbt build and a DQ gate that fails on error severity, with a nightly full-profile run behind it; getting the `ci` and `nightly` workflows green on GitHub is the next step.

## Terraform: one tree, gated, validated in CI

My Terraform so far is design-stage, and each repo says so. The estates lakehouse defines an S3 bucket with versioning, server-side encryption and a public-access block, a Glue catalog database, an Athena workgroup with a scan limit, a read-only IAM role and a monthly budget. CI is written to run `fmt -check`, `init -backend=false`, `validate` and `tflint` against it; it hasn't been applied yet.

The [telecom lakehouse](../articles/telecom-lakehouse-8-domains.html) goes further: ten modules and four environments, with every Azure resource gated on one `use_local_dev` flag (`count = var.use_local_dev ? 0 : 1`) so the same tree serves local and cloud. The Key Vault example is in that write-up.

The lesson there was that the local path is mostly "skip everything", so it never tests the cloud path. With the flag off, the Key Vault module references resources that aren't declared, and the Fabric module uses resource types the pinned azurerm 3.x provider doesn't define. A `validate` with the flag off would have caught both. In the petroleum platform, Terraform is provider blocks and a namespace, with empty module folders.

## Kubernetes and Jenkins

At Waffarha, the recommender service is built on the company CI (Jenkins). The job definition lives there rather than in the repo copy I write from. The project's status notes also list the next CI steps for it: run four focused tests before the build, add secret scanning, and move the nightly schedule out of the app's in-process loop into Jenkins or cron, as described in [the recommender article](../articles/fail-open-nightly-recommender.html).

The petroleum platform is where I wrote both from scratch, and it is a scaffold. Jenkins is configured as code with JCasC: four executors, a Docker cloud with Maven and Python build-agent templates, and Job DSL scripts that create five pipeline folders (scrapers, stream processing, batch, infrastructure). The pipeline definitions are next, along with installing the configuration-as-code and Job DSL plugins on the stock `jenkins/jenkins:lts-jdk17` image and pointing `CASC_JENKINS_CONFIG` at the mounted file.

The Kubernetes side is a namespace and one NiFi Deployment under `kubernetes/base/`. Its `kustomization.yaml` lists `service.yaml`, `pvc.yaml` and `configmap.yaml`, which are still to be written. The habit is the same as for CI: run `kustomize build` and `kubectl apply --dry-run=server` in a pipeline so missing files fail fast.

## Prometheus: export first, then scrape

The [retail pipeline's](../articles/retail-cdc-debezium.html) API is the one place I instrumented code: a `Counter` for requests by method, endpoint and status and a `Histogram` for duration, updated in middleware and served at `/metrics` with `generate_latest()`. Its `prometheus.yml` also lists Postgres, Redis, Kafka, node and cAdvisor exporters, which come next as Compose services, and the petroleum stack's Grafana dashboards are waiting on their exporters. My rule is to add a scrape target only after the exporter exists and `curl`-ing its endpoint returns metrics.

## Git and Linux

Everything here lives in Git: GitHub for my own repositories, with Dependabot, gitleaks and CodeQL wired in on the estates repo, and Bitbucket for Waffarha. The images I build run on Debian-slim Python bases as non-root users, and the operational habits above (health checks, resource limits, `docker compose config` as a lint step) are the ones I apply to every new stack.

## When I'd choose something else

- **A single host, a handful of services:** Compose with health checks and limits. It is what the Waffarha assistant uses.
- **Many services, rolling updates, autoscaling:** Kubernetes, with manifests checked by `kustomize build` and server-side dry-run in CI before anything is applied.
- **Repo-local checks:** GitHub Actions, kept short and green. **Company build infrastructure that already exists:** use its Jenkins, as the recommender does, rather than adding a second system.
- **Cloud resources:** Terraform with remote state from day one, and `validate` run with every feature flag in both positions.

[Get in touch](../index.html#contact).
