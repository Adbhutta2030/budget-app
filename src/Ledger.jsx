import { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy } from "firebase/firestore";
import { Plus, X, Trash2, Share2, Users, ArrowDownLeft, ArrowUpRight, Info, Pencil } from "lucide-react";
import { jsPDF } from "jspdf";
import VoiceField from "./VoiceField";

const fmt = n => "Rs " + Math.round(n).toLocaleString();
const todayStr = () => new Date().toISOString().slice(0, 10);

function groupKey(person, phone) {
  const p = person.trim().toLowerCase();
  const ph = (phone || "").trim();
  return ph ? `${p}|${ph}` : p;
}

function buildPeople(entries) {
  const map = {};
  entries.forEach(e => {
    const key = groupKey(e.person, e.phone);
    if (!map[key]) map[key] = { key, name: e.person, phone: e.phone || "", gave: 0, took: 0, entries: [] };
    map[key][e.direction === "gave" ? "gave" : "took"] += e.amount;
    map[key].entries.push(e);
  });
  const people = Object.values(map);

  // Detect name collisions (same display name, different key = different actual person)
  const nameCounts = {};
  people.forEach(p => {
    const n = p.name.trim().toLowerCase();
    nameCounts[n] = (nameCounts[n] || 0) + 1;
  });

  return people.map(p => ({
    ...p,
    balance: p.gave - p.took,
    ambiguous: nameCounts[p.name.trim().toLowerCase()] > 1,
    entries: p.entries.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || "")),
  })).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

function displayLabel(p) {
  if (p.ambiguous && p.phone) return `${p.name} (${p.phone})`;
  if (p.ambiguous) return `${p.name} (no phone)`;
  return p.name;
}

function generateStatementPdf(person, entries, balance) {
  const docPdf = new jsPDF();
  let y = 20;
  docPdf.setFontSize(16);
  docPdf.text("Account Statement", 14, y);
  y += 8;
  docPdf.setFontSize(11);
  docPdf.text(`Name: ${person.name}`, 14, y);
  y += 6;
  if (person.phone) { docPdf.text(`Phone: ${person.phone}`, 14, y); y += 6; }
  docPdf.text(`Statement date: ${todayStr()}`, 14, y);
  y += 10;

  docPdf.setFontSize(10);
  docPdf.setFont(undefined, "bold");
  docPdf.text("Date", 14, y);
  docPdf.text("Detail", 44, y);
  docPdf.text("Payment", 130, y, { align: "right" });
  docPdf.text("Received", 160, y, { align: "right" });
  docPdf.text("Balance", 195, y, { align: "right" });
  docPdf.setFont(undefined, "normal");
  y += 3;
  docPdf.line(14, y, 196, y);
  y += 6;

  let running = 0;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || ""));
  sorted.forEach(e => {
    if (y > 275) { docPdf.addPage(); y = 20; }
    running += e.direction === "gave" ? e.amount : -e.amount;
    docPdf.text(e.date, 14, y);
    docPdf.text((e.note || "-").slice(0, 28), 44, y);
    docPdf.text(e.direction === "gave" ? Math.round(e.amount).toLocaleString() : "-", 130, y, { align: "right" });
    docPdf.text(e.direction === "took" ? Math.round(e.amount).toLocaleString() : "-", 160, y, { align: "right" });
    docPdf.text(Math.round(running).toLocaleString(), 195, y, { align: "right" });
    y += 7;
  });

  if (Math.round(running) !== Math.round(balance)) {
    // safety check — should always match, but guard against silent drift
    running = balance;
  }

  y += 6;
  docPdf.line(14, y, 196, y);
  y += 8;
  docPdf.setFontSize(12);
  docPdf.setFont(undefined, "bold");
  const summary = balance >= 0
    ? `${person.name} ne aap ko ${fmt(Math.abs(balance))} dena hai`
    : `Aap ne ${person.name} ko ${fmt(Math.abs(balance))} dena hai`;
  docPdf.text(summary, 14, y);

  return docPdf.output("blob");
}

async function shareStatement(person, entries, balance) {
  const blob = generateStatementPdf(person, entries, balance);
  const filename = `${person.name.replace(/\s+/g, "_")}_statement.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${person.name} - Statement`, text: `${person.name} ka statement attached hai.` });
      return;
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);

  const summary = balance >= 0
    ? `${person.name} ne mera ${fmt(Math.abs(balance))} dena hai.`
    : `Mera ${person.name} ka ${fmt(Math.abs(balance))} baqaya hai.`;
  const msg = encodeURIComponent(`${summary} PDF download ho gayi hai, WhatsApp chat mein attach kar dein.`);
  window.open(`https://wa.me/?text=${msg}`, "_blank");
}

