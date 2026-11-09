---
title: "GCP, AWS, Azure, Huawei: what multi-cloud means day to day"
date: 2026-11-08
summary: "Multi-cloud in practice is less about picking a provider and more about credentials, network paths, clocks and failure domains. A nightly job that reads from Google Cloud Storage and writes to MySQL on AWS, an assistant deployed with Docker Compose on Huawei Cloud, and the infrastructure code I write for AWS and Azure."
tags: [Cloud, AWS, GCP]
draft: false
---

"Multi-cloud" sounds like an architecture decision. Most days it is something smaller: two sets of credentials in one process, a network path that only exists through a jump host, and two clocks that disagree about when "tonight" is. Evidence: drawn from my production work at Waffarha (a nightly recommender that spans GCP and AWS, and the customer-service assistant on Huawei Cloud) and three portfolio builds for AWS and Azure, each labelled below.

## What I use each cloud for

| Cloud | What runs there in the work below | Status |
|---|---|---|
| GCP | Cloud Storage: daily MoEngage event exports the recommender reads | Production, Waffarha |
| AWS | EC2 as an SSH jump host, MySQL on RDS that the app reads recommendations from | Production, Waffarha |
| Huawei Cloud | The assistant: Docker Compose deploy on Huawei Cloud | Production, Waffarha |
| AWS | Portfolio CDK stack (API Gateway, 6 Lambdas, DynamoDB, S3, CloudFront) | Portfolio, pre-deploy |
| Azure | Terraform modules (Key Vault, Blob, Event Hubs, Data Factory, Databricks, Fabric) | Portfolio design, pre-apply |
| Azure | `cloudkit`: one SDK layer for Azure emulators or real Azure, plus a Bicep template | Portfolio lab |

## Two clouds, one nightly job

The recommender is the clearest example of two clouds in one job ([full write-up](../articles/fail-open-nightly-recommender.html)). At 00:00 Cairo time it pulls the last day of event exports from a GCS bucket, builds item-to-item similarity, and upserts each user's picks into MySQL on AWS RDS in batches of 5,000 rows.

The GCS side authenticates with a service account whose JSON lives in an environment variable, not a key file on disk:

```python
sa_info = json.loads(os.environ["GCP_SA_JSON"])
creds = service_account.Credentials.from_service_account_info(sa_info)
client = storage.Client(credentials=creds, project=creds.project_id)
cutoff = datetime.now(timezone.utc) - timedelta(days=days)
```

The AWS side is different in kind. RDS is not reachable from where the job runs, so every write goes through an SSH tunnel to an EC2 host, and MySQL connects to a local port the tunnel picks:

```python
with SSHTunnelForwarder(
    (EC2_HOST, EC2_PORT),
    ssh_username=EC2_USER,
    ssh_pkey=EC2_KEY_PATH,
    remote_bind_address=(RDS_HOST, RDS_PORT),
    local_bind_address=("127.0.0.1", 0),   # pick a free local port
) as tunnel:
    conn = pymysql.connect(host="127.0.0.1", port=tunnel.local_bind_port, ...)
```

Before opening anything, `validate_db_env()` checks that every host, user and key path is set and that the key file exists. It is a small check with a big payoff: a missing variable fails in the first second with its name, not later as a timeout from the wrong cloud.

### What "day to day" actually means here

- **Two credential stories.** GCP gets a service-account JSON; AWS gets an SSH key plus a database user. They rotate on different schedules and fail with different errors. I keep them in separate env vars and validate both at startup.
- **Two failure domains.** GCS can be fine while the tunnel is down, and the other way round. A third system, ClickHouse, supplies the active-offer filter. When it is unreachable, the job fails open and writes recommendations without the filter, which the write-up covers in detail, including the trade-off.
- **Two clocks.** The schedule is Cairo time (`TZ_NAME = "Africa/Cairo"`), the GCS cutoff is UTC, and `generated_at` is written to MySQL as naive UTC. That is fine as long as everyone reading the table knows it. I'd put the time zone in the column comment, because "naive" means "someone will guess".

