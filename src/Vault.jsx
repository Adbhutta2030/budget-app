import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, getDoc, getDocs, query, orderBy } from "firebase/firestore";
import { Plus, X, Trash2, FileText, Lock, Download, Camera, Share2 } from "lucide-react";
import VoiceField from "./VoiceField";

const DEFAULT_VAULT_CATEGORIES = [
  { id: "CNIC", label: "CNIC", color: "#4A7C8C" },
  { id: "Passport", label: "Passport", color: "#8B5FA3" },
  { id: "Passport photo", label: "Passport size photo", color: "#B8555A" },
  { id: "Vehicle documents", label: "Gari k documents", color: "#3F8F6E" },
  { id: "Medical report", label: "Medical report", color: "#BF7E3D" },
];
const PALETTE = ["#D97748", "#4A7C8C", "#8B5FA3", "#C9A227", "#B8555A", "#3F8F6E", "#5B6FBE", "#BF7E3D", "#7C7C74", "#6B9B7A"];

function colorForName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function categoryMeta(id, customCategories = []) {
  const found = DEFAULT_VAULT_CATEGORIES.find(c => c.id === id);
  if (found) return found;
  if (customCategories.includes(id)) return { id, label: id, color: colorForName(id) };
  return { id: id || "Other", label: id || "Other", color: colorForName(id || "Other") };
}

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

// Crop an already-loaded <img> element to a percentage-based rectangle, then
// downscale/compress the result — this is the "scan" step for documents.
function cropImageToDataUrl(imgEl, rectPct, maxDim = 1280, quality = 0.75) {
  const sx = (rectPct.x / 100) * imgEl.naturalWidth;
  const sy = (rectPct.y / 100) * imgEl.naturalHeight;
  const sw = (rectPct.w / 100) * imgEl.naturalWidth;
  const sh = (rectPct.h / 100) * imgEl.naturalHeight;
  let outW = sw, outH = sh;
  if (outW > maxDim || outH > maxDim) {
    if (outW > outH) { outH = Math.round(outH * (maxDim / outW)); outW = maxDim; }
    else { outW = Math.round(outW * (maxDim / outH)); outH = maxDim; }
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(outW));
  canvas.height = Math.max(1, Math.round(outH));
  canvas.getContext("2d").drawImage(imgEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, filename, mimeType) {
  const arr = dataUrl.split(",");
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mimeType });
}

async function shareDocument(item) {
  const ext = item.mimeType === "application/pdf" ? "pdf" : "jpg";
  const filename = `${item.title.replace(/\s+/g, "_")}.${ext}`;
  const file = dataUrlToFile(item.dataUrl, filename, item.mimeType);

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: item.title, text: item.title });
      return;
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }

  const a = document.createElement("a");
  a.href = item.dataUrl; a.download = filename; a.click();
  const msg = encodeURIComponent(`${item.title} — file download ho gayi hai, WhatsApp chat mein attach kar dein.`);
  window.open(`https://wa.me/?text=${msg}`, "_blank");
}

