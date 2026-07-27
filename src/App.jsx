import { useState, useEffect, useRef } from "react";
import { Plus, TrendingUp, TrendingDown, Wallet, Calendar, BarChart3, X, Trash2, CheckCircle2, AlertCircle, Tag, Pencil, LogOut, Mic, Lock, Wrench, Bell, RotateCw, Users } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Login from "./Login";
import Vault from "./Vault";
import Ledger from "./Ledger";
import VoiceField, { MicButton, parseSpokenAmount } from "./VoiceField";
import MbtLogo from "./Logo";

const PALETTE = ["#D97748","#4A7C8C","#8B5FA3","#C9A227","#B8555A","#3F8F6E","#5B6FBE","#BF7E3D","#7C7C74","#6B9B7A","#A2588F","#4F8FBE"];
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

const STORAGE_KEY = "budget-tracker-data-v2";
const todayStr = () => new Date().toISOString().slice(0,10);
const fmt = n => "Rs " + Math.round(n).toLocaleString();
const monthLabel = d => new Date(d+"-01").toLocaleDateString("en-US",{month:"short", year:"2-digit"});

const DEFAULT_INCOME_HEADS = ["Salary", "Freelance", "Business", "Gift", "Other income"];
const DEFAULT_EXPENSE_HEADS = ["Food", "Transport", "Rent", "Utilities", "Shopping", "Health", "Education", "Entertainment", "Other expense"];

function parseVoiceEntry(text, incomeHeads, expenseHeads) {
  const lower = text.toLowerCase();

  // extract amount (handles "1000", "1,000", "5 hazar", "2 lakh")
  const numMatch = lower.match(/\d[\d,]*(\.\d+)?/);
  let amount = numMatch ? parseFloat(numMatch[0].replace(/,/g, "")) : null;
  if (amount != null) {
    if (/(hazar|hazaar|thousand)/.test(lower) && amount < 1000) amount *= 1000;
    else if (/(lakh|lac)/.test(lower) && amount < 1000) amount *= 100000;
  }

  const incomeKeywords = ["income", "salary", "tankhwah", "amdani", "mila", "mili", "kamaya", "kamayi", "received"];
  let type = incomeKeywords.some(k => lower.includes(k)) ? "income" : "expense";

  const findHead = (heads) => heads.find(h => lower.includes(h.toLowerCase())) || null;
  let category = findHead(type === "income" ? incomeHeads : expenseHeads);

  if (!category) {
    const otherType = type === "income" ? "expense" : "income";
    const otherMatch = findHead(otherType === "income" ? incomeHeads : expenseHeads);
    if (otherMatch) { type = otherType; category = otherMatch; }
  }

  if (!category) {
    const list = type === "income" ? incomeHeads : expenseHeads;
    category = list[list.length - 1] || list[0] || "";
  }

  return { type, category, amount };
}

const seedTransactions = [
  { id: 1, type: "income", category: "Salary", amount: 120000, date: "2026-07-01", note: "Monthly salary" },
  { id: 2, type: "expense", category: "Rent", amount: 35000, date: "2026-07-02", note: "House rent" },
  { id: 3, type: "expense", category: "Food", amount: 12500, date: "2026-07-10", note: "Groceries" },
  { id: 4, type: "expense", category: "Utilities", amount: 8200, date: "2026-07-12", note: "Electricity + gas" },
  { id: 5, type: "expense", category: "Transport", amount: 6000, date: "2026-07-15", note: "Fuel" },
  { id: 6, type: "income", category: "Freelance", amount: 25000, date: "2026-06-20", note: "Side project" },
  { id: 7, type: "expense", category: "Shopping", amount: 9000, date: "2026-06-18", note: "Clothes" },
  { id: 8, type: "expense", category: "Rent", amount: 35000, date: "2026-06-02", note: "House rent" },
];
const seedBills = [
  { id: 1, type: "bill", title: "Internet bill", amount: 3500, dueDate: "2026-07-28", paid: false, recurring: null },
  { id: 2, type: "bill", title: "Credit card payment", amount: 15000, dueDate: "2026-07-25", paid: false, recurring: null },
  { id: 3, type: "bill", title: "Electricity bill", amount: 8200, dueDate: "2026-08-05", paid: false, recurring: null },
  { id: 4, type: "bill", title: "Mobile bill", amount: 1500, dueDate: "2026-07-15", paid: true, recurring: null },
];

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  if (!authChecked) {
    return <div className="w-full min-h-screen flex items-center justify-center text-sm text-stone-400">Loading...</div>;
  }
  if (!user) {
    return <Login />;
  }
  return <BudgetTracker uid={user.uid} userEmail={user.email} />;
}

