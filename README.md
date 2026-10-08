# ProxyPilot — proxy-lecture automation for colleges

> One leave request in. HOD approves. Class covered — no phone calls.

**Live app:** https://proxypilot-9f7s.onrender.com

Built for the **Smart Automation Scenario Challenge**.

## The problem

When a teacher goes on leave, the HOD spends 30–60 minutes every morning on WhatsApp and phone calls finding a free colleague for each "proxy" lecture. Leave approval is informal, the same willing teachers get overloaded, classes go uncovered, and nothing is recorded for the monthly report.

## The solution

ProxyPilot turns that whole chain into one automated workflow inside the app:

1. **Teacher applies for leave** — picks a date on the calendar (or types it in plain words, e.g. *"Down with fever, can't come tomorrow"*) and chooses **Full day**, **Morning (P1–P4)**, **Afternoon (P5–P6)** or **specific periods**. The app shows exactly which classes will need cover.
2. **Leave balance** — every teacher gets 12 leaves a year (full day = 1, session/periods = ½). The balance is shown before applying, and a request that exceeds it is blocked.
3. **HOD approves or declines** — Rahul Attuluri (HOD) sees each request with the leave type, affected classes and the teacher's remaining balance. Declining requires a reason, which the teacher sees.
4. **Teacher can cancel** a request while it is still waiting for the HOD.
5. **Substitutes are found automatically** — only teachers of the **same subject** who are free that period and not on leave are considered, ranked fairly: knows the class (+20), fewer proxies this month (fairness), lighter load that day.
6. **Requests appear in the app** (no email spam) — the top teacher gets a request with a handover note. **Accept** assigns the class; **Decline** (or the HOD's *No reply → next*) passes it to the next best teacher.
7. **No one available → leave is declined automatically**, with the reason shown to the teacher, so a class is never silently left empty.
8. **Students** see the substitute on their timetable.
9. **HOD dashboard** — coverage stats, proxy-load fairness chart, weekly note, and a **monthly report download** (CSV that opens in Excel: date, teacher, leave type, reason, HOD decision, period, class, subject, substitute, cover status, plus a summary).

**Subjects:** English, DBMS, Python, DSA, Aptitude.

## Login

- **Email OTP** — enter name + Gmail, receive a 6-digit code, done. No passwords.
- The device remembers you: next time just tap your name.
- New teachers pick their subjects on first login and get a starter timetable so they can try everything immediately.
- One-click demo accounts on the login page.

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, React Router, Tailwind CSS v4, three.js (interactive background), Axios |
| Backend | Node.js, Express 5, JWT, Zod validation |
| Database | PostgreSQL (migrations applied automatically on start) |
| Email | Brevo HTTP API for OTP codes |
| Text understanding | Google Gemini (optional) with a rule-based fallback |
| Hosting | Render (web service + free PostgreSQL) via `render.yaml` |
| Uptime | GitHub Actions workflow pings the site every 10 minutes |

## Project structure

```
proxypilot/
├── render.yaml                    Render blueprint (web service + database)
├── .github/workflows/keep-awake.yml   keeps the free Render site from sleeping
├── netlify/database/migrations/   SQL schema (applied automatically)
├── scripts/local-db.mjs           run locally with a throwaway Postgres
├── server/src/
│   ├── app.js / index.js          Express app + static frontend
│   ├── db.js                      PostgreSQL queries
│   ├── routes/                    auth, leaves, proxies, hod, student
│   ├── services/                  matching (ranking), cover (after approval),
│   │                              leaveBalance, email, dates, starterTimetable
│   └── seedData.js                demo teachers, timetable, history, sample leave
└── client/src/
    ├── pages/                     Login, Welcome, Faculty, Hod, Student
    └── components/                Layout, LeaveCalendar, AmbientScene, ui
```

## Run locally

Needs Node.js 20.12+.

```bash
npm install
npm run build                    # builds the React app
EMAIL_DEV_LOG=1 npm run dev:local   # http://localhost:5000 with a throwaway Postgres
```

With `EMAIL_DEV_LOG=1`, OTP codes are printed in the terminal instead of emailed. To use your own database and keys, copy `.env.example` to `.env`, fill it in and run `npm run dev:api`.

## Demo accounts (password: `demo123`)

| Who | Email | Subjects / use |
| --- | --- | --- |
| Dr. Anita Mehta | mehta@college.edu | DBMS, Python — apply for leave |
| Prof. Ravi Rao | rao@college.edu | DBMS, DSA — has a sample leave waiting for the HOD |
| Prof. Farhan Ali | ali@college.edu | Python, DSA — receive / accept requests |
| Dr. Priya Das | das@college.edu | DBMS, Aptitude |
| Rahul Attuluri | hod@college.edu | HOD dashboard |
| Aarav Sharma | aarav@college.edu | Student timetable (CSE-2A) |

**Reset demo data** on the HOD dashboard reloads everything, including one pending leave so the approval flow can be shown right away.

## Suggested demo flow (3 minutes)

1. HOD → approve Prof. Ravi Rao's pending leave → substitutes are requested instantly.
2. Log in as the requested teacher → accept the class.
3. Mehta → apply a **Morning** leave from the calendar → balance drops by ½.
4. HOD → decline with a reason → Mehta sees the reason.
5. HOD → **Download report** for the month.
6. Student → timetable shows the substitute.

## API

| Method | Route | Role | What it does |
| --- | --- | --- | --- |
| POST | `/api/auth/email-code` | public | Send a 6-digit code to the email |
| POST | `/api/auth/email-login` | public | Name + email + code → JWT |
| POST | `/api/auth/login` | public | Demo accounts (email + password) |
| POST | `/api/auth/complete-profile` | all | Role + subjects on first login |
| GET | `/api/auth/me` | all | Current user |
| POST | `/api/leaves` | faculty | `{ date, session, periods?, text? }` → pending leave |
| GET | `/api/leaves/schedule` | faculty | Weekly classes, leave dates, balance |
| GET | `/api/leaves/mine` | faculty | My leaves, status, HOD note, cover |
| POST | `/api/leaves/:id/cancel` | faculty | Withdraw a pending leave |
| GET | `/api/proxies/mine` | faculty | Requests waiting for me + accepted |
| POST | `/api/proxies/:id/respond` | faculty | `{ action: "accept" \| "decline" }` |
| GET | `/api/hod/overview` | hod | Leave requests, stats, proxies, load |
| POST | `/api/hod/leaves/:id/decide` | hod | `{ action: "approve" \| "decline", note }` |
| POST | `/api/hod/proxies/:id/skip` | hod | No reply → next teacher |
| GET | `/api/hod/report?month=YYYY-MM` | hod | Monthly CSV report |
| GET | `/api/hod/summary` | hod | Weekly note |
| POST | `/api/hod/reset-demo` | hod | Reload demo data |
| GET | `/api/student/schedule` | student | Today + tomorrow with substitutes |
| GET | `/api/health` | public | Status check |

## Deploy (Render, free)

1. Push this repo to GitHub.
2. On [render.com](https://render.com): **New → Blueprint** → pick this repo. `render.yaml` creates the web service and a free PostgreSQL database.
3. Fill in the secrets it asks for: `SMTP_USER` (sender Gmail) and `BREVO_API_KEY` (free from brevo.com) for OTP emails — Render's free plan blocks SMTP, so email goes through Brevo's web API. `GEMINI_API_KEY` is optional.
4. Click **Apply**. Tables and demo data are created on first start. Every push to `main` redeploys automatically.

The free plan sleeps after 15 idle minutes; the **Keep site awake** GitHub Action pings `/api/health` every 10 minutes to prevent that. You can also run it manually from the repo's **Actions** tab.

## Future scope

WhatsApp bot for leave and replies · exam invigilation duty allocation with the same engine · syllabus tracking for richer handover notes · multi-department support.
