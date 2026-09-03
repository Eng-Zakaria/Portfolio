# Traveling Agency - Full Stack Application

A comprehensive, production-ready traveling agency application with complete functionality for admins, agents, and customers.

## Features

### For Customers
- Browse and search tours with advanced filters
- View detailed tour information
- Book tours with multiple travelers
- Manage bookings (view, cancel)
- Profile management
- Reviews and ratings (coming soon)

### For Agents
- Create and manage tours
- View assigned bookings
- Dashboard with statistics
- Tour management (CRUD operations)
- Image uploads for tours

### For Admins
- Complete system overview dashboard
- User management (create, update, delete, activate/deactivate)
- Tour management across all agents
- Booking management
- Revenue analytics
- System statistics

## Tech Stack

### Backend
- Node.js with Express
- TypeScript
- MongoDB with Mongoose
- JWT Authentication
- Stripe Payment Integration (ready)
- Nodemailer for email notifications
- Multer for file uploads

### Frontend
- React 18 with TypeScript
- Vite
- React Router
- Tailwind CSS
- React Hook Form
- Axios
- React Hot Toast

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or cloud)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd "Traveling Agency"
```

2. Install dependencies
```bash
npm run install:all
```

3. Set up environment variables

Backend (.env file in `backend/` directory):
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/traveling-agency
JWT_SECRET=your-super-secret-jwt-key-change-in-production
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

Frontend (.env file in `frontend/` directory):
```env
VITE_API_URL=http://localhost:5000/api
```

4. Start MongoDB
```bash
# Make sure MongoDB is running on your system
```

5. Run the application

Development mode (runs both frontend and backend):
```bash
npm run dev
```

Or run separately:
```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

6. Access the application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Project Structure

```
Traveling Agency/
├── backend/
│   ├── src/
│   │   ├── models/          # MongoDB models
│   │   ├── routes/          # API routes
│   │   ├── middleware/      # Auth middleware
│   │   ├── utils/           # Utilities (email, token)
│   │   └── server.ts        # Entry point
│   ├── uploads/             # Uploaded files
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── contexts/         # React contexts
│   │   ├── pages/            # Page components
│   │   │   ├── admin/        # Admin pages
│   │   │   ├── agent/        # Agent pages
│   │   │   └── customer/     # Customer pages
│   │   ├── utils/            # Utilities
│   │   └── App.tsx           # Main app component
│   └── package.json
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Tours
- `GET /api/tours` - Get all tours (with filters)
- `GET /api/tours/:id` - Get single tour
- `POST /api/tours` - Create tour (Admin/Agent)
- `PUT /api/tours/:id` - Update tour (Admin/Agent)
- `DELETE /api/tours/:id` - Delete tour (Admin/Agent)
- `POST /api/tours/:id/images` - Upload tour images

### Bookings
- `GET /api/bookings` - Get bookings (filtered by role)
- `GET /api/bookings/:id` - Get single booking
- `POST /api/bookings` - Create booking
- `PUT /api/bookings/:id/confirm` - Confirm booking (Admin/Agent)
- `PUT /api/bookings/:id/cancel` - Cancel booking
- `PUT /api/bookings/:id` - Update booking (Admin/Agent)

### Reviews
- `GET /api/reviews` - Get reviews
- `GET /api/reviews/:id` - Get single review
- `POST /api/reviews` - Create review
- `PUT /api/reviews/:id` - Update review
- `DELETE /api/reviews/:id` - Delete review

### Payments
- `POST /api/payments/create-intent` - Create payment intent
- `POST /api/payments/confirm` - Confirm payment
- `POST /api/payments/webhook` - Stripe webhook

### Admin
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/users` - Get all users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### Agent
- `GET /api/agent/dashboard` - Agent dashboard
- `GET /api/agent/my-tours` - Get agent's tours
- `GET /api/agent/my-bookings` - Get agent's bookings

## User Roles

1. **Customer**: Can browse tours, make bookings, manage profile
2. **Agent**: Can create/manage tours, view assigned bookings
3. **Admin**: Full system access, user management, analytics

## Production Deployment

### Build for Production

```bash
npm run build
```

This builds both frontend and backend.

### Environment Variables

Make sure to set all environment variables in production:
- Use strong JWT_SECRET
- Set NODE_ENV=production
- Configure MongoDB connection string
- Set up Stripe keys
- Configure email service
- Set FRONTEND_URL to production URL

### Deployment Checklist

- [ ] Set all environment variables
- [ ] Build frontend and backend
- [ ] Set up MongoDB database
- [ ] Configure file uploads directory
- [ ] Set up email service
- [ ] Configure Stripe webhooks
- [ ] Set up reverse proxy (nginx)
- [ ] Configure SSL certificates
- [ ] Set up monitoring and logging

## License

ISC

## Support

For issues and questions, please open an issue in the repository.

