# My Budget Tracker

## Step 1 — Apne computer par test karein

1. Node.js install karein (agar pehle se nahi hai): https://nodejs.org (LTS version download karein)
2. Ye folder kisi bhi jagah unzip/extract karein
3. Terminal / Command Prompt kholein, is folder mein jayein:
   ```
   cd budget-app
   ```
4. Dependencies install karein:
   ```
   npm install
   ```
5. App start karein:
   ```
   npm run dev
   ```
6. Terminal mein jo link dikhega (e.g. `http://localhost:5173`) usay browser mein kholein

### Apne phone se bhi test karna hai (same wifi par)?
`npm run dev` chalane ke baad terminal mein ek "Network" link bhi milega (e.g. `http://192.168.x.x:5173`) — wo link apne phone ke browser mein kholein, bas dono devices ek hi wifi par hone chahiye.

## Step 2 — Internet par free publish karein

**Sabse aasan tareeqa: Vercel**

1. https://vercel.com par free account banayein (GitHub se login kar sakte hain)
2. Apna code GitHub par upload karein (github.com par new repository banayein, is folder ka content upload karein)
3. Vercel mein "Add New Project" karein, apni GitHub repository select karein
4. Vercel khud detect kar lega ke ye Vite project hai — bas "Deploy" par click karein
5. 1-2 minute mein aapko ek live link mil jayega (e.g. `your-app.vercel.app`) jo kisi ko bhi bhej sakte hain

**Alternative: Netlify Drop (bina GitHub ke)**

1. Terminal mein: `npm run build` chalayein — ye ek `dist` folder banayega
2. https://app.netlify.com/drop par jayein
3. `dist` folder ko wahan drag-and-drop karein
4. Turant ek live link mil jayega

## Firebase setup (zaroori — is ke bina app nahi chalegi)

Ab ye app cloud database (Firebase) use karti hai, taake aap phone aur laptop dono par **same email se login** kar ke wahi data dekh sakein.

### A. Firebase project banayein (free)
1. https://console.firebase.google.com par jayein, Google account se login karein
2. "Add project" par click karein, koi bhi naam dein (e.g. "my-budget-app"), continue karte jayein (Google Analytics ki zaroorat nahi, off kar dein)

### B. Authentication (login system) enable karein
1. Left sidebar mein **Build → Authentication** par jayein
2. "Get started" click karein
3. "Email/Password" provider select karein, enable karein, Save karein

### C. Firestore (database) banayein
1. Left sidebar mein **Build → Firestore Database** par jayein
2. "Create database" click karein
3. **"Start in test mode"** select karein (demo ke liye theek hai — real users ke liye baad mein security rules set karni hongi, neeche note dekhein)
4. Koi bhi region choose kar lein, "Enable" karein

### D. Apni app ko Firebase se connect karein
1. Project Overview (home icon, top-left) par jayein
2. Web icon (`</>`) par click karein, app ka nickname dein (e.g. "budget-web"), "Register app"
3. Jo `firebaseConfig` object dikhega (apiKey, authDomain, wagera), usay copy karein
4. Apne code mein `src/firebase.js` file kholein, `firebaseConfig` ki saari `"PASTE_..."` values ko apni actual copied values se replace karein
5. Save karein

### E. Chalayein
```
npm install
npm run dev
```
Ab browser mein app khulegi, "Sign up" se ek email/password bana ke account create karein. Dusre device (phone/laptop) par bhi yehi app khol kar **same email/password se login** karein — data automatically sync ho jayega.

### Security note (zaroori)
"Test mode" 30 din baad expire ho jata hai aur database ko sab ke liye publicly readable/writable chor deta hai. Real use ke liye, Firestore → Rules mein jaa kar ye rules paste karein (sirf logged-in user apna hi data padh/likh sake):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /budgets/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Zaroori baat
Firebase ka **free tier** (Spark plan) itna generous hai ke ek personal budget app ke liye paisay lagne ka koi imkaan nahi — jab tak app bohat zyada users use na karay.