function BudgetTracker({ uid, userEmail }) {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [bills, setBills] = useState([]);
  const [incomeHeads, setIncomeHeads] = useState([]);
  const [expenseHeads, setExpenseHeads] = useState([]);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showHeadModal, setShowHeadModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [txType, setTxType] = useState("expense");

  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, "budgets", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setTransactions(data.transactions || seedTransactions);
          setBills(data.bills || seedBills);
          setIncomeHeads(data.incomeHeads || DEFAULT_INCOME_HEADS);
          setExpenseHeads(data.expenseHeads || DEFAULT_EXPENSE_HEADS);
        } else {
          setTransactions(seedTransactions);
          setBills(seedBills);
          setIncomeHeads(DEFAULT_INCOME_HEADS);
          setExpenseHeads(DEFAULT_EXPENSE_HEADS);
        }
      } catch (e) {
        console.error("Failed to load budget data:", e);
        setTransactions(seedTransactions);
        setBills(seedBills);
        setIncomeHeads(DEFAULT_INCOME_HEADS);
        setExpenseHeads(DEFAULT_EXPENSE_HEADS);
      }
      setLoaded(true);
    })();
  }, [uid]);

  useEffect(() => {
    if (!loaded) return;
    const ref = doc(db, "budgets", uid);
    setDoc(ref, { transactions, bills, incomeHeads, expenseHeads, updatedAt: new Date().toISOString() })
      .catch(e => console.error("Failed to save budget data:", e));
  }, [transactions, bills, incomeHeads, expenseHeads, loaded, uid]);

  // Show a browser notification (if permitted) for anything due within 3 days or overdue.
  useEffect(() => {
    if (!loaded) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const due = bills.filter(b => !b.paid && daysUntil(b.dueDate) <= 3);
    if (due.length === 0) return;
    const alreadyShown = sessionStorage.getItem("reminders-shown-" + todayStr());
    if (alreadyShown) return;
    due.slice(0, 4).forEach(b => {
      const days = daysUntil(b.dueDate);
      const label = b.type === "maintenance" ? "Maintenance reminder" : "Payment due";
      const when = days < 0 ? `${Math.abs(days)} din pehle se due tha` : days === 0 ? "Aaj due hai" : `${days} din mein due hai`;
      try { new Notification(`${label}: ${b.title}`, { body: when }); } catch {}
    });
    sessionStorage.setItem("reminders-shown-" + todayStr(), "1");
  }, [bills, loaded]);

  const addTransaction = (tx) => setTransactions(prev => [{ ...tx, id: Date.now() }, ...prev]);
  const deleteTransaction = (id) => setTransactions(prev => prev.filter(t => t.id !== id));
  const addBill = (b) => setBills(prev => [{ ...b, id: Date.now(), paid: false }, ...prev]);
  const toggleBillPaid = (id) => setBills(prev => prev.map(b => {
    if (b.id !== id) return b;
    if (b.recurDay) {
      // Monthly bill tied to a day-of-month: roll forward to next month, same day
      return { ...b, dueDate: advanceOneMonth(b.dueDate, b.recurDay), lastDone: todayStr(), paid: false };
    }
    if (b.type === "maintenance" && b.recurring) {
      // Recurring maintenance: rolling it forward instead of marking permanently done
      const next = new Date(todayStr());
      next.setDate(next.getDate() + Number(b.recurring));
      return { ...b, dueDate: next.toISOString().slice(0, 10), lastDone: todayStr(), paid: false };
    }
    return { ...b, paid: !b.paid };
  }));
  const deleteBill = (id) => setBills(prev => prev.filter(b => b.id !== id));

  const addHead = (type, name) => {
    if (type === "income") setIncomeHeads(prev => prev.includes(name) ? prev : [...prev, name]);
    else setExpenseHeads(prev => prev.includes(name) ? prev : [...prev, name]);
  };
  const renameHead = (type, oldName, newName) => {
    if (type === "income") setIncomeHeads(prev => prev.map(h => h === oldName ? newName : h));
    else setExpenseHeads(prev => prev.map(h => h === oldName ? newName : h));
    setTransactions(prev => prev.map(t => t.category === oldName && t.type === type ? { ...t, category: newName } : t));
  };
  const deleteHead = (type, name) => {
    const inUse = transactions.some(t => t.type === type && t.category === name);
    if (inUse) { alert("Ye head kuch transactions mein use ho rahi hai — pehle unhe delete ya category change karein."); return; }
    if (type === "income") setIncomeHeads(prev => prev.filter(h => h !== name));
    else setExpenseHeads(prev => prev.filter(h => h !== name));
  };

  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const thisMonth = todayStr().slice(0,7);
  const thisMonthTx = transactions.filter(t => t.date.slice(0,7) === thisMonth);
  const monthIncome = thisMonthTx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const monthExpense = thisMonthTx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);

  if (!loaded) {
    return <div className="w-full min-h-[400px] flex items-center justify-center text-sm text-gray-400">Loading your budget...</div>;
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-stone-50 min-h-screen font-sans text-stone-900">
      <Header onOpenHeads={() => setShowHeadModal(true)} userEmail={userEmail} />
      <TabBar tab={tab} setTab={setTab} />

      <div className="px-4 pb-28 pt-4">
        {tab === "dashboard" && (
          <Dashboard balance={balance} monthIncome={monthIncome} monthExpense={monthExpense} transactions={transactions} bills={bills} />
        )}
        {tab === "transactions" && (
          <Transactions transactions={transactions} onDelete={deleteTransaction} />
        )}
        {tab === "bills" && (
          <Bills bills={bills} onToggle={toggleBillPaid} onDelete={deleteBill} />
        )}
        {tab === "compare" && (
          <Compare transactions={transactions} />
        )}
        {tab === "vault" && (
          <Vault uid={uid} />
        )}
        {tab === "ledger" && (
          <Ledger uid={uid} />
        )}
      </div>

      {tab !== "vault" && tab !== "ledger" && (
        <div className="fixed bottom-5 right-1/2 translate-x-[calc(50%+0px)] max-w-2xl w-full px-4 pointer-events-none" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="flex justify-end items-center gap-2 pointer-events-auto">
            {tab !== "bills" && (
              <button onClick={() => setShowVoiceModal(true)} aria-label="Bol kar entry karein"
                className="flex items-center justify-center w-12 h-12 bg-rose-600 text-white rounded-full shadow-lg shrink-0">
                <Mic size={20}/>
              </button>
            )}
            {tab === "bills" ? (
              <button onClick={() => setShowBillModal(true)} className="flex items-center gap-2 bg-stone-900 text-white px-5 py-3 rounded-full shadow-lg text-sm font-medium">
                <Plus size={18}/> Add bill
              </button>
            ) : (
              <button onClick={() => setShowTxModal(true)} className="flex items-center gap-2 bg-stone-900 text-white px-5 py-3 rounded-full shadow-lg text-sm font-medium">
                <Plus size={18}/> Add entry
              </button>
            )}
          </div>
        </div>
      )}

      {showTxModal && (
        <TxModal
          type={txType} setType={setTxType}
          incomeHeads={incomeHeads} expenseHeads={expenseHeads}
          onManageHeads={() => { setShowTxModal(false); setShowHeadModal(true); }}
          onClose={() => setShowTxModal(false)}
          onSave={(tx) => { addTransaction(tx); setShowTxModal(false); }}
        />
      )}
      {showBillModal && (
        <BillModal onClose={() => setShowBillModal(false)} onSave={(b) => { addBill(b); setShowBillModal(false); }} />
      )}
      {showHeadModal && (
        <HeadsModal
          incomeHeads={incomeHeads} expenseHeads={expenseHeads}
          onAdd={addHead} onRename={renameHead} onDelete={deleteHead}
          onClose={() => setShowHeadModal(false)}
        />
      )}
      {showVoiceModal && (
        <VoiceModal
          incomeHeads={incomeHeads} expenseHeads={expenseHeads}
          onClose={() => setShowVoiceModal(false)}
          onSave={(tx) => { addTransaction(tx); setShowVoiceModal(false); }}
        />
      )}
    </div>
  );
}