export default function Ledger({ uid }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, "budgets", uid, "ledger"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load ledger:", e);
      }
      setLoaded(true);
    })();
  }, [uid]);

  const people = useMemo(() => buildPeople(entries), [entries]);

  const addEntry = async (data) => {
    const ref = doc(collection(db, "budgets", uid, "ledger"));
    const record = { ...data, createdAt: new Date().toISOString() };
    await setDoc(ref, record);
    setEntries(prev => [{ id: ref.id, ...record }, ...prev]);
  };

  const deleteEntry = async (id) => {
    await deleteDoc(doc(db, "budgets", uid, "ledger", id));
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const deletePersonEntries = async (person) => {
    await Promise.all(person.entries.map(e => deleteDoc(doc(db, "budgets", uid, "ledger", e.id))));
    const ids = new Set(person.entries.map(e => e.id));
    setEntries(prev => prev.filter(e => !ids.has(e.id)));
  };

  const updateEntry = async (id, data) => {
    const existing = entries.find(e => e.id === id);
    const record = { ...data, createdAt: existing?.createdAt || new Date().toISOString() };
    await setDoc(doc(db, "budgets", uid, "ledger", id), record);
    setEntries(prev => prev.map(e => (e.id === id ? { id, ...record } : e)));
  };

  if (!loaded) {
    return <div className="w-full min-h-[300px] flex items-center justify-center text-sm text-stone-400">Loading...</div>;
  }

  const openPerson = openKey ? people.find(p => p.key === openKey) : null;
  const existingNames = [...new Set(people.map(p => p.name))];

  return (
    <div className="space-y-4 pb-24">
      <h2 className="text-lg font-medium text-stone-800">Accounts</h2>
      <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-[#0a1628] flex items-center justify-center shrink-0">
          <Users size={16} className="text-[#d4af5f]" />
        </div>
        <p className="text-xs text-stone-500">
          Lena-dena ka hisaab yahan rakhein — har shaks ka alag record.
        </p>
      </div>

      {people.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-8 text-center">
          <p className="text-sm text-stone-400">Koi record nahi hai abhi. Neeche + button se add karein.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 p-2">
          {people.map(p => (
            <div key={p.key} className="flex items-center gap-1 rounded-xl hover:bg-stone-50">
              <button onClick={() => setOpenKey(p.key)}
                className="flex-1 flex items-center justify-between p-3 text-left min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0" style={{ background: p.balance >= 0 ? "#3F8F6E" : "#B8555A" }}>
                    {p.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5 truncate">
                      {displayLabel(p)}
                      {p.ambiguous && <Info size={12} className="text-amber-500 shrink-0" />}
                    </p>
                    <p className="text-xs text-stone-400">{p.entries.length} entries</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`text-sm font-medium tabular-nums ${p.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {fmt(Math.abs(p.balance))}
                  </p>
                  <p className="text-[10px] text-stone-400">{p.balance >= 0 ? "lena hai" : "dena hai"}</p>
                </div>
              </button>
              {deletingKey === p.key ? (
                <button onClick={() => { deletePersonEntries(p); setDeletingKey(null); }}
                  className="text-[10px] font-medium bg-rose-600 text-white px-2 py-1.5 rounded-lg shrink-0 mr-2">
                  Confirm
                </button>
              ) : (
                <button onClick={() => setDeletingKey(p.key)} className="text-stone-300 hover:text-rose-500 shrink-0 mr-2 p-1">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-5 right-1/2 translate-x-[calc(50%+0px)] max-w-2xl w-full px-4 pointer-events-none" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-end pointer-events-auto">
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-[#0a1628] text-white px-5 py-3 rounded-full shadow-lg text-sm font-medium">
            <Plus size={18} /> Add entry
          </button>
        </div>
      </div>

      {showAdd && (
        <AddLedgerModal
          existingNames={existingNames}
          people={people}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => { await addEntry(data); setShowAdd(false); }}
        />
      )}

      {editingEntry && (
        <AddLedgerModal
          existingNames={existingNames}
          people={people}
          initial={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={async (data) => { await updateEntry(editingEntry.id, data); setEditingEntry(null); }}
        />
      )}

      {openPerson && (
        <PersonModal
          person={openPerson}
          onClose={() => setOpenKey(null)}
          onDelete={deleteEntry}
          onEdit={(entry) => { setOpenKey(null); setEditingEntry(entry); }}
          onShare={() => shareStatement(openPerson, openPerson.entries, openPerson.balance)}
        />
      )}
    </div>
  );
}

function AddLedgerModal({ existingNames, people, initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [person, setPerson] = useState(initial?.person || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [direction, setDirection] = useState(initial?.direction || "gave");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [note, setNote] = useState(initial?.note || "");
  const [busy, setBusy] = useState(false);

  const nameMatches = person.trim() && existingNames.some(n => n.toLowerCase() === person.trim().toLowerCase());
  const matchCount = person.trim() ? people.filter(p => p.name.toLowerCase() === person.trim().toLowerCase()).length : 0;

  const save = async () => {
    if (!person.trim() || !amount || parseFloat(amount) <= 0) return;
    setBusy(true);
    try {
      await onSave({ person: person.trim(), phone: phone.trim(), direction, amount: parseFloat(amount), date, note: note.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isEdit ? "Edit entry" : "Add payment or receipt"}>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setDirection("gave")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium ${direction === "gave" ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-500"}`}>
          <ArrowUpRight size={14} /> Payment (Diya)
        </button>
        <button onClick={() => setDirection("took")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium ${direction === "took" ? "bg-rose-600 text-white" : "bg-stone-100 text-stone-500"}`}>
          <ArrowDownLeft size={14} /> Received (Liya)
        </button>
      </div>
      <Field label="Kis ka naam?">
        <VoiceField value={person} onChange={setPerson} placeholder="e.g. Ahmed" listId="ledger-people" />
        <datalist id="ledger-people">
          {existingNames.map(n => <option key={n} value={n} />)}
        </datalist>
      </Field>
      {nameMatches && matchCount >= 1 && (
        <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mb-3 flex items-start gap-1.5">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>Is naam se pehle bhi record(s) hain. Agar ye koi doosra shaks hai (same naam), to neeche phone number zaroor dalein taake data mix na ho.</span>
        </div>
      )}
      <Field label="Phone number (agar naam repeat ho to zaroori)">
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0301-1234567"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
      </Field>
      <Field label="Amount">
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
      </Field>
      <Field label="Tareekh">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
      </Field>
      <Field label="Note (optional)">
        <VoiceField value={note} onChange={setNote} placeholder="e.g. Udhaar for shopping" />
      </Field>
      <button onClick={save} disabled={busy || !person.trim() || !amount}
        className="w-full bg-[#0a1628] text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
        {busy ? "Saving..." : isEdit ? "Update entry" : "Save entry"}
      </button>
    </Modal>
  );
}

function PersonModal({ person, onClose, onDelete, onEdit, onShare }) {
  return (
    <Modal onClose={onClose} title={displayLabel(person)}>
      <div className={`rounded-xl p-3 mb-4 ${person.balance >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
        <p className="text-xs text-stone-500 mb-0.5">{person.balance >= 0 ? `${person.name} ne aap ko dena hai` : `Aap ne ${person.name} ko dena hai`}</p>
        <p className={`text-xl font-medium ${person.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmt(Math.abs(person.balance))}</p>
        {person.phone && <p className="text-[11px] text-stone-400 mt-1">{person.phone}</p>}
      </div>

      <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
        {person.entries.slice().reverse().map(e => (
          <div key={e.id} className="flex items-center justify-between text-sm border-b border-stone-100 pb-2">
            <div>
              <p className={e.direction === "gave" ? "text-emerald-700" : "text-rose-700"}>
                {e.direction === "gave" ? "Payment" : "Received"} &middot; {fmt(e.amount)}
              </p>
              <p className="text-xs text-stone-400">{e.date}{e.note ? ` · ${e.note}` : ""}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onEdit(e)} className="text-stone-300 hover:text-stone-600"><Pencil size={14} /></button>
              <button onClick={() => onDelete(e.id)} className="text-stone-300 hover:text-rose-500"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={onShare} className="w-full flex items-center justify-center gap-2 bg-[#0a1628] text-white py-2.5 rounded-lg text-sm font-medium">
        <Share2 size={15} /> Statement PDF banayein aur bhejein
      </button>
      <p className="text-[10px] text-stone-400 text-center mt-2">
        Mobile par WhatsApp seedha khulega file ke sath; desktop par PDF download ho kar WhatsApp Web khulega, wahan attach kar dein.
      </p>
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
