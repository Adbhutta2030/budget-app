import { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { Wallet, Mail, Lock, Eye, EyeOff } from "lucide-react";
import logo from "./logo.png";

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
    <div className="w-full min-h-screen bg-gradient-to-br from-[#0a1628] via-[#0f2140] to-[#0a1628] flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden">
      {/* decorative background glow */}
      <div className="absolute -top-32 -left-20 w-80 h-80 bg-[#d4af5f]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 -right-16 w-96 h-96 bg-[#2c5788]/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#d4af5f]/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-7 text-center">
          <div className="relative mb-5 flex items-center justify-center w-24 h-24 rounded-full" style={{ background: "radial-gradient(circle, rgba(212,175,95,0.18) 0%, rgba(212,175,95,0) 70%)" }}>
            <div className="absolute inset-0 rounded-full border border-[#d4af5f]/25"></div>
            <img src={logo} alt="Logo" className="relative h-14 w-auto object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)]" />
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">My Budget Tracker</h1>
          <p className="text-[#8fa5c4] text-xs mt-1.5">Aapki apni, mehfooz, personal finance app</p>
        </div>

        {/* Card */}
        <div className="w-full bg-white/[0.05] backdrop-blur-xl border border-[#d4af5f]/15 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 text-white mb-1">
            <Wallet size={18} className="text-[#d4af5f]" />
            <p className="text-base font-medium">{mode === "login" ? "Welcome back" : "Account banayein"}</p>
          </div>
          <p className="text-xs text-[#8fa5c4] mb-6">
            {mode === "login" ? "Apne account mein login karein" : "Apna naya personal account banayein"}
          </p>

          <div className="space-y-3 mb-4">
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5c7398]" />
              <input
                type="email" placeholder="Email" value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-white/[0.06] border border-[#d4af5f]/15 rounded-xl pl-10 pr-3 py-3 text-sm text-white placeholder-[#5c7398] outline-none focus:border-[#d4af5f]/60 focus:bg-white/[0.09] transition"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5c7398]" />
              <input
                type={showPw ? "text" : "password"} placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
                className="w-full bg-white/[0.06] border border-[#d4af5f]/15 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-[#5c7398] outline-none focus:border-[#d4af5f]/60 focus:bg-white/[0.09] transition"
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5c7398] hover:text-[#8fa5c4]">
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full bg-gradient-to-r from-[#d4af5f] to-[#c49a45] hover:from-[#e0bd6f] hover:to-[#d4af5f] text-[#0a1628] py-3 rounded-xl text-sm font-semibold disabled:opacity-60 transition shadow-lg shadow-[#d4af5f]/20"
          >
            {busy ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
          </button>

          <p className="text-xs text-[#8fa5c4] text-center mt-5">
            {mode === "login" ? "Naya account chahiye?" : "Pehle se account hai?"}{" "}
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              className="text-[#d4af5f] font-medium hover:text-[#e0bd6f]"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        </div>
      </div>

      <p className="absolute bottom-6 left-0 right-0 text-center text-[#5c7398] text-xs z-10">
        By Ad Bhutta &middot; Cell # 0321-6101060
      </p>
    </div>
  );
}
