# My Budget Tracker

## Architecture

- **Login** → Firebase Authentication (email/password) — koi data yahan store nahi hota, sirf pehchan (identity) ke liye
- **Data** (transactions, bills, ledger, Vault documents) → Railway Postgres database, ek Node.js backend (`/backend` folder) ke zariye
- **Frontend** → React (Vite), jo backend ko authenticated API calls karta hai

## Step 1 — Apne computer par test karein

1. Node.js install karein (agar pehle se nahi hai): https://nodejs.org (LTS version)
2. Ye folder unzip/extract karein
3. Do terminal windows kholein — ek frontend ke liye, ek backend ke liye

**Backend (pehle ye chalayein):**
```
cd budget-app/backend
npm install
# .env file banayein (.env.example se copy karein) aur DATABASE_URL + FIREBASE_SERVICE_ACCOUNT bharein
npm start
```

**Frontend:**
```
cd budget-app
npm install
# .env.local file banayein (.env.example se copy karein) aur saari values bharein
npm run dev
```

## Step 2 — Firebase setup (sirf login ke liye)

### A. Firebase project banayein
1. https://console.firebase.google.com par project banayein
2. **Build → Authentication → Get started → Email/Password** provider enable karein

### B. Web app register karein
1. Project Overview → Web icon (`</>`) → app register karein
2. `firebaseConfig` values copy kar ke apni `.env.local` (frontend) mein `VITE_FIREBASE_...` variables mein daalein

### C. Backend ke liye Service Account key banayein
1. Firebase Console → ⚙️ Project settings → **Service accounts** tab
2. "Generate new private key" click karein — ek JSON file download hogi
3. Us poori JSON file ka content copy kar ke backend ki `.env` file mein `FIREBASE_SERVICE_ACCOUNT` variable mein (ek hi line mein) paste karein

*(Firestore/Rules ab is app mein zaroori nahi — data Postgres mein jata hai, Firebase sirf login ke liye hai.)*

## Step 3 — Railway par deploy karein (do services banayenge)

### A. Postgres database
1. https://railway.app par project kholein → **+ New → Database → Add PostgreSQL**

### B. Backend service
1. **+ New → GitHub Repository** → apni repo select karein
2. Service ki **Settings → Root Directory** ko `backend` set karein (taake Railway sirf backend folder ko build kare)
3. **Variables** tab mein:
   - `DATABASE_URL` — Postgres service ke "Variables" tab se `DATABASE_URL` copy karein (ya Railway mein reference variable `${{Postgres.DATABASE_URL}}` use karein)
   - `FIREBASE_SERVICE_ACCOUNT` — Step 2C wali poori JSON (ek line mein)
4. Deploy hone ke baad **Settings → Networking → Generate Domain** — ye backend ka public URL hai (e.g. `budget-backend-production.up.railway.app`)

### C. Frontend service
1. **+ New → GitHub Repository** → same repo select karein
2. Is baar Root Directory **khaali/root** rakhein (jahan Dockerfile hai)
3. **Variables** tab mein saari `VITE_FIREBASE_...` values + `VITE_API_URL` (backend ka URL, Step B.4 se) daalein
4. Deploy hone ke baad **Generate Domain** — ye aapki live app ka URL hai
5. Is URL ko Firebase Console → Authentication → Settings → **Authorized domains** mein add karein

## Security

- Backend har request par Firebase login token verify karta hai — sirf sahi logged-in user apna hi data (transactions, ledger, Vault documents) dekh/badal sakta hai, database seedha internet se access nahi hoti
- Vault (CNIC/Passport/medical documents) ke liye backend file-type (sirf image/PDF) aur size limit dono check karta hai
- `.env` files kabhi GitHub par commit na karein — `.gitignore` ye already exclude karta hai; asal values sirf Railway ke Variables tab mein rakhein
- Firebase Service Account key (`FIREBASE_SERVICE_ACCOUNT`) bohat sensitive hai — sirf Railway Variables mein rahe, kahin aur share na karein

## Zaroori baat
Railway ka free/trial tier limited hai — Postgres + do services chalane ke liye upgrade/paid plan ki zaroorat par sakti hai (Railway dashboard par "Choose a Plan" dekhein).
