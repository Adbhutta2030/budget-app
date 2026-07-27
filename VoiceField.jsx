import { useState, useRef } from "react";
import { Mic, Square } from "lucide-react";

// A text input with an inline mic button — type manually OR dictate by voice.
export default function VoiceField({ value, onChange, placeholder, className, listId }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const toggleMic = () => {
    if (listening) {
      try { recRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input is browser mein support nahi hai. Chrome try karein.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onChange(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className={`relative ${className || ""}`}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="w-full border border-stone-200 rounded-lg pl-3 pr-10 py-2 text-sm outline-none focus:border-stone-400"
      />
      <button
        type="button"
        onClick={toggleMic}
        title="Bol kar likhein"
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center ${listening ? "bg-rose-600 text-white animate-pulse" : "bg-stone-100 text-stone-500"}`}>
        {listening ? <Square size={12} /> : <Mic size={13} />}
      </button>
    </div>
  );
}
