# ResumeIQ — AI Resume Analyzer

A locally run student resume analyzer with a React dashboard and a Flask/SQLite API. Without an OpenAI key, it clearly labels its results as **Demo mode** and uses a transparent, rule-based skills catalog. With an API key, students can explicitly consent to sending resume text to OpenAI for qualitative feedback.

The app is intended for local college-project demonstrations. It does not provide live job vacancies, predict hiring outcomes, or guarantee placement.

## Features

- Paste resume text or preview text extracted from PDF/DOCX documents.
- Identify skills, evidence snippets, and whether a skill has nearby project/work evidence.
- Compare documented skills with a configurable sample entry-level role catalog.
- Show role match estimates, unmentioned core skills, a learning sequence, and resume improvement suggestions.
- Score resumes with an explained 100-point rubric.
- Save, reopen, search, and delete analysis results in SQLite.
- Create an account and sign in with a hashed password and a seven-day HTTP-only signed session cookie.
- Keep each student's analysis history private to their own account.
- Welcome and one-time splash screens, profile settings, responsive navigation, and sign out.
- Optional AI feedback with explicit per-analysis consent.
- Responsive React dashboard, skill visualization, and loading/error states.

## Requirements

- Python 3.10 or later (tested locally with Python 3.14 where available).
- Node.js 18 or later and npm.
- OpenAI API key only for optional AI-assisted analysis.

## Run on Windows

Open two PowerShell terminals.

### 1. Start the Flask backend

```powershell
cd "C:\Users\BMSIT\Desktop\ai resume analyzer\backend"
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python init_db.py
python app.py
```

The API will be available at `http://127.0.0.1:5001` (port 5001 avoids the common local Flask port 5000). The SQLite database is created at `backend\instance\resume_analyzer.db`. Startup uses `CREATE TABLE IF NOT EXISTS`, adds the account ownership column to existing analysis tables when necessary, and inserts sample roles without deleting existing data. The app creates a local signing key at `backend\instance\.flask_secret` when `SECRET_KEY` is not set; keep this file private and persistent to preserve signed-in sessions across restarts.

If another local app is already using port 5001, choose another port for Flask (for example `$env:PORT = "5002"; python app.py`) and set `API_PROXY_TARGET` in the frontend terminal to `http://127.0.0.1:5002` before running Vite. For HTTPS deployments, set `SECURE_COOKIE=1`; the default local HTTP setup must leave it unset.

If PowerShell blocks activation, use the venv interpreter directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

### 2. Start the React frontend

```powershell
cd "C:\Users\BMSIT\Desktop\ai resume analyzer\frontend"
npm install
npm run dev
```

Open the local address printed by Vite (normally `http://127.0.0.1:5173`). Vite proxies `/api` requests to Flask on port 5001.

## Optional OpenAI setup

1. Review `backend\.env.example`, then create an API key from the [OpenAI API keys page](https://platform.openai.com/api-keys) under an account with API access. Copy the key when it is shown and keep it private.
2. Set `OPENAI_API_KEY` in the environment of the backend terminal. Do not put a real key in source control or frontend files:

   ```powershell
   $env:OPENAI_API_KEY = "your-key"
   $env:OPENAI_MODEL = "gpt-4o-mini"
   python app.py
   ```

3. Keep the **Allow external AI processing** checkbox unchecked for local demo mode. Check it only when you agree to send that resume text to OpenAI.

The API key is read only by Flask. A request without consent stays in Demo mode, even when a key is configured. If consent is selected but no key exists, the API reports a configuration error rather than silently pretending to use AI. Provider errors and malformed AI responses are surfaced to the UI.

## Data and privacy notes

- Uploaded files are processed in memory; they are not saved to an upload directory.
- Full resume text is not stored. Results can contain short evidence excerpts and suggested rewrites, so treat the SQLite history as sensitive and delete analyses when no longer needed.
- Accounts and analysis ownership are stored in the local SQLite database. Existing analyses from before the account migration are preserved with no owner and are deliberately hidden from signed-in accounts.
- Sessions use a signed, HTTP-only, SameSite=Lax cookie with a seven-day lifetime. This is a local demonstration app; do not expose Flask's development server to a network or use real student records without a production deployment review, stronger operational protections, explicit retention controls, and administrator policies.
- With AI consent, resume text is sent to OpenAI for qualitative feedback under your provider account. See that provider's data policy before using real student information.
- Uploads are limited to 5 MB and accepted only as PDF or DOCX. Do not upload documents containing sensitive information for a demo.
- Configure another database path with `DATABASE_PATH`; keep the database file private and backed up before moving it.

## Scoring and role matching

The 100-point assessment uses:

| Criterion | Points |
|---|---:|
| Skills relevance | 25 |
| Projects and practical evidence | 25 |
| Education and relevant experience | 15 |
| Resume clarity and structure | 15 |
| Role-specific alignment | 20 |

Role alignment compares matched resume skills with the sample role's core skills: 80% of the estimate comes from core-skill coverage and 20% from core skills with nearby practical evidence. The selected preferred domain ranks recommendations first; the displayed match score remains the same skills-based calculation. A skill not found in the text is described as **not documented**, not proof that the student lacks it. Scores are estimates for resume improvement only.

The starter role catalog is defined in `backend\app.py` and persisted in `backend\instance\resume_analyzer.db`. The schema is in `backend\schema.sql`. Add or update role data through a controlled data migration; this college-project starter does not include administrator or password-reset workflows.

## Tests

```powershell
cd "C:\Users\BMSIT\Desktop\ai resume analyzer\backend"
python -m pytest -q
```

Tests use a temporary SQLite database and do not alter the app database.

Frontend production build:

```powershell
cd "C:\Users\BMSIT\Desktop\ai resume analyzer\frontend"
npm run build
```

## Troubleshooting

- **`py` not found:** Install Python 3.10+ and enable the Python launcher, then reopen PowerShell.
- **`npm` not found:** Install Node.js 18+ (which includes npm), then reopen PowerShell.
- **CORS/network error:** Start Flask on port 5001 and Vite on port 5173. For a different frontend origin, set `FRONTEND_ORIGIN` before starting Flask.
- **No text from PDF:** Scanned/image-only documents need OCR, which is not included. Paste an accessible text version instead.
- **DOCX/PDF support error:** Install backend packages with `python -m pip install -r requirements.txt`.
- **AI request fails:** Check the API key, account quota, model name, internet access, and consent checkbox. Uncheck consent to use demo mode.
- **Database permission error:** Ensure the project folder is writable or set `DATABASE_PATH` to a writable SQLite file.

## API outline

- `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `PATCH /api/profile`
- Authenticated: `GET /api/roles`, `POST /api/extract` (multipart `file` field), `POST /api/analyze`
- Authenticated: `GET /api/history`, `GET /api/history/<id>`, `DELETE /api/history/<id>`
