# CoreInventory — Full Stack Project

A complete Inventory Management System built with:
- **Frontend**: Vanilla HTML/CSS/JS (single file, no build step)
- **Backend**: Node.js + Express
- **Database**: PostgreSQL

---

## Project Structure

```
coreinventory/
├── frontend/
│   ├── index.html          ← Your complete frontend (the file you built)
│   └── api.js              ← API service layer (connects frontend to backend)
│
└── backend/
    ├── server.js           ← Express app entry point
    ├── package.json
    ├── .env.example        ← Copy this to .env and fill in your values
    ├── middleware/
    │   └── auth.js         ← JWT authentication middleware
    ├── routes/
    │   ├── auth.js         ← POST /login, /signup, /forgot-password
    │   ├── products.js     ← CRUD + category filter
    │   ├── warehouses.js   ← CRUD
    │   ├── locations.js    ← CRUD + products at location
    │   ├── receipts.js     ← CRUD + validate (increases stock)
    │   ├── deliveries.js   ← CRUD + validate (decreases stock)
    │   ├── transfers.js    ← CRUD + validate (moves location)
    │   ├── adjustments.js  ← CRUD + validate (applies diff)
    │   ├── moves.js        ← Stock ledger (read-only)
    │   └── dashboard.js    ← All KPIs in one call
    └── db/
        ├── schema.sql      ← PostgreSQL table definitions
        └── seed.js         ← Demo data matching the frontend
```

---

## Step 1 — Prerequisites

Make sure you have these installed:

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| PostgreSQL | 14+ | `psql --version` |

---

## Step 2 — Set Up the Database

### 2a. Create the database

Open your terminal and run:

```bash
psql -U postgres
```

Then inside psql:

```sql
CREATE DATABASE coreinventory;
\q
```

### 2b. Run the schema

```bash
psql -U postgres -d coreinventory -f backend/db/schema.sql
```

You should see a list of `CREATE TABLE` messages — that means it worked.

---

## Step 3 — Configure the Backend

```bash
cd backend
cp .env.example .env
```

Now open `.env` and fill in your PostgreSQL password:

```env
PORT=5000
FRONTEND_URL=http://localhost:3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=coreinventory
DB_USER=postgres
DB_PASSWORD=your_actual_postgres_password

JWT_SECRET=pick_any_long_random_string_here
JWT_EXPIRES_IN=30d
```

---

## Step 4 — Install & Start the Backend

```bash
cd backend
npm install
npm run db:seed      # loads demo data (products, warehouses, receipts etc.)
npm run dev          # starts server with auto-reload
```

You should see:
```
CoreInventory API running on http://localhost:5000
```

Test it:
```bash
curl http://localhost:5000/api/health
# → {"status":"ok","db":"connected"}
```

---

## Step 5 — Run the Frontend

The frontend is a single HTML file — no build step needed.

### Option A: Open directly in browser
Just double-click `frontend/index.html` in your file explorer.

### Option B: Serve with a simple server (recommended)
```bash
cd frontend
npx serve .
# → open http://localhost:3000
```

### Option C: VS Code Live Server
Right-click `index.html` → "Open with Live Server"

---

## Step 6 — Connect Frontend to Backend

The frontend currently runs with in-memory demo data.
To connect it to the real backend:

### 6a. Add the API script to index.html

Open `frontend/index.html` and add this line just before the closing `</body>` tag:

```html
<script src="api.js"></script>
```

### 6b. Update the login function

In `index.html`, find the `doLogin()` function and replace the `setTimeout` block with:

```javascript
async function doLogin() {
  const email = $('l-email').value.trim();
  const pwd   = $('l-pwd').value;
  if (!email || !pwd) { showAuthErr('login-err', 'Please fill in all fields.'); return; }

  const btn = document.querySelector('.auth-btn-primary');
  btn.textContent = 'Signing in...'; btn.disabled = true;

  try {
    const { token, user } = await API.login({ email, password: pwd });
    setToken(token);
    S.user = user;
    enterApp();
  } catch (err) {
    showAuthErr('login-err', err.message || 'Invalid email or password.');
  } finally {
    btn.textContent = 'Sign in to CoreInventory'; btn.disabled = false;
  }
}
```

