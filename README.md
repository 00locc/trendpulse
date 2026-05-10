# TrendPulse 🔥

**One platform to track what the world wants — topics, products, questions — across every major free data source.**

## What It Does

TrendPulse aggregates trend signals from:

| Source | Data | Cost |
|--------|------|------|
| **Google Trends** (via pytrends) | Search interest, trending searches, related queries | Free |
| **Reddit** | Hot posts, product mentions, questions people ask | Free (public JSON) |
| **YouTube** | Trending videos by category and region | Free (10K units/day) |
| **NewsAPI** | Top headlines and emerging story volume | Free (100 req/day) |
| **Bluesky** | Open social trending | Free |

---

## Quick Start

### 1. Start the Python backend (for Google Trends)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Backend will run at `http://localhost:5000`

### 2. Open the frontend

Just open `frontend/index.html` in your browser.
Reddit data loads immediately — no keys needed.

### 3. Add API keys (optional but recommended)

Click **⚙ API Settings** in the sidebar and add:

- **NewsAPI key** → free at [newsapi.org](https://newsapi.org) (100 req/day)
- **YouTube Data API v3 key** → free at [Google Cloud Console](https://console.cloud.google.com) (10K units/day)

---

## Supabase Setup

TrendPulse uses SQLite locally by default. In production, set one of these environment variables and the Flask backend will use Supabase Postgres instead:

```bash
SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require
# or
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require
```

Also set a real session secret:

```bash
SECRET_KEY=replace-with-a-long-random-secret
```

You can either let the app create the tables on boot, or paste `supabase_schema.sql` into Supabase SQL Editor and run it once.

---

## Features

| View | What You See |
|------|-------------|
| **Dashboard** | Live metrics, volume chart, trending list, hot products, top questions |
| **Topics** | Filter by category (tech, health, finance, etc.) and source |
| **Products** | AI-extracted product demand from Reddit discussions |
| **Questions** | Real questions people are asking, with intent classification |
| **Alerts** | Spike detection — topics that spiked in the last 48h |

---

## Backend API Endpoints

```
GET /api/trends?kw=AI+tools,side+hustle&tf=today+1-m
GET /api/trending?country=united_states
GET /api/related?kw=AI+tools
GET /api/regions?kw=AI+tools&resolution=COUNTRY
GET /api/topics?kw=AI+tools
GET /api/health
```

---

## Folder Structure

```
trendpulse/
├── frontend/
│   ├── index.html       # Main app
│   ├── css/style.css    # Dark editorial design
│   └── js/
│       ├── api.js       # All data fetching
│       ├── charts.js    # Chart.js rendering
│       └── app.js       # App controller
└── backend/
    ├── app.py           # Flask + pytrends server
    └── requirements.txt
```

---

## Upgrading Later

When ready to scale:

- Add **Twitter/X** via [TwitterAPI.io](https://twitterapi.io) (~$0.15/1K tweets)
- Add **TikTok** via TikTok Research API (apply for access)
- Deploy backend to **Railway** or **Render** (free tier available)
- Add a database (SQLite → PostgreSQL) for historical trend storage