function Header({ onOpenHeads, userEmail }) {
  return (
    <div className="bg-gradient-to-r from-[#0a1628] to-[#0f2140] text-white px-4 sm:px-5 pt-5 pb-5 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <div className="absolute inset-0 bg-[#d4af5f]/20 blur-lg rounded-full"></div>
          <MbtLogo size={38} className="relative sm:w-10 sm:h-10" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[#8fa5c4] text-[10px] sm:text-xs font-medium tracking-wide uppercase">
            <Wallet size={12}/> Personal budget
          </div>
          <h1 className="text-lg sm:text-xl font-medium truncate">My finances</h1>
          {userEmail && <p className="text-[11px] text-[#5c7398] truncate">{userEmail}</p>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 mt-1 shrink-0">
        <button onClick={onOpenHeads} className="flex items-center gap-1.5 text-[#8fa5c4] text-xs border border-[#d4af5f]/25 rounded-full px-2.5 sm:px-3 py-1.5 hover:text-[#d4af5f] hover:border-[#d4af5f]/60 whitespace-nowrap">
          <Tag size={13}/> Heads
        </button>
        <button onClick={() => signOut(auth)} className="flex items-center gap-1.5 text-[#5c7398] text-xs hover:text-[#d4af5f] whitespace-nowrap">
          <LogOut size={12}/> Log out
        </button>
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { id: "dashboard", label: "Overview", icon: BarChart3 },
    { id: "transactions", label: "Transactions", icon: Wallet },
    { id: "bills", label: "Deadlines", icon: Calendar },
    { id: "compare", label: "Compare", icon: TrendingUp },
    { id: "vault", label: "Documents", icon: Lock },
    { id: "ledger", label: "Accounts", icon: Users },
  ];
  return (
    <div className="grid grid-cols-6 bg-white border-b border-stone-200 sticky top-0 z-10">
      {tabs.map(t => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[10px] sm:text-xs font-medium border-b-2 transition-colors ${active ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400"}`}>
            <Icon size={15} className="sm:hidden" />
            <Icon size={16} className="hidden sm:block" />
            <span className="truncate w-full text-center leading-tight">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Dashboard({ balance, monthIncome, monthExpense, transactions, bills }) {
  const upcoming = bills.filter(b => !b.paid).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0,3);
  const recent = transactions.slice(0,4);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <p className="text-xs text-stone-400 mb-1">Total balance</p>
        <p className="text-3xl font-medium tabular-nums">{fmt(balance)}</p>
        <div className="flex gap-4 mt-4 pt-4 border-t border-stone-100">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium mb-1"><TrendingUp size={14}/> Income (this month)</div>
            <p className="text-lg font-medium tabular-nums">{fmt(monthIncome)}</p>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-rose-700 text-xs font-medium mb-1"><TrendingDown size={14}/> Expenses (this month)</div>
            <p className="text-lg font-medium tabular-nums">{fmt(monthExpense)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Upcoming deadlines</p>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-stone-400">No pending bills. You're all caught up.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map(b => <BillRow key={b.id} bill={b} compact />)}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <p className="text-sm font-medium mb-3">Recent activity</p>
        <div className="divide-y divide-stone-100">
          {recent.map(t => <TxRow key={t.id} tx={t} />)}
        </div>
      </div>
    </div>
  );
}

function daysUntil(dateStr) {
  const diff = (new Date(dateStr) - new Date(todayStr())) / (1000*60*60*24);
  return Math.round(diff);
}

const RECURRING_LABELS = { 30: "monthly", 90: "every 3 months", 180: "every 6 months", 365: "yearly" };

function BillRow({ bill, onToggle, onDelete, compact }) {
  const days = daysUntil(bill.dueDate);
  const overdue = !bill.paid && days < 0;
  const soon = !bill.paid && days >= 0 && days <= 3;
  const isMaintenance = bill.type === "maintenance";
  const isRecurring = bill.recurDay || (isMaintenance && bill.recurring);
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {!compact && (
          isRecurring ? (
            <button onClick={() => onToggle(bill.id)} title="Mark done — repeats automatically" className="text-stone-300 hover:text-emerald-600">
              <RotateCw size={18}/>
            </button>
          ) : (
            <button onClick={() => onToggle(bill.id)} className={bill.paid ? "text-emerald-600" : "text-stone-300"}>
              <CheckCircle2 size={20}/>
            </button>
          )
        )}
        <div>
          <div className="flex items-center gap-1.5">
            {isMaintenance && <Wrench size={12} className="text-stone-400 shrink-0" />}
            <p className={`text-sm font-medium ${bill.paid ? "line-through text-stone-400" : ""}`}>{bill.title}</p>
          </div>
          <p className="text-xs text-stone-400">
            {bill.amount > 0 ? `${fmt(bill.amount)} · ` : ""}due {bill.dueDate}
            {isMaintenance && bill.recurring && ` · ${RECURRING_LABELS[bill.recurring] || `every ${bill.recurring}d`}`}
            {bill.recurDay && ` · har mahine ${bill.recurDay} tareekh`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!bill.paid && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${overdue ? "bg-rose-50 text-rose-700" : soon ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-stone-500"}`}>
            {overdue && <AlertCircle size={12}/>}
            {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
          </span>
        )}
        {!compact && onDelete && (
          <button onClick={() => onDelete(bill.id)} className="text-stone-300 hover:text-rose-500"><Trash2 size={15}/></button>
        )}
      </div>
    </div>
  );
}

function TxRow({ tx, onDelete }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium" style={{ background: colorFor(tx.category) }}>
          {tx.category[0]}
        </div>
        <div>
          <p className="text-sm font-medium">{tx.category}</p>
          <p className="text-xs text-stone-400">{tx.note || "—"} &middot; {tx.date}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-medium tabular-nums ${tx.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
          {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}
        </p>
        {onDelete && <button onClick={() => onDelete(tx.id)} className="text-stone-300 hover:text-rose-500"><Trash2 size={14}/></button>}
      </div>
    </div>
  );
}

function Transactions({ transactions, onDelete }) {
  const [filter, setFilter] = useState("all");
  const filtered = transactions.filter(t => filter === "all" || t.type === filter);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["all","income","expense"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${filter===f ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-500"}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        {filtered.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-6">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {filtered.map(t => <TxRow key={t.id} tx={t} onDelete={onDelete} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Bills({ bills, onToggle, onDelete }) {
  const sorted = [...bills].sort((a,b) => (a.paid - b.paid) || a.dueDate.localeCompare(b.dueDate));
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  return (
    <div className="space-y-3">
      {permission === "default" && (
        <button onClick={enableNotifications}
          className="w-full flex items-center gap-2 bg-white border border-stone-200 rounded-2xl p-3.5 text-left hover:border-stone-300">
          <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <Bell size={15} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-stone-700">Reminders ke notifications on karein</p>
            <p className="text-[11px] text-stone-400">Jab bill ya maintenance due ho to alert milega</p>
          </div>
        </button>
      )}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        {sorted.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-6">No bills added yet.</p>
        ) : (
          <div className="space-y-4">
            {sorted.map(b => <BillRow key={b.id} bill={b} onToggle={onToggle} onDelete={onDelete} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Compare({ transactions }) {
  const months = {};
  transactions.forEach(t => {
    const m = t.date.slice(0,7);
    if (!months[m]) months[m] = { month: m, income: 0, expense: 0 };
    months[m][t.type] += t.amount;
  });
  const monthData = Object.values(months).sort((a,b) => a.month.localeCompare(b.month)).slice(-6)
    .map(m => ({ ...m, label: monthLabel(m.month) }));

  const thisMonth = todayStr().slice(0,7);
  const catTotals = {};
  transactions.filter(t => t.type === "expense" && t.date.slice(0,7) === thisMonth).forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
  });
  const pieData = Object.entries(catTotals).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <p className="text-sm font-medium mb-4">Income vs expenses by month</p>
        {monthData.length === 0 ? <p className="text-sm text-stone-400">Add transactions to see comparisons.</p> : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEEEEC" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#8B9195" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#8B9195" }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v/1000)}k`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E3E4E0" }} />
                <Bar dataKey="income" fill="#3F8F6E" radius={[4,4,0,0]} name="Income" />
                <Bar dataKey="expense" fill="#B8555A" radius={[4,4,0,0]} name="Expense" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <p className="text-sm font-medium mb-4">This month's spending by head</p>
        {pieData.length === 0 ? <p className="text-sm text-stone-400">No expenses recorded this month yet.</p> : (
          <div className="flex items-center gap-4">
            <div style={{ width: 140, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {pieData.map((d,i) => <Cell key={i} fill={colorFor(d.name)} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E3E4E0" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {pieData.sort((a,b)=>b.value-a.value).map((d,i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: colorFor(d.name) }}></span>{d.name}</span>
                  <span className="font-medium tabular-nums">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TxModal({ type, setType, incomeHeads, expenseHeads, onManageHeads, onClose, onSave }) {
  const heads = type === "income" ? incomeHeads : expenseHeads;
  const [category, setCategory] = useState(heads[0] || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");

  const handleType = (t) => {
    setType(t);
    const list = t === "income" ? incomeHeads : expenseHeads;
    setCategory(list[0] || "");
  };

  return (
    <Modal onClose={onClose} title="Add entry">
      <div className="flex gap-2 mb-4">
        {["expense","income"].map(t => (
          <button key={t} onClick={() => handleType(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${type===t ? (t==="income" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "bg-stone-100 text-stone-500"}`}>
            {t}
          </button>
        ))}
      </div>
      <Field label="Amount">
        <div className="relative">
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" className="w-full border border-stone-200 rounded-lg pl-3 pr-11 py-2 text-sm outline-none focus:border-stone-400" />
          <MicButton
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center bg-stone-100 text-stone-500"
            onResult={(text) => { const amt = parseSpokenAmount(text); if (amt != null) setAmount(String(amt)); }}
          />
        </div>
      </Field>
      <Field label={type === "income" ? "Income head" : "Expense head"}>
        {heads.length === 0 ? (
          <button onClick={onManageHeads} className="w-full border border-dashed border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-500">
            Koi head nahi hai — pehle ek banayein
          </button>
        ) : (
          <div className="flex gap-2">
            <select value={category} onChange={e=>setCategory(e.target.value)} className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400">
              {heads.map(c => <option key={c}>{c}</option>)}
            </select>
            <MicButton
              onResult={(text) => {
                const match = heads.find(h => text.toLowerCase().includes(h.toLowerCase()));
                if (match) setCategory(match);
              }}
            />
          </div>
        )}
        <button onClick={onManageHeads} className="text-xs text-stone-500 underline mt-1.5">Manage heads</button>
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
      </Field>
      <Field label="Note (optional)">
        <VoiceField value={note} onChange={setNote} placeholder="e.g. Grocery shopping" />
      </Field>
      <button
        onClick={() => { if(!amount || parseFloat(amount)<=0 || !category) return; onSave({ type, category, amount: parseFloat(amount), date, note }); }}
        className="w-full bg-stone-900 text-white py-2.5 rounded-lg text-sm font-medium mt-2">
        Save entry
      </button>
    </Modal>
  );
}

function VoiceModal({ incomeHeads, expenseHeads, onClose, onSave }) {
  const [status, setStatus] = useState("listening"); // listening | reviewing | error | unsupported
  const [transcript, setTranscript] = useState("");
  const [lang, setLang] = useState("en-US");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const recRef = useRef(null);

  const finalizeTranscript = (text) => {
    const parsed = parseVoiceEntry(text, incomeHeads, expenseHeads);
    setType(parsed.type);
    setCategory(parsed.category);
    setAmount(parsed.amount != null ? String(parsed.amount) : "");
    setStatus("reviewing");
  };

  const startListening = (useLang) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatus("unsupported"); return; }
    const activeLang = useLang || lang;
    setLang(activeLang);
    setStatus("listening");
    setTranscript("");
    try {
      const rec = new SR();
      rec.lang = activeLang;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
        text = text.trim();
        setTranscript(text);
        if (e.results[e.results.length - 1].isFinal) {
          rec.stop();
          finalizeTranscript(text);
        }
      };
      rec.onerror = () => setStatus("error");
      rec.onend = () => setStatus(s => (s === "listening" ? "error" : s));
      recRef.current = rec;
      rec.start();
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    startListening("en-US");
    return () => { try { recRef.current?.stop(); } catch {} };
  }, []);

  const heads = type === "income" ? incomeHeads : expenseHeads;

  return (
    <Modal onClose={onClose} title="Add entry by voice">
      {status === "unsupported" && (
        <p className="text-sm text-stone-500">
          Ye feature is browser mein support nahi hai. Chrome browser (Android ya Desktop) try karein.
        </p>
      )}

      {status === "listening" && (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-3 animate-pulse">
            <Mic size={26} className="text-rose-600" />
          </div>
          <p className="text-sm text-stone-600 mb-1">Sun raha hoon... bolein</p>
          <p className="text-xs text-stone-400 mb-4">masalan: "1000 rupees food"</p>
          {transcript && (
            <p className="text-sm text-stone-800 bg-stone-100 rounded-lg px-3 py-2 w-full">{transcript}</p>
          )}
          <button
            onClick={() => startListening(lang === "en-US" ? "ur-PK" : "en-US")}
            className="text-xs text-stone-500 underline mt-4">
            {lang === "en-US" ? "Urdu mein try karein" : "English mein try karein"}
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="text-center py-4">
          <p className="text-sm text-stone-500 mb-3">Awaaz samajh nahi aayi. Dobara koshish karein.</p>
          <button onClick={() => startListening()} className="bg-stone-900 text-white text-sm px-4 py-2 rounded-lg">
            Dobara bolein
          </button>
        </div>
      )}

      {status === "reviewing" && (
        <div>
          <p className="text-xs text-stone-400 mb-3">Aap ne kaha: <span className="italic">"{transcript}"</span></p>
          <div className="flex gap-2 mb-4">
            {["expense", "income"].map(t => (
              <button key={t}
                onClick={() => { setType(t); const list = t === "income" ? incomeHeads : expenseHeads; setCategory(list[0] || ""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${type === t ? (t === "income" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "bg-stone-100 text-stone-500"}`}>
                {t}
              </button>
            ))}
          </div>
          <Field label="Amount">
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
          </Field>
          <Field label={type === "income" ? "Income head" : "Expense head"}>
            {heads.length === 0 ? (
              <p className="text-sm text-stone-400">Pehle koi head banayein.</p>
            ) : (
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400">
                {heads.map(c => <option key={c}>{c}</option>)}
              </select>
            )}
          </Field>
          <div className="flex gap-2 mt-2">
            <button onClick={() => startListening()} className="flex-1 bg-stone-100 text-stone-600 py-2.5 rounded-lg text-sm font-medium">
              Dobara bolein
            </button>
            <button
              onClick={() => { if (!amount || parseFloat(amount) <= 0 || !category) return; onSave({ type, category, amount: parseFloat(amount), date: todayStr(), note: transcript }); }}
              className="flex-1 bg-stone-900 text-white py-2.5 rounded-lg text-sm font-medium">
              Save entry
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const MAINTENANCE_PRESETS = ["Engine oil change", "Car service", "Tyre change", "Insurance renewal", "Filter change", "Custom"];
const RECURRING_OPTIONS = [
  { label: "Never (one-time)", value: "" },
  { label: "Every month", value: 30 },
  { label: "Every 3 months", value: 90 },
  { label: "Every 6 months", value: 180 },
  { label: "Every year", value: 365 },
];

// Given a day-of-month (1-31), compute the due date for the current billing cycle:
// this month if the day hasn't passed yet, otherwise next month. Clamps to the
// last day of the month for months that are shorter than the chosen day.
function computeMonthlyDueDate(day) {
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  if (day < now.getDate()) { m += 1; if (m > 11) { m = 0; y += 1; } }
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, lastDay)).toISOString().slice(0, 10);
}

// Advance an existing monthly due date forward by exactly one month, keeping the
// same day-of-month (clamped for shorter months).
function advanceOneMonth(dateStr, day) {
  const d = new Date(dateStr);
  let y = d.getFullYear(), m = d.getMonth() + 1;
  if (m > 11) { m = 0; y += 1; }
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, lastDay)).toISOString().slice(0, 10);
}

function BillModal({ onClose, onSave }) {
  const [type, setType] = useState("bill");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dateMode, setDateMode] = useState("specific"); // 'specific' | 'monthly'
  const [dueDate, setDueDate] = useState(todayStr());
  const [recurDay, setRecurDay] = useState(new Date().getDate());
  const [recurring, setRecurring] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    if (type === "bill" && (!amount || parseFloat(amount) <= 0)) return;
    const finalDueDate = type === "bill" && dateMode === "monthly" ? computeMonthlyDueDate(Number(recurDay)) : dueDate;
    onSave({
      type,
      title: title.trim(),
      amount: amount ? parseFloat(amount) : 0,
      dueDate: finalDueDate,
      recurDay: type === "bill" && dateMode === "monthly" ? Number(recurDay) : null,
      recurring: type === "maintenance" && recurring ? Number(recurring) : null,
    });
  };

  return (
    <Modal onClose={onClose} title={type === "maintenance" ? "Add maintenance reminder" : "Add payment deadline"}>
      <div className="flex gap-2 mb-4">
        {[{ id: "bill", label: "Bill payment" }, { id: "maintenance", label: "Maintenance" }].map(t => (
          <button key={t.id} onClick={() => { setType(t.id); setTitle(""); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${type === t.id ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {type === "maintenance" ? (
        <Field label="What needs attention?">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {MAINTENANCE_PRESETS.map(p => (
              <button key={p} onClick={() => setTitle(p === "Custom" ? "" : p)}
                className={`text-xs px-2.5 py-1.5 rounded-full border ${title === p ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-200 text-stone-600"}`}>
                {p}
              </button>
            ))}
          </div>
          <VoiceField value={title} onChange={setTitle} placeholder="e.g. Engine oil change" />
        </Field>
      ) : (
        <Field label="Bill title">
          <VoiceField value={title} onChange={setTitle} placeholder="e.g. Internet bill" />
        </Field>
      )}

      <Field label={type === "maintenance" ? "Amount (optional)" : "Amount"}>
        <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
      </Field>

      {type === "bill" && (
        <Field label="Due date">
          <div className="flex gap-2 mb-2">
            <button onClick={() => setDateMode("specific")} type="button"
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${dateMode === "specific" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>
              Specific date
            </button>
            <button onClick={() => setDateMode("monthly")} type="button"
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${dateMode === "monthly" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>
              Har mahine is date par
            </button>
          </div>
          {dateMode === "specific" ? (
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
          ) : (
            <div>
              <select value={recurDay} onChange={e => setRecurDay(e.target.value)}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400">
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d} tareekh</option>)}
              </select>
              <p className="text-[11px] text-stone-400 mt-1.5">Har mahine is din reminder khud ban jayega — is cycle ke liye due date: {computeMonthlyDueDate(Number(recurDay))}</p>
            </div>
          )}
        </Field>
      )}

      {type === "maintenance" && (
        <>
          <Field label="Due date">
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
          </Field>
          <Field label="Repeat">
            <select value={recurring} onChange={e => setRecurring(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400">
              {RECURRING_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </>
      )}
      <button
        onClick={submit}
        className="w-full bg-stone-900 text-white py-2.5 rounded-lg text-sm font-medium mt-2">
        {type === "maintenance" ? "Add reminder" : "Add deadline"}
      </button>
    </Modal>
  );
}

function HeadsModal({ incomeHeads, expenseHeads, onAdd, onRename, onDelete, onClose }) {
  const [tab, setTab] = useState("expense");
  const [newHead, setNewHead] = useState("");
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const heads = tab === "income" ? incomeHeads : expenseHeads;

  const submitNew = () => {
    const name = newHead.trim();
    if (!name) return;
    onAdd(tab, name);
    setNewHead("");
  };

  return (
    <Modal onClose={onClose} title="Manage income and expense heads">
      <div className="flex gap-2 mb-4">
        {["expense","income"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${tab===t ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>
            {t} heads
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <input type="text" value={newHead} onChange={e=>setNewHead(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submitNew(); }}
          placeholder={tab === "income" ? "e.g. Rental income" : "e.g. Fuel"}
          className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400" />
        <button onClick={submitNew} className="bg-stone-900 text-white px-3 rounded-lg"><Plus size={16}/></button>
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {heads.length === 0 && <p className="text-sm text-stone-400 text-center py-4">Koi head nahi hai. Upar se ek add karein.</p>}
        {heads.map(h => (
          <div key={h} className="flex items-center justify-between border border-stone-100 rounded-lg px-3 py-2">
            {editing === h ? (
              <input autoFocus value={editValue} onChange={e=>setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && editValue.trim()) { onRename(tab, h, editValue.trim()); setEditing(null); } }}
                className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm outline-none mr-2" />
            ) : (
              <span className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorFor(h) }}></span>{h}
              </span>
            )}
            <div className="flex items-center gap-1">
              {editing === h ? (
                <button onClick={() => { if(editValue.trim()){ onRename(tab, h, editValue.trim()); } setEditing(null); }} className="text-emerald-600 text-xs font-medium px-2">Save</button>
              ) : (
                <button onClick={() => { setEditing(h); setEditValue(h); }} className="text-stone-400 hover:text-stone-700"><Pencil size={14}/></button>
              )}
              <button onClick={() => onDelete(tab, h)} className="text-stone-400 hover:text-rose-500"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
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
          <p className="text-base font-medium">{title}</p>
          <button onClick={onClose} className="text-stone-400"><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}
