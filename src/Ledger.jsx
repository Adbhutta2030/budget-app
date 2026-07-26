import { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy } from "firebase/firestore";
import { Plus, X, Trash2, Share2, Download, Users, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { jsPDF } from "jspdf";

const fmt = n => "Rs " + Math.round(n).toLocaleString();
const todayStr = () => new Date().toISOString().slice(0, 10);

function buildPeople(entries) {
  const map = {};
  entries.forEach(e => {
    if (!map[e.person]) map[e.person] = { name: e.person, gave: 0, took: 0, entries: [] };
    map[e.person][e.direction === "gave" ? "gave" : "took"] += e.amount;
    map[e.person].entries.push(e);
  });
  return Object.values(map).map(p => ({
    ...p,
    balance: p.gave - p.took,
    entries: p.entries.sort((a, b) => a.date.localeCompare(b.date)),
  })).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

function generateStatementPdf(personName, entries, balance) {
  const docPdf = new jsPDF();
  let y = 20;
  docPdf.setFontSize(16);
  docPdf.text("Hisaab / Statement", 14, y);
  y += 8;
  docPdf.setFontSize(11);
  docPdf.text(`Name: ${personName}`, 14, y);
  y += 6;
  docPdf.text(`Date: ${todayStr()}`, 14, y);
  y += 10;

  docPdf.setFontSize(10);
  docPdf.setFont(undefined, "bold");
  docPdf.text("Date", 14, y);
  docPdf.text("Detail", 44, y);
  docPdf.text("Diya", 130, y, { align: "right" });
  docPdf.text("Liya", 160, y, { align: "right" });
  docPdf.text("Balance", 195, y, { align: "right" });
  docPdf.setFont(undefined, "normal");
  y += 3;
  docPdf.line(14, y, 196, y);
  y += 6;

  let running = 0;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
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

  y += 6;
  docPdf.line(14, y, 196, y);
  y += 8;
  docPdf.setFontSize(12);
  docPdf.setFont(undefined, "bold");
  const summary = balance >= 0
    ? `${personName} ne aap ko ${fmt(Math.abs(balance))} dena hai`
    : `Aap ne ${personName} ko ${fmt(Math.abs(balance))} dena hai`;
  docPdf.text(summary, 14, y);

  return docPdf.output("blob");
}

async function shareStatement(personName, entries, balance) {
  const blob = generateStatementPdf(personName, entries, balance);
  const filename = `${personName.replace(/\s+/g, "_")}_hisaab.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${personName} - Hisaab`, text: `${personName} ka hisaab attached hai.` });
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
    ? `${personName} ne mera ${fmt(Math.abs(balance))} dena hai.`
    : `Mera ${personName} ka ${fmt(Math.abs(balance))} baqaya hai.`;
  const msg = encodeURIComponent(`${summary} PDF download ho gayi hai, WhatsApp chat mein attach kar dein.`);
  window.open(`https://wa.me/?text=${msg}`, "_blank");
}

export default function Ledger({ uid }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [openPerson, setOpenPerson] = useState(null);

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

  if (!loaded) {
    return <div className="w-full min-h-[300px] flex items-center justify-center text-sm text-stone-400">Loading khata...</div>;
  }

  const openPersonData = openPerson ? people.find(p => p.name === openPerson) : null;

  return (
    <div className="space-y-4 pb-24">
      <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-[#0a1628] flex items-center justify-center shrink-0">
          <Users size={16} className="text-[#d4af5f]" />
        </div>
        <p className="text-xs text-stone-500">
          Lena-dena ka hisaab yahan rakhein — har shaks ka khata alag se track hota hai.
        </p>
      </div>

      {people.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-8 text-center">
          <p className="text-sm text-stone-400">Koi khata nahi hai abhi. Neeche + button se add karein.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 p-2">
          {people.map(p => (
            <button key={p.name} onClick={() => setOpenPerson(p.name)}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-stone-50 text-left">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0" style={{ background: p.balance >= 0 ? "#3F8F6E" : "#B8555A" }}>
                  {p.name[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-stone-400">{p.entries.length} entries</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium tabular-nums ${p.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {fmt(Math.abs(p.balance))}
                </p>
                <p className="text-[10px] text-stone-400">{p.balance >= 0 ? "lena hai" : "dena hai"}</p>
              </div>
            </button>
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
          people={people.map(p => p.name)}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => { await addEntry(data); setShowAdd(false); }}
        />
      )}

      {openPersonData && (
        <PersonModal
          person={openPersonData}
          onClose={() => setOpenPerson(null)}
          onDelete={deleteEntry}
          onShare={() => shareStatement(openPersonData.name, openPersonData.entries, openPersonData.balance)}
        />
      )}
    </div>
  );
}

function AddLedgerModal({ people, onClose, onSave }) {
  const [person, setPerson] = useState("");
  const [direction, setDirection] = useState("gave");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!person.trim() || !amount || parseFloat(amount) <= 0) return;
    setBusy(true);
    try {
      await onSave({ person: person.trim(), direction, amount: parseFloat(amount), date, note: note.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Lena-dena add karein">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setDirection("gave")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium ${direction === "gave" ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-500"}`}>
          <ArrowUpRight size={14} /> Maine diya
        </button>
        <button onClick={() => setDirection("took")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium ${direction === "took" ? "bg-rose-600 text-white" : "bg-stone-100 text-stone-500"}`}>
          <ArrowDownLeft size={14} /> Maine liya
        </button>
      </div>
      <Field label="Kis ka naam?">
        <input type="text" list="ledger-people" value={person} onChange={e => setPerson(e.target.value)} placeholder="e.g. Ahmed"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
        <datalist id="ledger-people">
          {people.map(p => <option key={p} value={p} />)}
        </datalist>
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
        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Udhaar for shopping"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
      </Field>
      <button onClick={save} disabled={busy || !person.trim() || !amount}
        className="w-full bg-[#0a1628] text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
        {busy ? "Saving..." : "Save entry"}
      </button>
    </Modal>
  );
}

function PersonModal({ person, onClose, onDelete, onShare }) {
  return (
    <Modal onClose={onClose} title={person.name}>
      <div className={`rounded-xl p-3 mb-4 ${person.balance >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
        <p className="text-xs text-stone-500 mb-0.5">{person.balance >= 0 ? `${person.name} ne aap ko dena hai` : `Aap ne ${person.name} ko dena hai`}</p>
        <p className={`text-xl font-medium ${person.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmt(Math.abs(person.balance))}</p>
      </div>

      <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
        {person.entries.slice().reverse().map(e => (
          <div key={e.id} className="flex items-center justify-between text-sm border-b border-stone-100 pb-2">
            <div>
              <p className={e.direction === "gave" ? "text-emerald-700" : "text-rose-700"}>
                {e.direction === "gave" ? "Diya" : "Liya"} &middot; {fmt(e.amount)}
              </p>
              <p className="text-xs text-stone-400">{e.date}{e.note ? ` · ${e.note}` : ""}</p>
            </div>
            <button onClick={() => onDelete(e.id)} className="text-stone-300 hover:text-rose-500"><Trash2 size={14} /></button>
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
