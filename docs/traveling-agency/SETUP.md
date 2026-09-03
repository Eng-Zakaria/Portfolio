# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm run install:all
```

This will install dependencies for root, backend, and frontend.

## Step 2: Set Up MongoDB

Make sure MongoDB is installed and running on your system.

For local MongoDB:
```bash
# Windows
# MongoDB should be running as a service

# Mac/Linux
mongod
```

Or use MongoDB Atlas (cloud) and update the connection string in `.env`.

## Step 3: Configure Environment Variables

### Backend Configuration

Create `backend/.env` file:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/traveling-agency
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
JWT_EXPIRE=7d
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
FRONTEND_URL=http://localhost:3000
UPLOAD_PATH=./uploads
```

### Frontend Configuration

Create `frontend/.env` file:
```env
VITE_API_URL=http://localhost:5000/api
```

## Step 4: Create Uploads Directory

```bash
mkdir -p backend/uploads/tours
```

## Step 5: Start the Application

### Development Mode (Both Frontend & Backend)
```bash
npm run dev
```

### Or Run Separately

Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

## Step 6: Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- API Health Check: http://localhost:5000/api/health

## Step 7: Create Your First Admin User

You can create an admin user through the API or directly in MongoDB:

### Option 1: Using API (after registering as customer, update via admin)
1. Register a new account (will be customer by default)
2. Manually update the user role in MongoDB to 'admin'

### Option 2: Using MongoDB directly
```javascript
// In MongoDB shell or Compass
use traveling-agency
db.users.insertOne({
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  password: "$2a$10$...", // Use bcrypt to hash password
  role: "admin",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Or use a tool like Postman to call the admin user creation endpoint after setting up authentication.

## Default Test Accounts

After creating an admin user, you can:
1. Login as admin
2. Create agent users via Admin Dashboard
3. Agents can create tours
4. Customers can register and book tours

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running
- Check connection string in `.env`
- Verify MongoDB port (default: 27017)

### Port Already in Use
- Change PORT in backend/.env
- Update VITE_API_URL in frontend/.env accordingly

### File Upload Issues
- Ensure `backend/uploads/tours` directory exists
- Check file permissions

### Email Not Sending
- Configure email service credentials
- For Gmail, use App Password (not regular password)
- Check firewall/network settings

## Production Build

```bash
npm run build
```

This creates production builds in:
- `backend/dist/` - Backend build
- `frontend/dist/` - Frontend build

## Next Steps

1. Set up Stripe account for payments
2. Configure email service
3. Set up file storage (consider cloud storage for production)
4. Configure CORS for production domain
5. Set up SSL certificates
6. Configure reverse proxy (nginx)
7. Set up monitoring and logging

