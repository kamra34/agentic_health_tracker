# 🏋️ Weight Tracker

A modern, full-stack weight tracking application to help you monitor your health journey with goals, analytics, and insights.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.5-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.2-61DAFB.svg)](https://reactjs.org)
[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB.svg)](https://www.python.org)

---

## ✨ Features

### Current (Phase 1 - MVP)
- ✅ User authentication (JWT-based)
- ✅ Weight entry management
- ✅ Target goal setting
- ✅ User profile management
- ✅ PostgreSQL database integration
- ✅ RESTful API with auto-documentation
- ✅ Modern, responsive UI

### Coming Soon
- 📊 Interactive charts and analytics (Phase 2)
- 🎮 Achievement system and gamification (Phase 3)
- 🤖 AI-powered insights with OpenAI (Phase 4)
- 👑 Admin dashboard (Phase 5)
- 📱 Mobile app (Future)

---

## 🚀 Quick Start

**Full setup guide: See [SETUP.md](SETUP.md)**

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
pip install psycopg2-binary
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev

# Open http://localhost:5173
```

---

## 🛠️ Tech Stack

**Backend:**
- FastAPI (Python web framework)
- PostgreSQL (Database)
- SQLAlchemy (ORM)
- Pydantic (Validation)
- JWT (Authentication)

**Frontend:**
- React 18 (UI library)
- Vite (Build tool)
- Tailwind CSS (Styling)
- React Router (Navigation)
- Zustand (State management)
- Axios (HTTP client)

**Deployment:**
- Railway (Backend + Database)
- Vercel (Frontend)
- GitHub Actions (CI/CD)

---

## 📁 Project Structure

```
weight-tracker/
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── routers/
│   └── requirements.txt
│
└── frontend/          # React frontend
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   └── services/
    └── package.json
```

---

## 📚 Documentation

- **[SETUP.md](SETUP.md)** - Complete setup instructions
- **[API Docs](http://localhost:8000/docs)** - Interactive API documentation (when running)
- **[Deployment Guide](RAILWAY_DEPLOYMENT.md)** - Deploy to production

---

## 🗄️ Database Schema

**Users Table:**
- id, name, password_hash, height, sex, date_of_birth, is_admin

**Weights Table:**
- id, user_id, date_of_measurement, weight

**Target Weights Table:**
- id, user_id, date_of_target, target_weight, status

---

## 🔧 Configuration

### Backend (.env)
```env
DATABASE_URL=postgresql://user:password@host:port/dbname
SECRET_KEY=your-secret-key
CORS_ORIGINS=["http://localhost:5173"]
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8000
```

---

## 🌐 API Endpoints

**Authentication:**
- `POST /api/auth/signup` - Register
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user

**Weights:**
- `GET /api/weights` - List weights
- `POST /api/weights` - Add weight
- `PUT /api/weights/{id}` - Update
- `DELETE /api/weights/{id}` - Delete

**Targets:**
- `GET /api/targets` - List targets
- `POST /api/targets` - Create target
- `PUT /api/targets/{id}` - Update
- `DELETE /api/targets/{id}` - Delete

**Dashboard:**
- `GET /api/users/dashboard` - Complete dashboard data
- `GET /api/users/stats` - User statistics

---

## 🎯 Roadmap

### Phase 1: MVP ✅
- [x] Authentication system
- [x] Weight CRUD operations
- [x] Target management
- [x] Basic UI
- [ ] Complete dashboard
- [ ] Forms integration

### Phase 2: Analytics 🔄
- [ ] Interactive charts
- [ ] BMI tracking
- [ ] Goal predictions
- [ ] Trend analysis

### Phase 3: Gamification
- [ ] Achievement badges
- [ ] Streak tracking
- [ ] Progress celebrations

### Phase 4: AI Features
- [ ] OpenAI integration
- [ ] Smart insights
- [ ] Conversational interface

### Phase 5: Admin
- [ ] Admin dashboard
- [ ] User management
- [ ] System monitoring

---

## 🧪 Testing

```bash
# Backend tests (coming soon)
cd backend
pytest

# Frontend tests (coming soon)
cd frontend
npm test
```

---

## 🚂 Deployment

**Railway (Backend + Database):**
```bash
# Push to GitHub, connect Railway
# Automatic deployments on push
```

**Vercel (Frontend):**
```bash
# Import GitHub repo
# Automatic deployments
```

**Cost:** ~$10/month (Railway) + FREE (Vercel)

See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for details.


---

## 📄 License

MIT License - see LICENSE file for details

---

## 🆘 Support

- **Issues:** GitHub Issues
- **Setup Help:** See [SETUP.md](SETUP.md)
- **API Docs:** http://localhost:8000/docs

---

## 👨‍💻 Author

Built with ❤️ by [Your Name]

---

**Start tracking your weight today! 🎯💪**