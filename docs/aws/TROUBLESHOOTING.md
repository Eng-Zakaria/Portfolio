# Troubleshooting Guide

## Common Issues and Solutions

### 1. CDK Deployment Issues

#### Error: "CDK toolkit stack not found"
**Solution**: Run `cdk bootstrap` first
```bash
cd infrastructure
cdk bootstrap
```

#### Error: "Insufficient permissions"
**Solution**: Ensure your AWS credentials have the following permissions:
- CloudFormation (full access)
- IAM (create roles and policies)
- S3 (create buckets)
- Lambda (create functions)
- API Gateway (create APIs)
- DynamoDB (create tables)
- CloudFront (create distributions)

### 2. Lambda Function Issues

#### Error: "Cannot find module"
**Solution**: Install dependencies in each Lambda function directory
```bash
cd backend/functions/createTask
npm install
# Repeat for all functions
```

#### Error: "Task timed out"
**Solution**: 
- Check DynamoDB table exists and is accessible
- Verify environment variables are set correctly
- Increase Lambda timeout in CDK stack

#### Error: "AccessDeniedException"
**Solution**: 
- Verify Lambda execution role has DynamoDB permissions
- Check IAM role policies in CDK stack

### 3. API Gateway Issues

#### Error: "CORS policy error"
**Solution**: 
- Verify CORS is enabled in API Gateway configuration
- Check `Access-Control-Allow-Origin` header in Lambda responses
- Ensure frontend is using correct API URL

#### Error: "403 Forbidden"
**Solution**:
- Check API Gateway resource policy
- Verify API key/authorization if configured
- Check CloudWatch logs for detailed error

#### Error: "502 Bad Gateway"
**Solution**:
- Check Lambda function logs in CloudWatch
- Verify Lambda function is deployed correctly
- Check API Gateway integration configuration

### 4. DynamoDB Issues

#### Error: "ResourceNotFoundException"
**Solution**:
- Verify table name matches environment variable
- Check table exists in correct region
- Ensure table is created before Lambda deployment

#### Error: "ValidationException"
**Solution**:
- Check partition key and sort key values
- Verify data types match table schema
- Check GSI configuration if using indexes

### 5. Frontend Issues

#### Error: "Network Error"
**Solution**:
- Verify API Gateway URL in `.env` file
- Check CORS configuration
- Verify API Gateway is deployed and accessible

#### Error: "Failed to load tasks"
**Solution**:
- Check browser console for detailed error
- Verify API Gateway endpoint is correct
- Check Network tab for request/response details
- Verify userId is being sent correctly

#### Error: "Blank page after deployment"
**Solution**:
- Check S3 bucket website hosting is enabled
- Verify CloudFront distribution is configured correctly
- Check S3 bucket policy allows public read (or CloudFront OAI)
- Invalidate CloudFront cache

### 6. S3 Issues

#### Error: "Access Denied" when uploading
**Solution**:
- Check S3 bucket CORS configuration
- Verify Lambda has S3 write permissions
- Check presigned URL generation is working

#### Error: "403 Forbidden" on frontend
**Solution**:
- Verify S3 bucket policy allows CloudFront access
- Check CloudFront Origin Access Identity (OAI) configuration
- Verify bucket public access settings

### 7. CloudFront Issues

#### Error: "Distribution not updating"
**Solution**:
- Create CloudFront invalidation
```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

#### Error: "SSL Certificate Error"
**Solution**:
- Verify ACM certificate is attached
- Check certificate is in us-east-1 for CloudFront
- Verify domain validation is complete

## Debugging Steps

### 1. Check CloudWatch Logs

```bash
# List log groups
aws logs describe-log-groups

# View specific Lambda logs
aws logs tail /aws/lambda/TaskManagerStack-CreateTaskFunction --follow

# View API Gateway logs
aws logs tail /aws/apigateway/TaskManagerApi --follow
```

### 2. Test Lambda Functions Locally

Create a test event file `test-event.json`:
```json
{
  "body": "{\"title\":\"Test Task\",\"userId\":\"test-user\",\"description\":\"Test\"}",
  "pathParameters": null,
  "queryStringParameters": null
}
```

Test with AWS SAM or directly:
```bash
# Install AWS SAM CLI
# Then test locally
sam local invoke CreateTaskFunction -e test-event.json
```

### 3. Test API Gateway Endpoints

```bash
# Get API Gateway URL from CDK outputs
API_URL="https://YOUR_API_ID.execute-api.REGION.amazonaws.com/prod"

# Test create task
curl -X POST $API_URL/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","userId":"test-user","description":"Test task"}'

# Test list tasks
curl "$API_URL/tasks?userId=test-user"
```

### 4. Verify IAM Permissions

```bash
# Check Lambda execution role
aws iam get-role --role-name TaskManagerStack-LambdaExecutionRole

# Check role policies
aws iam list-attached-role-policies \
  --role-name TaskManagerStack-LambdaExecutionRole
```

### 5. Check DynamoDB Table

```bash
# List tables
aws dynamodb list-tables

# Describe table
aws dynamodb describe-table --table-name TaskManager-Tasks

# Scan table (be careful with large tables)
aws dynamodb scan --table-name TaskManager-Tasks --limit 5
```

## Getting Help

1. **Check CloudWatch Logs**: Most errors are logged here
2. **Review CDK Outputs**: Check stack outputs for resource names
3. **AWS Console**: Use AWS Console to visually inspect resources
4. **AWS Support**: For account-level issues
5. **Documentation**: Refer to AWS service documentation

## Useful Commands

```bash
# View stack outputs
cd infrastructure
cdk list
aws cloudformation describe-stacks --stack-name TaskManagerStack

# Check Lambda function configuration
aws lambda get-function --function-name TaskManagerStack-CreateTaskFunction

# Test API Gateway
aws apigateway get-rest-api --rest-api-id YOUR_API_ID

# Check S3 bucket
aws s3 ls s3://task-manager-frontend-ACCOUNT-REGION

# View CloudFront distribution
aws cloudfront get-distribution --id YOUR_DIST_ID
```

