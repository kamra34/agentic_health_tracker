@echo off
echo ====================================
echo Weight Tracker - Windows Quick Setup
echo ====================================
echo.

REM Check if running in project root
if not exist "backend" (
    if not exist "frontend" (
        echo Error: Please run this script from the project root directory
        pause
        exit /b 1
    )
)

REM Backend setup
echo Setting up backend...
cd backend

if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Upgrading pip...
python -m pip install --upgrade pip

echo Installing Python dependencies...
pip install -r requirements.txt

if not exist ".env" (
    echo Creating .env file from template...
    copy .env.example .env
    echo.
    echo WARNING: Please edit backend\.env with your configuration!
    echo TIP: Use SQLite for easy start: DATABASE_URL=sqlite:///./weight_tracker.db
    echo.
)

cd ..

REM Frontend setup
echo.
echo Setting up frontend...
cd frontend

if not exist "node_modules" (
    echo Installing Node dependencies...
    call npm install
)

if not exist ".env" (
    echo Creating .env file from template...
    copy .env.example .env
)

cd ..

echo.
echo ====================================
echo Setup complete!
echo ====================================
echo.
echo Next steps:
echo 1. Edit backend\.env (use SQLite for easy start)
echo 2. Open TWO command prompts:
echo.
echo    Terminal 1 - Start Backend:
echo    cd backend
echo    venv\Scripts\activate
echo    uvicorn app.main:app --reload
echo.
echo    Terminal 2 - Start Frontend:
echo    cd frontend
echo    npm run dev
echo.
echo 3. Visit http://localhost:5173
echo.
echo See WINDOWS_SETUP.md for detailed instructions
echo ====================================
pause