### 6c. Update the signup function

```javascript
async function doSignup() {
  const first_name = $('s-fname').value.trim();
  const last_name  = $('s-lname').value.trim();
  const email      = $('s-email').value.trim();
  const role       = $('s-role').value;
  const password   = $('s-pwd').value;
  const confirm    = $('s-confirm').value;

  if (!first_name || !last_name) { showAuthErr('signup-err', 'Enter your full name.'); return; }
  if (!email.includes('@'))      { showAuthErr('signup-err', 'Valid email required.'); return; }
  if (!role)                     { showAuthErr('signup-err', 'Select a role.');        return; }
  if (password.length < 8)       { showAuthErr('signup-err', 'Password min 8 chars.'); return; }
  if (password !== confirm)      { showAuthErr('signup-err', 'Passwords do not match.'); return; }

  try {
    const { token, user } = await API.signup({ first_name, last_name, email, password, role });
    setToken(token);
    S.user = user;
    enterApp();
  } catch (err) {
    showAuthErr('signup-err', err.message);
  }
}
```

### 6d. Load real data in renderDashboard()

At the top of `renderDashboard()`, add:

```javascript
async function renderDashboard() {
  try {
    const data = await API.getDashboard();
    // Use data.kpis, data.recent_moves, data.pending_receipts etc.
    // Map them to your existing render logic
  } catch (err) {
    console.error('Dashboard load failed:', err);
  }
  // ... rest of existing render code
}
```

---

## API Reference

All endpoints require `Authorization: Bearer <token>` header (except auth routes).

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login → returns JWT token |
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/forgot-password` | Request password reset |
| GET  | `/api/auth/me` | Get logged-in user |
| PUT  | `/api/auth/me` | Update profile |
| PUT  | `/api/auth/change-password` | Change password |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/products` | List all (supports `?search=&category=&stock_status=`) |
| POST | `/api/products` | Create product |
| PUT  | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |

### Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/receipts/:id/validate` | Validate receipt → stock increases |
| POST | `/api/deliveries/:id/validate` | Validate delivery → stock decreases |
| POST | `/api/transfers/:id/validate` | Validate transfer → location updated |
| POST | `/api/adjustments/:id/validate` | Apply adjustment → stock corrected |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | All KPIs, recent moves, pending ops |

---

## Demo Login Credentials

After running `npm run db:seed`:

| Email | Password | Role |
|-------|----------|------|
| arjun@coreinventory.in | password123 | Admin |
| priya@coreinventory.in | password123 | Staff |
| raj@coreinventory.in   | password123 | Staff |

---

## Common Errors & Fixes

| Error | Fix |
|-------|-----|
| `password authentication failed for user "postgres"` | Update `DB_PASSWORD` in `.env` |
| `database "coreinventory" does not exist` | Run `CREATE DATABASE coreinventory` in psql |
| `Cannot find module 'pg'` | Run `npm install` inside the `backend/` folder |
| `CORS error` in browser | Make sure `FRONTEND_URL` in `.env` matches where you're serving the frontend |
| `401 Unauthorized` | Token expired — log out and log back in |

---

## Next Steps (Phase 3+)

Once this is working, the next steps from the roadmap are:

1. **Phase 3 already done** — Backend is complete ✅
2. **Phase 5** — OTP email reset using `nodemailer`
3. **Phase 7** — Migrate frontend to React (Vite) using the API layer already built
4. **Phase 8** — Deploy backend on Railway/Render, frontend on Vercel

---

## Tech Stack Summary

```
Frontend          Backend           Database
─────────────    ──────────────    ──────────────
HTML/CSS/JS      Node.js 18+       PostgreSQL 14+
Vanilla JS       Express 4         pg (node-postgres)
No framework     JWT Auth          10 tables
No build step    bcryptjs          Indexed queries
                 morgan (logs)
                 helmet (security)
                 cors
```
