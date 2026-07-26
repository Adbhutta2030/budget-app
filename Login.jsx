import { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { Wallet, Mail, Lock, Eye, EyeOff } from "lucide-react";
import logo from "./assets/logo.png";

export default function Login() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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
    <div className="w-full min-h-screen bg-gradient-to-br from-stone-900 via-stone-900 to-amber-950 flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden">
      {/* decorative background blobs */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-16 w-80 h-80 bg-stone-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-7 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/95 shadow-xl shadow-black/20 flex items-center justify-center p-2.5 mb-4 ring-1 ring-white/10">
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">My Budget Tracker</h1>
          <p className="text-stone-400 text-xs mt-1">Aapki apni, mehfooz, personal finance app</p>
        </div>

        {/* Card */}
        <div className="w-full bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/30">
          <div className="flex items-center gap-2 text-white mb-1">
            <Wallet size={18} className="text-amber-400" />
            <p className="text-base font-medium">{mode === "login" ? "Welcome back" : "Account banayein"}</p>
          </div>
          <p className="text-xs text-stone-400 mb-6">
            {mode === "login" ? "Apne account mein login karein" : "Apna naya personal account banayein"}
          </p>

          <div className="space-y-3 mb-4">
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="email" placeholder="Email" value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-white/[0.07] border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm text-white placeholder-stone-500 outline-none focus:border-amber-400/60 focus:bg-white/[0.1] transition"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type={showPw ? "text" : "password"} placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
                className="w-full bg-white/[0.07] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-stone-500 outline-none focus:border-amber-400/60 focus:bg-white/[0.1] transition"
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-rose-400 mb-3 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full bg-amber-500 hover:bg-amber-400 text-stone-900 py-3 rounded-xl text-sm font-semibold disabled:opacity-60 transition shadow-lg shadow-amber-500/20"
          >
            {busy ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
          </button>

          <p className="text-xs text-stone-400 text-center mt-5">
            {mode === "login" ? "Naya account chahiye?" : "Pehle se account hai?"}{" "}
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              className="text-amber-400 font-medium hover:text-amber-300"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        </div>

        <p className="text-center text-stone-500 text-[11px] mt-6">By Ad Bhutta &amp; Brothers</p>
      </div>
    </div>
  );
}
