import { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { Wallet } from "lucide-react";

export default function Login() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!email || !password) { setError("Email aur password dono zaroori hain."); return; }
    if (password.length < 6) { setError("Password kam az kam 6 characters ka hona chahiye."); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      const map = {
        "auth/invalid-credential": "Email ya password ghalat hai.",
        "auth/email-already-in-use": "Ye email pehle se account rakhta hai — Login try karein.",
        "auth/weak-password": "Password kamzor hai, kam az kam 6 characters use karein.",
        "auth/invalid-email": "Email sahi format mein likhein.",
      };
      setError(map[e.code] || "Kuch ghalat ho gaya. Dobara koshish karein.");
    }
    setBusy(false);
  };

  return (
    <div className="w-full min-h-screen bg-stone-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 text-stone-900 mb-1">
          <Wallet size={20} />
          <p className="text-lg font-medium">My budget tracker</p>
        </div>
        <p className="text-sm text-stone-400 mb-6">
          {mode === "login" ? "Apne account mein login karein" : "Naya account banayein"}
        </p>

        <div className="space-y-3 mb-4">
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-stone-400"
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-stone-400"
          />
        </div>

        {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full bg-stone-900 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {busy ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
        </button>

        <p className="text-xs text-stone-400 text-center mt-4">
          {mode === "login" ? "Naya account chahiye?" : "Pehle se account hai?"}{" "}
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            className="text-stone-900 font-medium underline"
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}
