import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy } from "firebase/firestore";
import { Plus, X, Trash2, FileText, Lock, Download, ImageOff } from "lucide-react";

const VAULT_CATEGORIES = [
  { id: "CNIC", label: "CNIC", color: "#4A7C8C" },
  { id: "Passport", label: "Passport", color: "#8B5FA3" },
  { id: "Passport photo", label: "Passport size photo", color: "#B8555A" },
  { id: "Vehicle documents", label: "Gari k documents", color: "#3F8F6E" },
  { id: "Medical report", label: "Medical report", color: "#BF7E3D" },
  { id: "Other", label: "Other", color: "#7C7C74" },
];

function categoryMeta(id) {
  return VAULT_CATEGORIES.find(c => c.id === id) || VAULT_CATEGORIES[VAULT_CATEGORIES.length - 1];
}

// Compress an image file down to a reasonable size and return a base64 data URL.
function compressImage(file, maxDim = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Vault({ uid }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, "budgets", uid, "vault"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load vault items:", e);
      }
      setLoaded(true);
    })();
  }, [uid]);

  const addItem = async (data) => {
    const ref = doc(collection(db, "budgets", uid, "vault"));
    const record = { ...data, createdAt: new Date().toISOString() };
    await setDoc(ref, record);
    setItems(prev => [{ id: ref.id, ...record }, ...prev]);
  };

  const deleteItem = async (id) => {
    await deleteDoc(doc(db, "budgets", uid, "vault", id));
    setItems(prev => prev.filter(i => i.id !== id));
    setViewing(null);
  };

  if (!loaded) {
    return <div className="w-full min-h-[300px] flex items-center justify-center text-sm text-stone-400">Loading vault...</div>;
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-[#0a1628] flex items-center justify-center shrink-0">
          <Lock size={16} className="text-[#d4af5f]" />
        </div>
        <p className="text-xs text-stone-500">
          Aapke zaroori documents yahan mehfooz save hote hain — sirf aap hi apne account se inhe dekh sakte hain.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-8 text-center">
          <p className="text-sm text-stone-400">Koi document save nahi hua abhi. Neeche + button se add karein.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map(item => {
            const meta = categoryMeta(item.category);
            const isImage = item.mimeType?.startsWith("image/");
            return (
              <button key={item.id} onClick={() => setViewing(item)}
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden text-left hover:border-stone-300 transition">
                <div className="w-full aspect-[4/3] bg-stone-100 flex items-center justify-center overflow-hidden">
                  {isImage ? (
                    <img src={item.dataUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <FileText size={28} className="text-stone-400" />
                  )}
                </div>
                <div className="p-2.5">
                  <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mb-1" style={{ background: meta.color + "20", color: meta.color }}>
                    {meta.label}
                  </span>
                  <p className="text-xs font-medium text-stone-800 truncate">{item.title}</p>
                  <p className="text-[10px] text-stone-400">{item.createdAt?.slice(0, 10)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-5 right-1/2 translate-x-[calc(50%+0px)] max-w-2xl w-full px-4 pointer-events-none" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-end pointer-events-auto">
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-[#0a1628] text-white px-5 py-3 rounded-full shadow-lg text-sm font-medium">
            <Plus size={18} /> Add document
          </button>
        </div>
      </div>

      {showAdd && <AddVaultModal onClose={() => setShowAdd(false)} onSave={async (data) => { await addItem(data); setShowAdd(false); }} />}

      {viewing && (
        <ViewVaultModal item={viewing} onClose={() => setViewing(null)} onDelete={() => deleteItem(viewing.id)} />
      )}
    </div>
  );
}

function AddVaultModal({ onClose, onSave }) {
  const [category, setCategory] = useState(VAULT_CATEGORIES[0].id);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (f) => {
    setError("");
    setFile(null);
    setPreview(null);
    if (!f) return;
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf";
    if (!isImage && !isPdf) { setError("Sirf image ya PDF file upload karein."); return; }

    try {
      let dataUrl;
      if (isImage) {
        dataUrl = await compressImage(f);
      } else {
        dataUrl = await readAsDataUrl(f);
      }
      // Firestore documents max out around 1MB — keep a safety margin.
      const approxBytes = dataUrl.length * 0.75;
      if (approxBytes > 850000) {
        setError("Ye file bohot bari hai. Image use karein ya chhoti file try karein.");
        return;
      }
      setFile({ mimeType: f.type });
      setPreview(dataUrl);
    } catch {
      setError("File process nahi ho saki. Dobara koshish karein.");
    }
  };

  const save = async () => {
    if (!title.trim() || !preview) return;
    setBusy(true);
    try {
      await onSave({ category, title: title.trim(), dataUrl: preview, mimeType: file.mimeType });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Document add karein">
      <Field label="Category">
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400">
          {VAULT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Title">
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. CNIC front side"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
      </Field>
      <Field label="File (photo ya PDF)">
        <input type="file" accept="image/*,application/pdf" onChange={e => handleFile(e.target.files?.[0])}
          className="w-full text-sm text-stone-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-stone-100 file:text-sm file:text-stone-700" />
      </Field>
      {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
      {preview && file?.mimeType?.startsWith("image/") && (
        <img src={preview} alt="preview" className="w-full max-h-48 object-contain rounded-lg border border-stone-200 mb-3" />
      )}
      {preview && file?.mimeType === "application/pdf" && (
        <p className="text-xs text-emerald-700 mb-3">✓ PDF taiyar hai save karne ke liye.</p>
      )}
      <button onClick={save} disabled={!title.trim() || !preview || busy}
        className="w-full bg-[#0a1628] text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
        {busy ? "Saving..." : "Save document"}
      </button>
    </Modal>
  );
}

function ViewVaultModal({ item, onClose, onDelete }) {
  const meta = categoryMeta(item.category);
  const isImage = item.mimeType?.startsWith("image/");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Modal onClose={onClose} title={item.title}>
      <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mb-3" style={{ background: meta.color + "20", color: meta.color }}>
        {meta.label}
      </span>
      <div className="rounded-lg overflow-hidden border border-stone-200 mb-4 bg-stone-50 flex items-center justify-center">
        {isImage ? (
          <img src={item.dataUrl} alt={item.title} className="w-full max-h-96 object-contain" />
        ) : (
          <div className="p-8 flex flex-col items-center gap-2">
            <FileText size={32} className="text-stone-400" />
            <p className="text-xs text-stone-400">PDF document</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <a href={item.dataUrl} download={item.title}
          className="flex-1 flex items-center justify-center gap-2 bg-stone-100 text-stone-700 py-2.5 rounded-lg text-sm font-medium">
          <Download size={15} /> Download
        </a>
        {!confirmingDelete ? (
          <button onClick={() => setConfirmingDelete(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-rose-50 text-rose-600 py-2.5 rounded-lg text-sm font-medium">
            <Trash2 size={15} /> Delete
          </button>
        ) : (
          <button onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-2 bg-rose-600 text-white py-2.5 rounded-lg text-sm font-medium">
            Confirm delete
          </button>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-stone-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-medium truncate pr-2">{title}</p>
          <button onClick={onClose} className="text-stone-400 shrink-0"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
