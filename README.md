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

### New: Multi‑Agent Chat (v2)
- 🤖 In‑app chat with modular agents: planner, sql, analytics, action, admin, responder
- 🔒 Strict grounding via function tools (no guessing). Tools map to safe server APIs
- 📡 Live progress via async tasks + Server‑Sent Events (SSE)
- 🧠 Intent gating avoids irrelevant tools (e.g., admin) for casual messages
- ✅ Deterministic admin actions (grant/revoke) by name, with explicit fallback if tools missing
- 📊 Analytics tools: average weight change over a custom range; current/longest streaks
- 🧰 Frontend upgrades: clean rendering with minimal Markdown and structured metrics cards

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

## 🆕 Recent Enhancements

- Chat v2 (multi‑agent, grounded by tools)
  - Endpoints under `/api/chat/v2` with async task + SSE streaming
  - Intent gating prevents off‑topic admin calls; small‑talk doesn’t force tools
  - Deterministic name‑based admin updates (grant/revoke) when requested
- Analytics
  - `user_avg_weight_change`: average per‑day/week/month since a given date
  - `user_streaks`: current and longest entry streaks with exact dates
- Dashboard
  - Active Goals now include a second progress bar based on time (days) alongside weight progress, each with clear labels
- Targets
  - Separate filter tabs for Failed vs Cancelled goals
- Chat UI
  - Textarea reliability and auto‑resize fixes; visible text in all themes
  - Assistant replies render minimal Markdown (bold, lists, inline code)
  - Metrics JSON blocks render as compact cards (averages, totals, date range)

Tip: For metrics, the assistant includes a final fenced JSON block like:
`{ "type": "metrics", "per_day": 0.12, "per_week": 0.84, "per_month": 3.65, "delta_kg": -5.1, "days": 42, "period": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"} }`

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

**Chat v2 (Multi‑Agent):**
- `POST /api/chat/v2` — Synchronous chat (grounded, may call tools)
- `POST /api/chat/v2/task` — Start async task (returns `task_id`)
- `GET /api/chat/v2/tasks/{task_id}` — Poll task status and live events
- `GET /api/chat/v2/stream/{task_id}?token=...` — SSE stream of agent events + final reply

---

## 🎯 Roadmap

### Phase 1: MVP ✅
- [x] Authentication system
- [x] Weight CRUD operations
- [x] Target management
- [x] Basic UI
- [X] Complete dashboard
- [X] Forms integration

### Phase 2: Admin
- [X] Admin dashboard
- [X] User management
- [ ] System monitoring

### Phase 3: Analytics 🔄
- [X] Interactive charts
- [X] BMI tracking
- [X] Goal predictions
- [X] Trend analysis

### Phase 4: Gamification
- [ ] Achievement badges
- [ ] Streak tracking
- [ ] Progress celebrations

### Phase 5: AI Features
- [ ] OpenAI integration
- [ ] Smart insights
- [ ] Conversational interface



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