## Huawei Cloud: where the assistant lives

Waffarha's bilingual customer-service assistant runs as a Docker Compose deploy on Huawei Cloud. Offer cards in the assistant show product photos served through a CDN.

The reason Huawei comes up in design work is location. When we costed self-hosted GPU options for the assistant, the cost report described a Huawei Cairo GPU quote as the only route that keeps data in Egypt with zero ops. It was also the most expensive option in that report, and the quote itself is marked unverified there, so I treat it as a placeholder until it's confirmed. The lesson that carried over: for some workloads the region is the requirement, and the provider follows from it.

I also hold the Huawei HCIP Big Data certification (H13-723).

## AWS beyond EC2 and RDS: a portfolio CDK stack

A portfolio CDK stack (API Gateway, 6 Lambdas, DynamoDB, S3, CloudFront), pre-deploy, written in TypeScript ([write-up](../articles/aws-serverless-blueprint.html)). The habit it reinforced: run `cdk synth` and a CDK assertions test before anything else, and design DynamoDB keys from the queries backwards (its next step is flipping the table to a `userId` partition key).

## Azure: infrastructure code and a local twin

Two portfolio projects carry my Azure infrastructure work.

The telecom lakehouse design has Terraform modules for Key Vault, VNet, Blob, Event Hubs, Data Factory, Databricks and a Fabric capacity across four environments, every Azure resource gated on one `use_local_dev` flag ([write-up](../articles/telecom-lakehouse-8-domains.html)). Its first apply is ahead, and the write-up covers validating it with the flag in both positions.

The Azure local lab is the layer I'd put under any Azure data project. Code uses the official Azure SDKs; one environment variable decides whether they reach Microsoft's emulators in Docker Compose (Azurite, the Event Hubs and Service Bus emulators, Cosmos DB) or real resources over Entra ID with no keys:

```python
def blob_service(s: Settings | None = None) -> BlobServiceClient:
    s = s or Settings.from_env()
    if s.is_local:
        return BlobServiceClient.from_connection_string(blob_connection_string(s))
    s.require("storage_account")
    url = f"https://{s.storage_account}.blob.core.windows.net"
    return BlobServiceClient(account_url=url, credential=credential())
```

`credential()` is `DefaultAzureCredential`: `az login` on a laptop, managed identity in Azure. The cloud side is a Bicep template, and the README tells you to set a budget alert before the first deploy and tags every resource `ttl: delete-same-day`. Services with no emulator, such as Data Factory and Fabric, sit behind an interface and each project says so in its README.

## Lessons, and what I do now

- **A local flag that skips the cloud path tests nothing.** In the telecom Terraform, the local path is mostly "create nothing", so undeclared references and provider resources that don't exist in the pinned version went unnoticed. The fix is to run `terraform validate` with the cloud flag on in CI, even when nothing gets applied.
- **Synth before done.** A plan or synth artifact is the minimum before I call infrastructure done.
- **A tunnel per run is a dependency you don't see.** The recommender's path to RDS depends on one EC2 host and one key. It works, but it's the first thing I'd move to a private network route, and until then it's the first thing the startup check verifies.
- **Fail open needs a flag.** Writing recommendations without the active-offer filter is right for the batch, but the app should know it happened. The fix I want is a run-status flag and a loud alert.

## When multi-cloud is worth it

I don't pick multi-cloud on purpose. It happens because data already lives somewhere: the marketing tool exports to GCS, the backend lives on AWS, the assistant has to sit in a Cairo region. When that's the situation, my rules are short. Move files, not connections, across clouds where possible. Validate every credential at startup. Write down the time zone of every timestamp. And make each cloud's failure a separate, named branch in the code, not one generic exception.

*If you run jobs that cross clouds, I'd like to hear how you handle the network path. [Get in touch](../index.html#contact).*
