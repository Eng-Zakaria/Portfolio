# Architecture Documentation

## Overview

This document describes the architecture of the AWS Serverless Task Management Application.

## System Architecture

```
┌─────────────────┐
│   CloudFront    │
│   (CDN)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  S3 Bucket      │
│  (Frontend)     │
└─────────────────┘

┌─────────────────┐
│  API Gateway    │
│  (REST API)     │
└────────┬────────┘
         │
         ├──────────────┬──────────────┬──────────────┐
         ▼              ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ Lambda  │   │ Lambda  │   │ Lambda  │   │ Lambda  │
    │ Create  │   │  Read   │   │ Update  │   │ Delete  │
    └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘
         │            │              │              │
         └────────────┴──────────────┴──────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  DynamoDB   │
                   │  (Tasks)    │
                   └─────────────┘

         ┌─────────────────┐
         │  S3 Bucket      │
         │  (Uploads)      │
         └─────────────────┘
```

## Components

### 1. Frontend (React)
- **Location**: `frontend/`
- **Hosting**: S3 + CloudFront
- **Features**:
  - Task CRUD operations
  - Task filtering
  - Responsive design

### 2. API Gateway
- **Type**: REST API
- **Stage**: `prod`
- **Endpoints**:
  - `POST /tasks` - Create task
  - `GET /tasks` - List tasks
  - `GET /tasks/{taskId}` - Get task
  - `PUT /tasks/{taskId}` - Update task
  - `DELETE /tasks/{taskId}` - Delete task
  - `POST /upload` - Get presigned URL for upload

### 3. Lambda Functions
- **Runtime**: Node.js 18.x
- **Functions**:
  - `CreateTaskFunction` - Creates new tasks
  - `GetTaskFunction` - Retrieves a single task
  - `ListTasksFunction` - Lists tasks with optional filtering
  - `UpdateTaskFunction` - Updates task properties
  - `DeleteTaskFunction` - Deletes a task
  - `UploadFileFunction` - Generates presigned URLs for S3 uploads

### 4. DynamoDB
- **Table**: `TaskManager-Tasks`
- **Partition Key**: `taskId` (String)
- **Sort Key**: `userId` (String)
- **GSI**: `StatusIndex` (status, createdAt)
- **Features**:
  - Pay-per-request billing
  - Point-in-time recovery
  - Encryption at rest

### 5. S3 Buckets
- **Frontend Bucket**: Static website hosting
- **Uploads Bucket**: File storage with versioning

### 6. CloudFront
- **Distribution**: CDN for frontend
- **Features**:
  - HTTPS redirect
  - SPA routing support
  - Optimized caching

## Data Flow

### Creating a Task
1. User submits form in React app
2. Frontend sends POST request to API Gateway
3. API Gateway invokes CreateTask Lambda
4. Lambda writes to DynamoDB
5. Response returned to frontend

### Listing Tasks
1. User requests task list
2. Frontend sends GET request to API Gateway
3. API Gateway invokes ListTasks Lambda
4. Lambda queries DynamoDB (by userId or status)
5. Results returned to frontend

## Security

- **IAM Roles**: Least privilege access
- **Encryption**: Data encrypted at rest
- **CORS**: Configured for API Gateway
- **Input Validation**: Performed in Lambda functions

## Monitoring

- **CloudWatch Logs**: All Lambda functions
- **CloudWatch Metrics**: API Gateway performance
- **CloudWatch Alarms**: Error rate monitoring

## Scalability

- **Serverless**: Auto-scales with demand
- **DynamoDB**: Pay-per-request scales automatically
- **CloudFront**: Global CDN distribution
- **Lambda**: Concurrent execution limits configurable

## Cost Optimization

- **Pay-per-use**: Only pay for what you use
- **DynamoDB**: On-demand pricing
- **Lambda**: Free tier includes 1M requests/month
- **CloudFront**: Pay for data transfer

## Best Practices Implemented

1. ✅ Infrastructure as Code (CDK)
2. ✅ Separation of concerns
3. ✅ Error handling
4. ✅ Logging and monitoring
5. ✅ Security best practices
6. ✅ Scalable architecture
7. ✅ Cost optimization

