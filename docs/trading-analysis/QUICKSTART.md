# Quick Start Guide

## 🚀 Fastest Way to Get Started

### Using Docker (Recommended)

1. **Start everything with one command:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### Manual Setup (Windows)

#### Backend Setup

1. Open PowerShell in the project root
2. Navigate to backend:
   ```powershell
   cd backend
   ```

3. Create virtual environment:
   ```powershell
   python -m venv venv
   venv\Scripts\activate
   ```

4. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```

5. Start the server:
   ```powershell
   python main.py
   ```
   Or use the batch file from root: `start-backend.bat`

#### Frontend Setup

1. Open a new PowerShell window
2. Navigate to frontend:
   ```powershell
   cd frontend
   ```

3. Install dependencies:
   ```powershell
   npm install
   ```

4. Start the development server:
   ```powershell
   npm run dev
   ```
   Or use the batch file from root: `start-frontend.bat`

5. Open http://localhost:3000 in your browser

## ✅ Verify It's Working

1. **Check Backend:**
   - Visit http://localhost:8000/health
   - Should see: `{"status":"healthy","timestamp":"..."}`

2. **Check Frontend:**
   - Visit http://localhost:3000
   - You should see the dashboard

3. **Test Stock Analysis:**
   - Go to "Stock Analysis" page
   - Enter "AAPL" and click "Analyze"
   - You should see charts and indicators

## 🐛 Troubleshooting

### Backend won't start
- Make sure Python 3.11+ is installed: `python --version`
- Check if port 8000 is available
- Try: `pip install --upgrade pip` then reinstall requirements

### Frontend won't start
- Make sure Node.js 18+ is installed: `node --version`
- Delete `node_modules` and `package-lock.json`, then run `npm install` again
- Check if port 3000 is available

### No data showing
- Make sure backend is running on port 8000
- Check browser console for errors
- Verify CORS is enabled (should be automatic)

### Docker issues
- Make sure Docker Desktop is running
- Try: `docker-compose down` then `docker-compose up --build`
- Check logs: `docker-compose logs`

## 📝 Next Steps

1. Explore the Dashboard
2. Analyze some stocks (try: AAPL, MSFT, TSLA, GOOGL)
3. Add positions to your portfolio
4. Check out trending stocks

Enjoy analyzing! 📈

