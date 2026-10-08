# ProxyPilot — AI proxy-lecture automation for colleges

> One leave message in. Class covered in 40 seconds.

When a faculty member goes on leave, HODs spend 30–60 minutes every morning on WhatsApp and phone calls finding a free colleague for each "proxy" lecture. It often fails, the same willing teachers get overloaded, and nothing is recorded.

**ProxyPilot automates the whole workflow:**

1. Faculty types leave in plain words — *"Down with fever, can't come tomorrow."*
2. **AI (Gemini)** reads it → date, periods, reason (output validated with Zod).
3. The timetable is checked and every free teacher is **ranked fairly**: same subject (+50), knows the class (+20), fewer proxies this month (fairness), lighter load that day.
4. **AI explains the pick** and writes a **handover note** (what to teach today).
5. The top teacher gets a request → **Accept** updates the timetable; **Decline** (or HOD's *No reply → next*) passes it to the next best teacher automatically.
6. Students see the change on their timetable.
7. **HOD dashboard**: coverage stats, proxy-load fairness chart, AI insight.

Built for the **Smart Automation Scenario Challenge**.

---

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | React, Vite, React Router, Tailwind CSS, Axios |
| Backend | Node.js, Express, JWT, bcrypt, Zod |
| Database | PostgreSQL (Netlify Database, Neon-based) |
| AI | Google Gemini via `@google/genai` (key only on the server) |
| Hosting | Netlify — static frontend + Express running as a Netlify Function at `/api/*` |

On Netlify the database connection and the Gemini key are injected automatically (Netlify Database + AI Gateway), so no secret is ever stored in the code or the browser. If the AI is unavailable, a rule-based fallback keeps the app working.

## Project structure

```
proxypilot/
├── netlify.toml                 build + routing config
├── netlify/
│   ├── functions/api.mjs        runs the Express app as a Netlify Function
│   └── database/migrations/     SQL schema (applied automatically on deploy)
├── server/src/                  Express backend
│   ├── app.js                   routes + middleware
│   ├── db.js                    PostgreSQL queries
│   ├── routes/                  auth, leaves, proxies, hod, student
│   ├── services/                ai.js (Gemini), matching.js (ranking), dates.js
│   └── seedData.js              demo faculty, timetable, history (auto-loaded)
└── client/src/                  React app
    ├── pages/                   Login, Faculty, Hod, Student
    └── components/              Layout, ui
```

## Run locally

Needs Node.js 20.12+.

```bash
npm install
npm run dev:local                # API on http://localhost:5000 with a throwaway local Postgres
```

In a second terminal:

```bash
cd client
npm install
echo VITE_API_URL=http://localhost:5000 > .env
npm run dev                      # http://localhost:5173
```

To use your own Postgres and Gemini key instead, copy `.env.example` to `.env`, fill it in and run `npm run dev:api`.

## Demo accounts (password: `demo123`)

| Who | Email | Use it to |
| --- | --- | --- |
| Dr. Anita Mehta | mehta@college.edu | Apply for leave |
| Prof. Ravi Rao | rao@college.edu | Get / decline a request |
| Prof. Farhan Ali | ali@college.edu | Get / accept a request |
| Rahul Attuluri | hod@college.edu | HOD dashboard |
| Aarav Sharma | aarav@college.edu | Student timetable (CSE-2A) |

The login page has one-click buttons for each.

## API

| Method | Route | Role | What it does |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | all | Email + password → JWT |
| GET | `/api/auth/me` | all | Current user |
| POST | `/api/leaves` | faculty | Leave text → AI parse → ranked proxy requests |
| GET | `/api/leaves/mine` | faculty | My leaves + coverage status |
| GET | `/api/proxies/mine` | faculty | Requests waiting for me + accepted |
| POST | `/api/proxies/:id/respond` | faculty | `{ action: "accept" \| "decline" }` |
| GET | `/api/hod/overview` | hod | Stats, proxies, load per teacher |
| GET | `/api/hod/summary` | hod | AI-written insight |
| POST | `/api/hod/proxies/:id/skip` | hod | No reply → next teacher |
| POST | `/api/hod/reset-demo` | hod | Reload demo data |
| GET | `/api/health` | public | Status + whether AI is active |
| GET | `/api/student/schedule` | student | Today + tomorrow with substitutes |

## Deploy (Render, free)

1. Push this repo to GitHub.
2. On [render.com](https://render.com): **New → Blueprint** → pick this repo. `render.yaml` creates the web service and a free PostgreSQL database.
3. Fill in the secret values it asks for: `GEMINI_API_KEY` (free from Google AI Studio), `SMTP_USER` (the sender Gmail) and `BREVO_API_KEY` (free from brevo.com) for OTP emails — Render's free plan blocks SMTP, so email goes through Brevo's web API.
4. Click **Apply**. Tables and demo data are created automatically on first start.

The free plan sleeps when idle: open the site a minute before demoing.

## Future scope

WhatsApp bot for leave and replies · school version · exam invigilation duty allocation with the same engine · syllabus tracking for richer handover notes.
