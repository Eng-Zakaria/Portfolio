# Quick Start Guide

Get your AWS serverless application up and running in 5 minutes!

## Prerequisites Check

```bash
# Check AWS CLI
aws --version

# Check Node.js
node --version  # Should be 18+

# Check CDK
cdk --version
```

If any are missing, install them first.

## Step 1: Install Dependencies

```bash
npm run install:all
```

## Step 2: Configure AWS

```bash
aws configure
# Enter your AWS credentials
```

## Step 3: Bootstrap CDK (First Time Only)

```bash
cd infrastructure
cdk bootstrap
```

## Step 4: Deploy Everything

```bash
# From project root
cd infrastructure
cdk deploy --all
```

Wait for deployment to complete. Note the API Gateway URL from the outputs.

## Step 5: Configure Frontend

Create `frontend/.env`:
```
REACT_APP_API_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod
```

Replace `YOUR_API_ID` with the actual API Gateway URL from Step 4.

## Step 6: Deploy Frontend

```bash
cd frontend
npm run build

# Get your bucket name from CDK outputs, then:
aws s3 sync build/ s3://task-manager-frontend-ACCOUNT-REGION --delete
```

## Step 7: Access Your App

Visit the CloudFront URL from the CDK outputs, or use the S3 website URL.

## That's It! 🎉

You now have a fully functional serverless application running on AWS!

## Next Steps

- Read the full [Deployment Guide](docs/DEPLOYMENT.md)
- Learn about the [Architecture](docs/ARCHITECTURE.md)
- Check [Troubleshooting](docs/TROUBLESHOOTING.md) if you encounter issues

## Common Commands

```bash
# View stack status
cd infrastructure
cdk list

# Update stack
cdk deploy --all

# View logs
aws logs tail /aws/lambda/TaskManagerStack-CreateTaskFunction --follow

# Destroy everything (careful!)
cdk destroy --all
```

