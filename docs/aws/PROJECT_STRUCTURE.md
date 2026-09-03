# Project Structure

```
aws/
├── infrastructure/              # AWS CDK Infrastructure as Code
│   ├── bin/
│   │   └── app.ts             # CDK app entry point
│   ├── lib/
│   │   ├── task-manager-stack.ts    # Main application stack
│   │   └── pipeline-stack.ts        # CI/CD pipeline stack
│   ├── package.json
│   ├── tsconfig.json
│   └── cdk.json
│
├── backend/                    # Lambda Functions
│   ├── functions/
│   │   ├── createTask/       # Create task Lambda
│   │   │   ├── createTask.js
│   │   │   └── package.json
│   │   ├── getTask/          # Get task Lambda
│   │   │   ├── getTask.js
│   │   │   └── package.json
│   │   ├── listTasks/        # List tasks Lambda
│   │   │   ├── listTasks.js
│   │   │   └── package.json
│   │   ├── updateTask/       # Update task Lambda
│   │   │   ├── updateTask.js
│   │   │   └── package.json
│   │   ├── deleteTask/       # Delete task Lambda
│   │   │   ├── deleteTask.js
│   │   │   └── package.json
│   │   └── uploadFile/       # File upload Lambda
│   │       ├── uploadFile.js
│   │       └── package.json
│   └── package.json
│
├── frontend/                  # React Frontend Application
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── TaskList.js
│   │   │   ├── TaskItem.js
│   │   │   ├── TaskForm.js
│   │   │   └── TaskFilter.js
│   │   ├── services/         # API service layer
│   │   │   └── api.js
│   │   ├── App.js            # Main app component
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
│
├── scripts/                   # Deployment scripts
│   ├── deploy.sh             # Bash deployment script
│   ├── deploy.ps1            # PowerShell deployment script
│   └── setup-env.sh          # Environment setup
│
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md       # Architecture documentation
│   ├── DEPLOYMENT.md         # Deployment guide
│   ├── TROUBLESHOOTING.md    # Troubleshooting guide
│   ├── BEST_PRACTICES.md     # Best practices
│   └── LEARNING_RESOURCES.md # Learning resources
│
├── .gitignore                # Git ignore rules
├── package.json              # Root package.json
├── README.md                 # Main README
├── QUICKSTART.md             # Quick start guide
├── PROJECT_STRUCTURE.md      # This file
└── LICENSE                   # MIT License
```

## Key Files Explained

### Infrastructure (`infrastructure/`)
- **CDK Stack**: Defines all AWS resources (Lambda, API Gateway, DynamoDB, S3, CloudFront)
- **Pipeline Stack**: Optional CI/CD pipeline using CodePipeline

### Backend (`backend/`)
- **Lambda Functions**: Serverless functions for each API operation
- Each function is self-contained with its own dependencies

### Frontend (`frontend/`)
- **React Application**: Modern single-page application
- **Components**: Reusable UI components
- **Services**: API integration layer

### Scripts (`scripts/`)
- **Deployment Scripts**: Automated deployment helpers
- **Environment Setup**: Configuration helpers

### Documentation (`docs/`)
- Comprehensive guides for architecture, deployment, troubleshooting, and learning

## Getting Started

1. Read `README.md` for overview
2. Follow `QUICKSTART.md` for fast setup
3. Refer to `docs/DEPLOYMENT.md` for detailed deployment
4. Check `docs/ARCHITECTURE.md` to understand the system

## Next Steps

After deployment:
1. Explore the code in each directory
2. Modify Lambda functions to add features
3. Customize the frontend UI
4. Add new AWS services
5. Implement authentication
6. Set up monitoring dashboards

