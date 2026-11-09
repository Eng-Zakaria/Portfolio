---
title: "A serverless task API in AWS CDK: design before the first deploy"
date: 2026-11-08
summary: "Portfolio CDK stack (API Gateway, 6 Lambdas, DynamoDB, S3, CloudFront), pre-deploy. What the stack defines, the design choices behind it, and the steps before the first deploy."
tags: [AWS, Serverless, Infrastructure as Code]
draft: false
---

Evidence: Portfolio CDK stack (API Gateway, 6 Lambdas, DynamoDB, S3, CloudFront), pre-deploy. The README maps it to ten AWS topics; this post walks through the code and the design choices.

## The problem

I wanted one small project that touches the standard AWS serverless pieces end to end: an HTTP API, functions behind it, a managed database, file uploads, a static frontend behind a CDN, and the whole thing declared as code. A task manager is a good fit because the data model is trivial, so the interesting parts are the infrastructure and the access patterns, not the business logic.

The goal was a stack that a single `cdk deploy` could create and a single `cdk destroy` could remove, without hand-built resources in the console.

## Architecture

The CDK app (`infrastructure/bin/app.ts`) instantiates one stack, `TaskManagerStack`. A second `PipelineStack` for CodePipeline is written but commented out of the app.

```text
 Browser (React SPA)
   |                         \
   | static assets            \ REST calls (userId from localStorage)
   v                           v
 CloudFront ──> S3 frontend    API Gateway REST API, stage "prod"
 bucket (SSE-S3)               /tasks          POST -> createTask
                               /tasks          GET  -> listTasks
                               /tasks/{taskId} GET  -> getTask
                               /tasks/{taskId} PUT  -> updateTask
                               /tasks/{taskId} DELETE -> deleteTask
                               /upload         POST -> uploadFile
                                     |                    |
                                     v                    v
                       DynamoDB "TaskManager-Tasks"   presigned PUT URL
                       PK taskId, SK userId           -> S3 uploads bucket
                       GSI StatusIndex (status,       (versioned, SSE-S3)
                       createdAt), on-demand, PITR

 CloudWatch: Lambda logs (1-week retention), API stage metrics,
             one alarm on API 4XX >= 10 in one period (no action wired)
```

What the stack defines, counted from `task-manager-stack.ts`:

| Resource | Count | Notes |
|---|---|---|
| Lambda functions | 6 | Node.js 18, 30 s timeout, one shared IAM role |
| API Gateway methods | 6 | on 3 resources, CORS open to all origins |
| DynamoDB tables | 1 | plus 1 GSI, pay-per-request, point-in-time recovery |
| S3 buckets | 2 | uploads and frontend, both `RemovalPolicy.DESTROY` |
| CloudFront distributions | 1 | HTTPS redirect, SPA 404 → `index.html` |
| CloudWatch alarms | 1 | client errors, no SNS target |
| Stack outputs | 4 | API URL, CloudFront URL, two bucket names |

## Decisions and trade-offs

### One Lambda per route

Each API method has its own function and its own folder under `backend/functions/`. The upside is small, readable handlers and per-route logs and metrics in CloudWatch without extra tagging. The cost shows up immediately in the stack file: six nearly identical `new lambda.Function(...)` blocks, and six handlers that each repeat the same CORS headers and error envelope. A shared helper or a single router function would remove most of that. For this project the split was worth it, because it made the API Gateway-to-Lambda wiring explicit route by route.

The six functions also share one execution role, which has read-write on the table and the uploads bucket. That is simpler than six roles, but it is not least privilege: `getTask` can write to S3 and `uploadFile` can delete tasks.

### Uploads through presigned URLs

`uploadFile` never touches the file. It checks the MIME type against a short allowlist, builds a key, and returns a presigned S3 PUT URL valid for an hour:

```javascript
const fileKey = `uploads/${userId}/${Date.now()}-${fileName}`;
const command = new PutObjectCommand({
  Bucket: BUCKET_NAME,
  Key: fileKey,
  ContentType: fileType,
});
const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
```

This keeps file bytes out of API Gateway and Lambda, so payload limits and Lambda run time don't matter for uploads. The trade-off is that the server no longer sees the file: the type check only covers what the client claims, there is no size limit, and nothing records the upload against a task. The raw `fileName` also goes straight into the key, so it should be sanitised.

### The DynamoDB key design, and what I'd change

The table uses `taskId` as the partition key and `userId` as the sort key. A `StatusIndex` GSI on `status` and `createdAt` supports "tasks with status X".

That key order is the first thing I'd change. `listTasks`, when no status filter is given, does this:

```javascript
new QueryCommand({
  TableName: TABLE_NAME,
  KeyConditionExpression: 'userId = :userId',
  ExpressionAttributeValues: { ':userId': userId },
  Limit: limit,
})
```

A DynamoDB `Query` needs an equality condition on the partition key, and `userId` is the sort key here, so the list path needs the keys flipped before the main screen's list works. The status path reads the GSI by status across all users and then filters by `userId`, so with `Limit` applied before the filter, a page can come back short.

The fix is to flip the keys (`userId` partition, `taskId` sort), which makes "my tasks" a single-partition query, and to put `userId` into the GSI key as well (for example `userId#status`). Get, update and delete already pass both keys, so they would keep working.

## What holds up

The DynamoDB table has on-demand billing, point-in-time recovery and AWS-managed encryption. Both buckets use S3-managed encryption. Lambda logs have a one-week retention. API Gateway stage logging and metrics are on. Update and delete use `attribute_exists(taskId)` conditions, so they return 404 instead of silently creating items. The service choices are sound, and the steps below are a few lines each.

!!! note "Scope"
    This stack covers the shape of a serverless AWS app. My production AWS work (EC2, RDS, S3) is separate from this repo.

## Next steps

1. **Clean `cdk synth`.** Drop the unused `PipelineStack` import (its buildspec keys need quoting), and add a CDK assertions test that checks the resource counts in the table above.
2. **Keys, auth and tests.** Flip the table keys to `userId`/`taskId` with the user in the GSI key, add a Cognito authorizer so `userId` comes from token claims, and add Jest tests per handler with a mocked DynamoDB client.
3. **Harden the edges.** Serve the frontend from a private bucket with origin access control, give each function its own grants, and add an SNS target to a 5XX alarm.
4. **Pipeline, then deploy.** Rebuild the pipeline on CDK Pipelines with scoped permissions (synth, tests, deploy), then deploy to a sandbox account and record real outputs.

## Links

- Case page: [Serverless task manager on AWS](../projects/aws-serverless.html)