export default function Vault({ uid }) {
  const [items, setItems] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, "budgets", uid, "vault"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        const catSnap = await getDoc(doc(db, "budgets", uid, "meta", "vaultCategories"));
        setCustomCategories(catSnap.exists() ? (catSnap.data().list || []) : []);
      } catch (e) {
        console.error("Failed to load vault items:", e);
      }
      setLoaded(true);
    })();
  }, [uid]);

  const addCustomCategory = async (name) => {
    if (customCategories.includes(name)) return;
    const next = [...customCategories, name];
    setCustomCategories(next);
    try {
      await setDoc(doc(db, "budgets", uid, "meta", "vaultCategories"), { list: next });
    } catch (e) {
      console.error("Failed to save category:", e);
    }
  };

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
    return <div className="w-full min-h-[300px] flex items-center justify-center text-base text-stone-400">Loading vault...</div>;
  }

  return (
    <div className="space-y-4 pb-24">
      <h2 className="text-xl font-medium text-stone-800">Personal Documents</h2>
      <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
        <div className="w-9 h-9 rounded-full bg-[#0a1628] flex items-center justify-center shrink-0">
          <Lock size={18} className="text-[#d4af5f]" />
        </div>
        <p className="text-sm text-stone-500">
          Aapke zaroori documents yahan mehfooz save hote hain — sirf aap hi apne account se inhe dekh sakte hain.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-8 text-center shadow-sm hover:shadow-md transition-shadow">
          <p className="text-base text-stone-400">Koi document save nahi hua abhi. Neeche + button se add karein.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map(item => {
            const meta = categoryMeta(item.category, customCategories);
            const isImage = item.mimeType?.startsWith("image/");
            return (
              <button key={item.id} onClick={() => setViewing(item)}
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden text-left hover:border-stone-300 transition shadow-sm hover:shadow-md transition-shadow">
                <div className="w-full aspect-[4/3] bg-stone-100 flex items-center justify-center overflow-hidden">
                  {isImage ? (
                    <img src={item.dataUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <FileText size={31} className="text-stone-400" />
                  )}
                </div>
                <div className="p-2.5">
                  <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded mb-1" style={{ background: meta.color + "20", color: meta.color }}>
                    {meta.label}
                  </span>
                  <p className="text-sm font-medium text-stone-800 truncate">{item.title}</p>
                  <p className="text-xs text-stone-400">{item.createdAt?.slice(0, 10)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-5 right-1/2 translate-x-[calc(50%+0px)] max-w-2xl w-full px-4 pointer-events-none" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-end pointer-events-auto">
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-[#0a1628] text-white px-5 py-3 rounded-full shadow-lg text-base font-medium">
            <Plus size={20} /> Add document
          </button>
        </div>
      </div>

      {showAdd && (
        <AddVaultModal
          customCategories={customCategories}
          onAddCategory={addCustomCategory}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => { await addItem(data); setShowAdd(false); }}
        />
      )}

      {viewing && (
        <ViewVaultModal item={viewing} onClose={() => setViewing(null)} onDelete={() => deleteItem(viewing.id)} />
      )}
    </div>
  );
}

function AddVaultModal({ customCategories, onAddCategory, onClose, onSave }) {
  const allCategories = [...DEFAULT_VAULT_CATEGORIES.map(c => c.id), ...customCategories];
  const [category, setCategory] = useState(allCategories[0] || "");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirmNewCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    onAddCategory(name);
    setCategory(name);
    setAddingCategory(false);
    setNewCategoryName("");
  };

  const finishWithDataUrl = (dataUrl, mimeType) => {
    const approxBytes = dataUrl.length * 0.75;
    if (approxBytes > 850000) {
      setError("Ye file bohot bari hai. Thora zoom out kar ke crop karein ya chhoti file try karein.");
      return;
    }
    setFile({ mimeType });
    setPreview(dataUrl);
  };

  const handleFile = async (f) => {
    setError("");
    setFile(null);
    setPreview(null);
    setCropSrc(null);
    if (!f) return;
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf";
    if (!isImage && !isPdf) { setError("Sirf image ya PDF file upload karein."); return; }

    try {
      if (isImage) {
        // Route through the crop ("scan") step so the document can be cleanly cropped first.
        const rawDataUrl = await readAsDataUrl(f);
        setCropSrc(rawDataUrl);
      } else {
        const dataUrl = await readAsDataUrl(f);
        finishWithDataUrl(dataUrl, f.type);
      }
    } catch {
      setError("File process nahi ho saki. Dobara koshish karein.");
    }
  };

  const save = async () => {
    if (!title.trim() || !preview || !category) return;
    setBusy(true);
    try {
      await onSave({ category, title: title.trim(), dataUrl: preview, mimeType: file.mimeType });
    } finally {
      setBusy(false);
    }
  };

  if (cropSrc) {
    return (
      <Modal onClose={onClose} title="Scan document">
        <ImageCropper
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={(croppedDataUrl) => { finishWithDataUrl(croppedDataUrl, "image/jpeg"); setCropSrc(null); }}
        />
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Add document">
      <Field label="Category">
        {!addingCategory ? (
          <div className="flex gap-2">
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-base outline-none focus:border-stone-400">
              {allCategories.map(id => {
                const meta = categoryMeta(id, customCategories);
                return <option key={id} value={id}>{meta.label}</option>;
              })}
            </select>
            <button onClick={() => setAddingCategory(true)} type="button"
              className="px-3 border border-stone-200 rounded-lg text-stone-500 hover:border-stone-400">
              <Plus size={18} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Nayi category ka naam" autoFocus
              className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-base outline-none focus:border-stone-400" />
            <button onClick={confirmNewCategory} type="button" className="px-3 bg-stone-900 text-white rounded-lg text-sm font-medium">Add</button>
            <button onClick={() => { setAddingCategory(false); setNewCategoryName(""); }} type="button" className="px-2 text-stone-400"><X size={18} /></button>
          </div>
        )}
      </Field>
      <Field label="Title">
        <VoiceField value={title} onChange={setTitle} placeholder="e.g. CNIC front side" />
      </Field>
      <Field label="File">
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-2 bg-stone-100 text-stone-700 text-base py-2.5 rounded-lg cursor-pointer">
            <Camera size={17} /> Scan / Camera
            <input type="file" accept="image/*" capture="environment" onChange={e => handleFile(e.target.files?.[0])} className="hidden" />
          </label>
          <label className="flex-1 flex items-center justify-center gap-2 bg-stone-100 text-stone-700 text-base py-2.5 rounded-lg cursor-pointer">
            <FileText size={17} /> Choose file
            <input type="file" accept="image/*,application/pdf" onChange={e => handleFile(e.target.files?.[0])} className="hidden" />
          </label>
        </div>
      </Field>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {preview && file?.mimeType?.startsWith("image/") && (
        <img src={preview} alt="preview" className="w-full max-h-48 object-contain rounded-lg border border-stone-200 mb-3" />
      )}
      {preview && file?.mimeType === "application/pdf" && (
        <p className="text-sm text-emerald-700 mb-3">✓ PDF taiyar hai save karne ke liye.</p>
      )}
      <button onClick={save} disabled={!title.trim() || !preview || !category || busy}
        className="w-full bg-[#0a1628] text-white py-2.5 rounded-lg text-base font-medium disabled:opacity-50">
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
      <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded mb-3" style={{ background: meta.color + "20", color: meta.color }}>
        {meta.label}
      </span>
      <div className="rounded-lg overflow-hidden border border-stone-200 mb-4 bg-stone-50 flex items-center justify-center">
        {isImage ? (
          <img src={item.dataUrl} alt={item.title} className="w-full max-h-96 object-contain" />
        ) : (
          <div className="p-8 flex flex-col items-center gap-2">
            <FileText size={35} className="text-stone-400" />
            <p className="text-sm text-stone-400">PDF document</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={() => shareDocument(item)}
          className="flex-1 flex items-center justify-center gap-2 bg-[#0a1628] text-white py-2.5 rounded-lg text-base font-medium">
          <Share2 size={17} /> Share
        </button>
        <a href={item.dataUrl} download={item.title}
          className="flex items-center justify-center w-11 bg-stone-100 text-stone-700 rounded-lg">
          <Download size={17} />
        </a>
        {!confirmingDelete ? (
          <button onClick={() => setConfirmingDelete(true)}
            className="flex items-center justify-center w-11 bg-rose-50 text-rose-600 rounded-lg">
            <Trash2 size={17} />
          </button>
        ) : (
          <button onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-2 bg-rose-600 text-white py-2.5 rounded-lg text-base font-medium">
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
      <label className="block text-sm font-medium text-stone-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ImageCropper({ src, onCancel, onConfirm }) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [rect, setRect] = useState({ x: 8, y: 8, w: 84, h: 84 });
  const dragRef = useRef(null);

  const onMove = (e) => {
    if (!dragRef.current || !containerRef.current) return;
    e.preventDefault?.();
    const point = e.touches ? e.touches[0] : e;
    const box = containerRef.current.getBoundingClientRect();
    const dxPct = ((point.clientX - dragRef.current.startX) / box.width) * 100;
    const dyPct = ((point.clientY - dragRef.current.startY) / box.height) * 100;
    const { mode, startRect } = dragRef.current;
    const MIN = 10;
    let next = { ...startRect };
    if (mode === "move") {
      next.x = clamp(startRect.x + dxPct, 0, 100 - startRect.w);
      next.y = clamp(startRect.y + dyPct, 0, 100 - startRect.h);
    } else {
      if (mode.includes("w")) {
        const newX = clamp(startRect.x + dxPct, 0, startRect.x + startRect.w - MIN);
        next.w = startRect.w - (newX - startRect.x);
        next.x = newX;
      }
      if (mode.includes("e")) next.w = clamp(startRect.w + dxPct, MIN, 100 - startRect.x);
      if (mode.includes("n")) {
        const newY = clamp(startRect.y + dyPct, 0, startRect.y + startRect.h - MIN);
        next.h = startRect.h - (newY - startRect.y);
        next.y = newY;
      }
      if (mode.includes("s")) next.h = clamp(startRect.h + dyPct, MIN, 100 - startRect.y);
    }
    setRect(next);
  };

  const onUp = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
  };

  const onDown = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const point = e.touches ? e.touches[0] : e;
    dragRef.current = { mode, startX: point.clientX, startY: point.clientY, startRect: { ...rect } };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  const confirm = () => {
    if (!imgRef.current) return;
    onConfirm(cropImageToDataUrl(imgRef.current, rect));
  };

  return (
    <div>
      <p className="text-sm text-stone-500 mb-2">Document ke corners tak box adjust karein, phir crop kar dein.</p>
      <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden" style={{ touchAction: "none" }}>
        <img ref={imgRef} src={src} alt="Scan preview" className="w-full block" draggable={false} />
        <div
          onMouseDown={onDown("move")} onTouchStart={onDown("move")}
          className="absolute border-2 border-white cursor-move"
          style={{ left: rect.x + "%", top: rect.y + "%", width: rect.w + "%", height: rect.h + "%", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
        >
          {["nw", "ne", "sw", "se"].map(pos => (
            <div key={pos}
              onMouseDown={onDown(pos)} onTouchStart={onDown(pos)}
              className="absolute w-5 h-5 bg-white rounded-full border border-stone-400"
              style={{
                ...(pos.includes("n") ? { top: -10 } : { bottom: -10 }),
                ...(pos.includes("w") ? { left: -10 } : { right: -10 }),
                cursor: `${pos}-resize`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} type="button" className="flex-1 bg-stone-100 text-stone-600 py-2.5 rounded-lg text-base font-medium">Cancel</button>
        <button onClick={confirm} type="button" className="flex-1 bg-[#0a1628] text-white py-2.5 rounded-lg text-base font-medium">Crop &amp; use</button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-lg font-medium truncate pr-2">{title}</p>
          <button onClick={onClose} className="text-stone-400 shrink-0"><X size={22} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
