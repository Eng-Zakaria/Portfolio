# AWS Serverless Task Management Application

A comprehensive full-stack serverless application built on AWS that demonstrates production-ready cloud architecture and best practices.

## 🏗️ Architecture Overview

This project implements a serverless task management application using:

- **API Layer**: AWS API Gateway (REST API)
- **Compute**: AWS Lambda (Node.js/Python)
- **Database**: Amazon DynamoDB
- **Storage**: Amazon S3 (file uploads + static hosting)
- **CDN**: Amazon CloudFront
- **Infrastructure as Code**: AWS CDK (TypeScript)
- **CI/CD**: AWS CodePipeline + CodeBuild
- **Monitoring**: Amazon CloudWatch
- **Security**: IAM roles, policies, and best practices

## 📁 Project Structure

```
aws/
├── infrastructure/          # AWS CDK infrastructure code
├── backend/                 # Lambda function code
│   ├── functions/          # Individual Lambda functions
│   └── shared/             # Shared utilities
├── frontend/               # React frontend application
├── scripts/                # Deployment and utility scripts
└── docs/                   # Additional documentation
```

## 🚀 Features

- ✅ RESTful API with API Gateway
- ✅ Serverless Lambda functions
- ✅ DynamoDB for data persistence
- ✅ S3 file uploads
- ✅ CloudFront CDN distribution
- ✅ Infrastructure as Code (CDK)
- ✅ Automated CI/CD pipeline
- ✅ CloudWatch monitoring
- ✅ Security best practices

## 📋 Prerequisites

- AWS Account with appropriate permissions
- Node.js 18+ and npm
- AWS CLI configured
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Python 3.9+ (for Lambda functions)

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
# Install CDK dependencies
cd infrastructure
npm install

# Install backend dependencies
cd ../backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure AWS

```bash
aws configure
```

### 3. Bootstrap CDK (First time only)

```bash
cd infrastructure
cdk bootstrap
```

### 4. Deploy Infrastructure

```bash
cd infrastructure
cdk deploy --all
```

### 5. Deploy Frontend

```bash
cd frontend
npm run build
aws s3 sync build/ s3://YOUR_BUCKET_NAME --delete
```

## 📚 Learning Objectives

This project helps you master:

1. **Serverless Architecture**: Building scalable applications without managing servers
2. **API Gateway**: Creating RESTful APIs
3. **Lambda Functions**: Writing serverless functions
4. **DynamoDB**: NoSQL database design and operations
5. **S3**: Object storage and static website hosting
6. **CloudFront**: CDN and content delivery
7. **AWS CDK**: Infrastructure as Code
8. **CI/CD**: Automated deployment pipelines
9. **CloudWatch**: Monitoring and logging
10. **IAM**: Security and access management

## 🔐 Security Features

- Least privilege IAM roles
- Encrypted data at rest
- API Gateway authentication
- CORS configuration
- Input validation

## 📊 Monitoring

- CloudWatch Logs for all Lambda functions
- CloudWatch Metrics for API performance
- CloudWatch Alarms for error rates
- X-Ray tracing (optional)

## 🧪 Testing

```bash
# Test Lambda functions locally
cd backend
npm test

# Test API endpoints
npm run test:api
```

## 📖 Documentation

See `docs/` directory for detailed documentation on:
- Architecture decisions
- Deployment guide
- Troubleshooting
- Best practices

## 🎯 Next Steps

1. Add authentication with Cognito
2. Implement real-time updates with WebSockets
3. Add image processing with Lambda
4. Set up automated backups
5. Implement disaster recovery

## 📝 License

MIT License - Feel free to use this project for learning and portfolio purposes.

