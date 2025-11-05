# 🏋️ Weight Tracker - Complete Setup Guide

**One guide for everything: installation, setup, and troubleshooting.**

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [First Run](#first-run)
6. [Troubleshooting](#troubleshooting)
7. [Deployment](#deployment)

---

## 🎯 Prerequisites

### Required Software:

1. **Python 3.12 or 3.13**
   - Download: https://www.python.org/downloads/
   - ✅ **IMPORTANT**: Check "Add Python to PATH" during installation
   - Verify: `python --version`

2. **Node.js 18+**
   - Download: https://nodejs.org/ (LTS version)
   - Verify: `node --version` and `npm --version`

3. **PostgreSQL Database** (you already have this)
   - Or use SQLite for local development

4. **Git** (optional)
   - Download: https://git-scm.com/download/win

---

## ⚡ Quick Start

### Windows (PowerShell):

```powershell
# 1. Backend
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
pip install psycopg2-binary  # Important!

# 2. Configure .env (see below)
copy .env.example .env
notepad .env

# 3. Start backend
uvicorn app.main:app --reload

# 4. Frontend (NEW terminal)
cd frontend
npm install
npm run dev

# 5. Open browser
# http://localhost:5173
```

### Linux/Mac (Bash):

```bash
# 1. Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 2. Configure .env
cp .env.example .env
nano .env

# 3. Start backend
uvicorn app.main:app --reload

# 4. Frontend (NEW terminal)
cd frontend
npm install
npm run dev

# 5. Open browser
# http://localhost:5173
```

---

## 🔧 Backend Setup (Detailed)

### Step 1: Create Virtual Environment

```powershell
cd backend
python -m venv venv
```

### Step 2: Activate Virtual Environment

**Windows:**
```powershell
.\venv\Scripts\activate
```

**Linux/Mac:**
```bash
source venv/bin/activate
```

You should see `(venv)` in your terminal prompt.

### Step 3: Install Dependencies

```powershell
pip install --upgrade pip
pip install -r requirements.txt
pip install psycopg2-binary
```

**Note:** `psycopg2-binary` is needed separately due to Python 3.13 compatibility.

### Step 4: Configure Environment Variables

Create `backend/.env`:

```env
# Database Configuration
# Option 1: PostgreSQL (existing database)
DATABASE_URL=postgresql://user:pass@URL:port/DB

# Option 2: SQLite (for local development)
# DATABASE_URL=sqlite:///./weight_tracker.db

# Security (generate a random string)
SECRET_KEY=change-this-to-a-secure-random-string-at-least-32-characters

# JWT Settings
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# CORS Origins (JSON array format)
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

# App Settings
DEBUG=False
```

**Generate a secure SECRET_KEY:**
```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Step 6: Test Database Connection

```powershell
python test_db_connection.py
```

Should show: ✅ Database connection successful!

### Step 7: Start Backend

```powershell
uvicorn app.main:app --reload
```

**Success indicators:**
- `INFO: Uvicorn running on http://127.0.0.1:8000`
- `INFO: Application startup complete.`
- No errors in the output

**API Documentation available at:**
- http://localhost:8000/docs (Swagger UI)
- http://localhost:8000/redoc (ReDoc)

---

## 🎨 Frontend Setup (Detailed)

### Step 1: Navigate to Frontend

Open a **NEW** terminal (keep backend running):

```powershell
cd frontend
```

### Step 2: Install Dependencies

```powershell
npm install
```

This takes 1-2 minutes.

### Step 3: Configure Environment

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

Or copy from example:
```powershell
copy .env.example .env
```

### Step 4: Start Frontend

```powershell
npm run dev
```

**Success indicators:**
- `VITE v5.x.x  ready in xxx ms`
- `Local:   http://localhost:5173/`

---

## 🚀 First Run

### 1. Open the App

Go to: **http://localhost:5173**

You should see the Weight Tracker login page.

### 2. Sign Up

- Click "Sign up"
- Fill in:
  - Username (required)
  - Password (min 8 characters, required)
  - Height in cm (optional)
  - Sex (optional)
  - Date of birth (optional)
- Click "Sign Up"

### 3. Explore

After signup, you'll be logged in automatically:
- **Dashboard**: Overview (currently placeholder)
- **Weights**: Add weight entries (form needs to be built)
- **Targets**: Set goals (form needs to be built)
- **Insights**: Analytics (Phase 2)

### 4. Verify in Database

Your data is now in PostgreSQL!

Connect to your database to verify:
```sql
SELECT * FROM users;
```

---

## 🐛 Troubleshooting

### Backend Issues

#### "Python not found"
- Reinstall Python with "Add to PATH" checked
- Restart your computer
- Verify: `python --version`

#### "No module named X"
```powershell
.\venv\Scripts\activate
pip install -r requirements.txt
pip install psycopg2-binary
```

#### "Database connection failed"
- Check if database exists: `CREATE DATABASE wtracker;`
- Verify credentials in `.env`
- Test: `python test_db_connection.py`
- Alternative: Use SQLite for development

#### "Port 8000 already in use"
```powershell
# Find process
netstat -ano | findstr :8000

# Kill it (replace PID)
taskkill /PID <PID> /F
```

### Frontend Issues

#### "npm not found"
- Install Node.js from https://nodejs.org
- Restart terminal
- Verify: `npm --version`

#### "npm install fails"
```powershell
npm cache clean --force
rmdir /s node_modules
npm install
```

#### "Cannot connect to backend"
- Verify backend is running: http://localhost:8000/docs
- Check `frontend/.env` has correct API URL
- Check browser console (F12) for errors

#### "Port 5173 already in use"
```powershell
# Kill the process
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Python Version Issues

#### Python 3.13 with old packages
Update `requirements.txt` to latest versions:
- SQLAlchemy: 2.0.36
- FastAPI: 0.115.5
- Uvicorn: 0.32.1

Then reinstall:
```powershell
rmdir /s venv
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
pip install psycopg2-binary
```

---

## 🚂 Deployment (Railway)

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin your-repo-url
git push -u origin main
```

### Step 2: Create Railway Project

1. Go to https://railway.app
2. Sign in with GitHub
3. Click "New Project"

### Step 3: Add PostgreSQL

1. Click "New" → "Database" → "PostgreSQL"
2. Railway creates it automatically
3. Note the connection string

### Step 4: Deploy Backend

1. Click "New" → "GitHub Repo"
2. Select your repository
3. Configure:
   - Root Directory: `backend`
   - Set environment variables:
     ```
     DATABASE_URL=${{Postgres.DATABASE_URL}}
     SECRET_KEY=your-secret-key
     CORS_ORIGINS=["https://your-frontend.vercel.app"]
     ```

### Step 5: Deploy Frontend (Vercel)

1. Go to https://vercel.com
2. Import your GitHub repo
3. Configure:
   - Root Directory: `frontend`
   - Environment variable:
     ```
     VITE_API_URL=https://your-backend.railway.app
     ```

### Step 6: Update CORS

In Railway backend, update `CORS_ORIGINS` to include your Vercel URL.

**Cost:**
- Railway: $0 (trial) then ~$10/month
- Vercel: FREE for frontend

---

## 📝 Quick Commands Reference

### Backend Commands

```powershell
# Activate venv
.\venv\Scripts\activate  # Windows
source venv/bin/activate # Linux/Mac

# Install packages
pip install -r requirements.txt
pip install psycopg2-binary

# Test database
python test_db_connection.py

# Start server
uvicorn app.main:app --reload

# Deactivate venv
deactivate
```

### Frontend Commands

```powershell
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Useful Endpoints

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- API ReDoc: http://localhost:8000/redoc

---

## 🎯 Current Status (Phase 1 - MVP)

### ✅ Working:
- User authentication (signup/login)
- Backend API (all CRUD endpoints)
- Database integration
- Basic UI layout
- Navigation

### 🔨 To Be Built:
- Dashboard data integration
- Weight entry form
- Target entry form
- Weight history display
- Charts and analytics (Phase 2)

---

## 🆘 Getting Help

1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Check both terminal outputs for errors
4. Open browser console (F12) for frontend errors
5. Test API endpoints at http://localhost:8000/docs

---

## 📚 Project Structure

```
weight-tracker/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── main.py      # Entry point
│   │   ├── models.py    # Database models
│   │   ├── schemas.py   # Pydantic schemas
│   │   ├── auth.py      # Authentication
│   │   ├── config.py    # Configuration
│   │   └── routers/     # API endpoints
│   ├── venv/            # Virtual environment
│   ├── .env             # Environment variables
│   └── requirements.txt
│
└── frontend/            # React frontend
    ├── src/
    │   ├── App.jsx      # Main component
    │   ├── components/  # Reusable components
    │   ├── pages/       # Page components
    │   ├── services/    # API calls
    │   └── stores/      # State management
    ├── .env             # Environment variables
    └── package.json
```

---

## ✅ Success Checklist

- [ ] Python 3.12+ installed
- [ ] Node.js 18+ installed
- [ ] Backend dependencies installed
- [ ] Frontend dependencies installed
- [ ] `.env` files configured
- [ ] Database connection tested
- [ ] Backend running (http://localhost:8000)
- [ ] Frontend running (http://localhost:5173)
- [ ] Can access login page
- [ ] Can sign up and login

---

**You're all set! Start building your weight tracking journey! 🚀**