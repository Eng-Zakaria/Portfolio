---
title: "A serverless task API in AWS CDK, reviewed before its first deploy"
date: 2026-11-08
summary: "A TypeScript CDK stack for API Gateway, six Lambda functions, DynamoDB, S3 and CloudFront, built as a tutorial-style learning project. What the stack defines, the design choices behind it, and the bugs a careful read finds before anything reaches AWS."
tags: [AWS, Serverless, Infrastructure as Code]
draft: false
sources:
  - aws/README.md
  - aws/infrastructure/bin/app.ts
  - aws/infrastructure/lib/task-manager-stack.ts
  - aws/infrastructure/lib/pipeline-stack.ts
  - aws/backend/functions/listTasks/listTasks.js
  - aws/backend/functions/updateTask/updateTask.js
  - aws/backend/functions/uploadFile/uploadFile.js
  - aws/frontend/src/App.js
  - aws/backend/package.json
---

Evidence: portfolio, tutorial-based learning project. I built it from a guided, learning-objectives outline (the README lists ten AWS topics it is meant to teach). The repo does not credit a specific AWS workshop, and I'm not claiming one. It has never been deployed: there is no `cdk.out`, no CloudFormation output, no logs and no git history. It has no tests. Everything below comes from reading the code.

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

Each API method has its own function and its own folder under `backend/functions/`. The upside is small, readable handlers and per-route logs and metrics in CloudWatch without extra tagging. The cost shows up immediately in the stack file: six nearly identical `new lambda.Function(...)` blocks, and six handlers that each repeat the same CORS headers and error envelope. A shared helper or a single router function would remove most of that. For a learning project the split was worth it, because it made the API Gateway-to-Lambda wiring explicit route by route.

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

### The DynamoDB key design, and the bug it caused

The table uses `taskId` as the partition key and `userId` as the sort key. A `StatusIndex` GSI on `status` and `createdAt` supports "tasks with status X".

That key order is the main defect in the project. `listTasks`, when no status filter is given, does this:

```javascript
new QueryCommand({
  TableName: TABLE_NAME,
  KeyConditionExpression: 'userId = :userId',
  ExpressionAttributeValues: { ':userId': userId },
  Limit: limit,
})
```

A DynamoDB `Query` must give an equality condition on the partition key, and `userId` is the sort key here. This call would be rejected, and the handler would return a 500. The React app calls exactly this path on page load (`getTasks(API_URL, userId)` with no status), so the main screen would fail on a real deployment. The status path is not much better: it reads the GSI by status across all users and then filters by `userId`, so with `Limit` applied before the filter, a page can come back short or empty.

The fix is to flip the keys (`userId` partition, `taskId` sort), which makes "my tasks" a single-partition query, and to put `userId` into the GSI key as well (for example `userId#status`). Get, update and delete already pass both keys, so they would keep working.

## Results

There are no runtime results to report, because the stack has not been deployed or synthesised. These are the findings from reading the code:

- **`cdk synth` would fail as written.** `app.ts` imports `pipeline-stack.ts` even though it doesn't use it, and that file has `base-directory: 'backend'` as an unquoted key inside the buildspec object literal (twice). That is a TypeScript syntax error, so `ts-node` can't load the app.
- **List-by-user is broken**, as described above.
- **There is no authentication.** The README lists "API Gateway authentication", but no authorizer, API key or Cognito pool is defined. `userId` is generated in the browser and stored in `localStorage`, so any caller can read or change any user's tasks by passing a different ID.
- **The frontend origin is likely misconfigured.** The frontend bucket sets `websiteIndexDocument` but keeps public access blocked. With a website-configured bucket, CDK's `S3Origin` points CloudFront at the public website endpoint rather than using an origin access identity, so I'd expect CloudFront to get 403s. I haven't confirmed this against a deployment.
- **The pipeline is a sketch, not CI/CD.** Its CodeBuild projects get `actions: ['*'], resources: ['*']`, the build stages never run `cdk deploy`, and the optional S3 deploy step publishes the backend artifact into the frontend bucket.
- **The alarm has no action**, so it would change state with nobody notified. It watches 4XX client errors, not the 5XX errors the handlers return on failure.
- **Some guards don't work.** `updateTask` always adds `updatedAt` to its update list, so its "No fields to update" check can never fire.
- **There are no tests.** `backend/package.json` declares Jest but there are no test files, and the `npm run test:api` script in the README doesn't exist. The README also mentions Python Lambdas, but all six are JavaScript.

What does hold up: the DynamoDB table has on-demand billing, point-in-time recovery and AWS-managed encryption. Both buckets use S3-managed encryption. Lambda logs have a one-week retention. API Gateway stage logging and metrics are on. Update and delete use `attribute_exists(taskId)` conditions, so they return 404 instead of silently creating items. The service choices are sound, and most of the defects are a few lines each to fix.

!!! note "Scope"
    This is a learning build that covers the shape of a serverless AWS app. My production AWS work (EC2, RDS, S3) is separate and not represented by this repo.

## What I'd do next

1. Remove the unused `PipelineStack` import, or fix its buildspec keys, and get a clean `cdk synth`. Add a CDK assertions test that checks the resource counts in the table above.
2. Flip the table keys to `userId`/`taskId`, rework the GSI so it includes the user, and add Jest unit tests for each handler using a mocked DynamoDB client.
3. Add a Cognito user pool authorizer and take `userId` from the token claims, not the request body or query string.
4. Switch the frontend to a private bucket with origin access control and drop the website configuration.
5. Give each function its own grants and add an SNS target to a 5XX alarm.
6. Rebuild the pipeline around CDK Pipelines with scoped permissions, a synth step, tests, then deploy. Only after that, deploy to a sandbox account and record real outputs.

## Links

- Case page: [Serverless task manager on AWS](../projects/aws-serverless.html)
