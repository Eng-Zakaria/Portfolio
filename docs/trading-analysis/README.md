# Trading Analysis Platform

A comprehensive full-stack trading analysis application built with React, TypeScript, FastAPI, and Python. This platform provides real-time stock data, technical analysis indicators, portfolio tracking, and trading signals.

## Features

- 📈 **Stock Analysis**: Analyze any stock with real-time data, technical indicators, and trading signals
- 📊 **Interactive Charts**: Beautiful candlestick and line charts with Chart.js
- 💼 **Portfolio Tracker**: Track your investments and analyze portfolio performance
- 🔍 **Technical Indicators**: RSI, MACD, Moving Averages (SMA, EMA), Bollinger Bands
- 🎯 **Trading Signals**: Automated buy/sell signals based on multiple indicators
- 📱 **Responsive Design**: Modern, mobile-friendly UI
- 🚀 **Production Ready**: Dockerized with Docker Compose for easy deployment

## Tech Stack

### Backend
- **FastAPI**: Modern, fast Python web framework
- **yfinance**: Real-time stock data from Yahoo Finance
- **pandas & numpy**: Data processing
- **ta**: Technical analysis library
- **Uvicorn**: ASGI server

### Frontend
- **React 18**: UI library
- **TypeScript**: Type safety
- **Vite**: Build tool
- **Chart.js**: Charting library
- **React Router**: Navigation
- **Axios**: HTTP client

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker & Docker Compose (optional, for containerized deployment)

### Option 1: Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd trading-analysis
```

2. Start the services:
```bash
docker-compose up --build
```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Option 2: Local Development

#### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file (optional):
```bash
cp .env.example .env
```

5. Run the server:
```bash
python main.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (optional):
```env
VITE_API_URL=http://localhost:8000
```

4. Run the development server:
```bash
npm run dev
```

5. Open http://localhost:3000 in your browser

## Project Structure

```
trading-analysis/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   ├── Dockerfile           # Backend container
│   └── .env.example         # Environment variables template
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # API services
│   │   ├── App.tsx          # Main app component
│   │   └── main.tsx         # Entry point
│   ├── package.json         # Node dependencies
│   ├── vite.config.ts       # Vite configuration
│   └── Dockerfile           # Frontend container
├── docker-compose.yml        # Docker Compose configuration
└── README.md                 # This file
```

## API Endpoints

### Stock Data
- `GET /api/stock/{symbol}` - Get stock data and analysis
  - Query params: `period` (1d, 1mo, 1y, etc.), `interval` (1d, 1h, etc.)

### Portfolio
- `POST /api/portfolio/analyze` - Analyze portfolio
  - Body: Array of `{symbol, shares, avg_price}`

### Market Data
- `GET /api/market/trending` - Get trending stocks
- `GET /api/search/{query}` - Search for stocks

### Health
- `GET /health` - Health check endpoint
- `GET /` - API information

## Usage Examples

### Analyze a Stock
1. Navigate to "Stock Analysis" page
2. Enter a stock symbol (e.g., AAPL, MSFT, TSLA)
3. Select a time period
4. View charts, indicators, and trading signals

### Track Portfolio
1. Navigate to "Portfolio" page
2. Add positions with symbol, shares, and average price
3. Click "Analyze Portfolio" to see performance

### View Trending Stocks
1. Navigate to "Trending" page
2. Browse popular stocks
3. Click any stock to view detailed analysis

## Technical Indicators

The platform calculates and displays:

- **RSI (Relative Strength Index)**: Momentum oscillator (0-100)
- **MACD**: Moving Average Convergence Divergence
- **SMA**: Simple Moving Averages (20, 50 day)
- **EMA**: Exponential Moving Averages (12, 26 day)
- **Bollinger Bands**: Volatility bands

## Trading Signals

Signals are generated based on:
- RSI overbought/oversold conditions
- MACD crossovers
- Moving average crossovers
- Bollinger Band positions

## Production Deployment

### Environment Variables

Backend (`.env`):
```env
PORT=8000
DEBUG=False
ALPHA_VANTAGE_API_KEY=your_key_here  # Optional
```

Frontend (`.env`):
```env
VITE_API_URL=http://your-backend-url:8000
```

### Build for Production

Backend:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Frontend:
```bash
cd frontend
npm run build
# Serve the dist/ folder with a web server
```

### Docker Production

```bash
docker-compose -f docker-compose.yml up -d
```

## Development

### Running Tests
```bash
# Backend tests (if implemented)
cd backend
pytest

# Frontend tests (if implemented)
cd frontend
npm test
```

### Code Quality
```bash
# Backend
black .
flake8 .

# Frontend
npm run lint
```

## Troubleshooting

### Backend Issues
- Ensure Python 3.11+ is installed
- Check that all dependencies are installed
- Verify port 8000 is not in use
- Check API rate limits (yfinance may have limits)

### Frontend Issues
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check that backend is running on port 8000
- Verify CORS settings in backend

### Docker Issues
- Ensure Docker and Docker Compose are installed
- Check container logs: `docker-compose logs`
- Rebuild containers: `docker-compose up --build`

## License

MIT License - feel free to use this project for learning and development.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the repository.

---

**Note**: This application uses Yahoo Finance API (via yfinance) which is free but may have rate limits. For production use, consider using paid APIs like Alpha Vantage, IEX Cloud, or Polygon.io.

