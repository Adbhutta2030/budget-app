import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { Wallet, Mail, Lock, Eye, EyeOff, Phone, Store, Fingerprint, X } from "lucide-react";
import MbtLogo from "./Logo";

const BIO_KEY = "mbt_biometric";

function bufferToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function registerBiometric(email, password) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "My Budget Tracker" },
      user: { id: userId, name: email, displayName: email },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
      attestation: "none",
    },
  });
  localStorage.setItem(BIO_KEY, JSON.stringify({ email, password, credId: bufferToBase64(cred.rawId) }));
}

async function assertBiometric(credId) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: base64ToBuffer(credId), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
}

export default function Login() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [bioSupported, setBioSupported] = useState(false);
  const [savedBio, setSavedBio] = useState(null); // { email, credId }
  const [rememberBio, setRememberBio] = useState(true);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState("");

  useEffect(() => {
    if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setBioSupported).catch(() => setBioSupported(false));
    }
    try {
      const stored = JSON.parse(localStorage.getItem(BIO_KEY) || "null");
      if (stored) setSavedBio({ email: stored.email, credId: stored.credId });
    } catch {}
  }, []);

  const submit = async () => {
    setError("");
    if (!email || !password) { setError("Email and password are both required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      if (rememberBio && bioSupported) {
        try { await registerBiometric(email, password); } catch {}
      }
    } catch (e) {
      const map = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/email-already-in-use": "An account with this email already exists — try logging in.",
        "auth/weak-password": "Password is too weak, use at least 6 characters.",
        "auth/invalid-email": "Please enter a valid email address.",
      };
      setError(map[e.code] || "Something went wrong. Please try again.");
    }
    setBusy(false);
  };

  const loginWithBiometric = async () => {
    setBioError("");
    setBioBusy(true);
    try {
      const stored = JSON.parse(localStorage.getItem(BIO_KEY) || "null");
      if (!stored) throw new Error("no-credential");
      await assertBiometric(stored.credId);
      await signInWithEmailAndPassword(auth, stored.email, stored.password);
    } catch (e) {
      setBioError("Biometric se login nahi ho saka. Neeche email/password se login karein.");
    }
    setBioBusy(false);
  };

  const forgetBiometric = () => {
    localStorage.removeItem(BIO_KEY);
    setSavedBio(null);
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-[#0a1628] via-[#0f2140] to-[#0a1628] flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden">
      {/* decorative background glow */}
      <div className="absolute -top-32 -left-20 w-80 h-80 bg-[#d4af5f]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 -right-16 w-96 h-96 bg-[#2c5788]/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#d4af5f]/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm relative z-10 py-6">
        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-5 text-center">
          <div className="relative mb-4 flex items-center justify-center w-24 h-24 rounded-full" style={{ background: "radial-gradient(circle, rgba(212,175,95,0.18) 0%, rgba(212,175,95,0) 70%)" }}>
            <MbtLogo size={88} />
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">My Budget Tracker</h1>
          <p className="text-[#d4af5f]/80 text-[11px] font-medium tracking-[0.2em] mt-1.5">PLAN &middot; TRACK &middot; SAVE &middot; GROW</p>
        </div>

        {/* Contact card */}
        <div className="flex items-center gap-3 bg-white/[0.05] border border-[#d4af5f]/20 rounded-2xl px-4 py-3 mb-5">
          <div className="w-9 h-9 rounded-full bg-[#d4af5f]/15 flex items-center justify-center shrink-0">
            <Store size={16} className="text-[#d4af5f]" />
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">Ad Bhutta &amp; Brothers</p>
            <div className="flex items-center gap-1 text-[#8fa5c4] text-xs">
              <Phone size={11} /> By Ad Bhutta &middot; 0321-6101060
            </div>
          </div>
        </div>

        {/* Biometric quick-login */}
        {savedBio && (
          <div className="mb-5">
            <button
              onClick={loginWithBiometric}
              disabled={bioBusy}
              className="w-full flex items-center justify-center gap-2 bg-[#d4af5f]/10 border border-[#d4af5f]/40 text-[#d4af5f] py-3 rounded-2xl text-sm font-semibold disabled:opacity-60"
            >
              <Fingerprint size={18} />
              {bioBusy ? "Verifying..." : `Unlock with Face ID / Fingerprint`}
            </button>
            <div className="flex items-center justify-between mt-2 px-1">
              <p className="text-[11px] text-[#5c7398] truncate">{savedBio.email}</p>
              <button onClick={forgetBiometric} className="text-[11px] text-[#5c7398] hover:text-rose-300 flex items-center gap-0.5 shrink-0">
                <X size={11} /> Remove
              </button>
            </div>
            {bioError && <p className="text-xs text-rose-300 mt-2 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{bioError}</p>}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/10"></div>
              <span className="text-[11px] text-[#5c7398]">or use email &amp; password</span>
              <div className="flex-1 h-px bg-white/10"></div>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="w-full bg-white/[0.05] backdrop-blur-xl border border-[#d4af5f]/15 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 text-white mb-1">
            <Wallet size={18} className="text-[#d4af5f]" />
            <p className="text-base font-medium">{mode === "login" ? "Welcome back" : "Create your account"}</p>
          </div>
          <p className="text-xs text-[#8fa5c4] mb-6">
            {mode === "login" ? "Sign in to continue your financial journey" : "Set up your new personal account"}
          </p>

          <div className="space-y-3 mb-4">
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5c7398]" />
              <input
                type="email" placeholder="Email address" value={email}
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

          {bioSupported && (
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input type="checkbox" checked={rememberBio} onChange={e => setRememberBio(e.target.checked)}
                className="w-4 h-4 accent-[#d4af5f]" />
              <span className="text-xs text-[#8fa5c4] flex items-center gap-1"><Fingerprint size={13}/> Enable Face ID / Fingerprint login on this device</span>
            </label>
          )}

          {error && <p className="text-xs text-rose-300 mb-3 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full bg-gradient-to-r from-[#d4af5f] to-[#c49a45] hover:from-[#e0bd6f] hover:to-[#d4af5f] text-[#0a1628] py-3 rounded-xl text-sm font-semibold disabled:opacity-60 transition shadow-lg shadow-[#d4af5f]/20"
          >
            {busy ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
          </button>

          <p className="text-xs text-[#8fa5c4] text-center mt-5">
            {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              className="text-[#d4af5f] font-medium hover:text-[#e0bd6f]"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
