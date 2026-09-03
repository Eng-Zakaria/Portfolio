# Deployment Guide

## Prerequisites

1. **AWS Account**: Active AWS account with appropriate permissions
2. **AWS CLI**: Installed and configured
   ```bash
   aws configure
   ```
3. **Node.js**: Version 18+ installed
4. **CDK CLI**: Install globally
   ```bash
   npm install -g aws-cdk
   ```

## Step-by-Step Deployment

### 1. Clone and Setup

```bash
# Navigate to project directory
cd aws

# Install all dependencies
npm run install:all
```

### 2. Configure AWS

Ensure your AWS credentials are configured:

```bash
aws configure
# Enter your Access Key ID
# Enter your Secret Access Key
# Enter your default region (e.g., us-east-1)
# Enter output format (json)
```

### 3. Bootstrap CDK (First Time Only)

```bash
cd infrastructure
cdk bootstrap
```

This creates the necessary S3 bucket and IAM roles for CDK deployments.

### 4. Deploy Infrastructure

```bash
# From infrastructure directory
cdk deploy --all
```

This will:
- Create DynamoDB tables
- Create S3 buckets
- Deploy Lambda functions
- Create API Gateway
- Set up CloudFront distribution
- Configure IAM roles and policies

**Note**: The deployment will output important URLs:
- API Gateway URL
- CloudFront URL
- S3 bucket names

### 5. Update Frontend Configuration

After deployment, update the frontend API URL:

1. Get the API Gateway URL from CDK outputs
2. Create `frontend/.env`:
   ```bash
   REACT_APP_API_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod
   ```

### 6. Build and Deploy Frontend

```bash
cd frontend

# Install dependencies (if not done)
npm install

# Build the application
npm run build

# Deploy to S3 (replace with your bucket name from CDK outputs)
aws s3 sync build/ s3://task-manager-frontend-ACCOUNT-REGION --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### 7. Verify Deployment

1. Visit the CloudFront URL from CDK outputs
2. Test creating a task
3. Verify tasks are saved and retrieved
4. Check CloudWatch Logs for any errors

## CI/CD Pipeline Deployment (Optional)

To set up automated deployments:

1. Create a GitHub repository
2. Store GitHub token in AWS Secrets Manager
3. Update `infrastructure/lib/pipeline-stack.ts` with your GitHub details
4. Uncomment the PipelineStack in `infrastructure/bin/app.ts`
5. Deploy the pipeline stack:
   ```bash
   cdk deploy TaskManagerPipelineStack
   ```

## Troubleshooting

### Common Issues

1. **CDK Bootstrap Error**
   - Ensure you have proper IAM permissions
   - Check AWS credentials are configured correctly

2. **Lambda Deployment Errors**
   - Verify Node.js dependencies are installed in each function directory
   - Check Lambda execution role has proper permissions

3. **API Gateway CORS Errors**
   - Verify CORS is configured in API Gateway
   - Check frontend is using correct API URL

4. **DynamoDB Access Denied**
   - Verify Lambda execution role has DynamoDB permissions
   - Check table name matches environment variable

5. **S3 Upload Errors**
   - Verify bucket CORS configuration
   - Check Lambda has S3 read/write permissions

### Checking Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/TaskManagerStack-CreateTaskFunction --follow

# View API Gateway logs
aws logs tail /aws/apigateway/TaskManagerApi --follow
```

## Updating the Stack

To update after making changes:

```bash
cd infrastructure
cdk deploy --all
```

## Destroying the Stack

⚠️ **Warning**: This will delete all resources including data!

```bash
cd infrastructure
cdk destroy --all
```

## Production Considerations

Before deploying to production:

1. **Change Removal Policies**: Update `removalPolicy` to `RETAIN` for important resources
2. **Enable Backup**: Configure DynamoDB backups
3. **Set Up Alarms**: Configure CloudWatch alarms for production monitoring
4. **Add Authentication**: Integrate AWS Cognito for user authentication
5. **Custom Domain**: Set up custom domain for API Gateway and CloudFront
6. **SSL Certificate**: Use ACM certificates for HTTPS
7. **Environment Variables**: Use AWS Systems Manager Parameter Store or Secrets Manager
8. **Rate Limiting**: Configure API Gateway throttling
9. **WAF**: Add AWS WAF for additional security
10. **Monitoring**: Set up comprehensive CloudWatch dashboards

