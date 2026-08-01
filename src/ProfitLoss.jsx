import { useState, useMemo } from "react";
import { jsPDF } from "jspdf";
import { Share2 } from "lucide-react";

const fmt = n => "Rs " + Math.round(n).toLocaleString();

function periodLabel(granularity, value) {
  if (granularity === "monthly") {
    const [y, m] = value.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return value; // daily (YYYY-MM-DD) or yearly (YYYY) are already readable
}

function filterByPeriod(transactions, granularity, value) {
  if (granularity === "daily") return transactions.filter(t => t.date === value);
  if (granularity === "monthly") return transactions.filter(t => t.date.slice(0, 7) === value);
  return transactions.filter(t => t.date.slice(0, 4) === value);
}

function isInvestmentHead(category) {
  return (category || "").trim().toLowerCase() === "investment";
}

function aggregateByHead(transactions, type) {
  const totals = {};
  transactions.filter(t => t.type === type && !(type === "income" && isInvestmentHead(t.category))).forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function totalInvestment(transactions) {
  return transactions.filter(t => t.type === "income" && isInvestmentHead(t.category)).reduce((s, t) => s + t.amount, 0);
}

function generatePLPdf(label, incomeRows, expenseRows, totalIncome, totalExpense, netProfit, investment) {
  const docPdf = new jsPDF();
  let y = 20;
  docPdf.setFontSize(16);
  docPdf.text("Profit & Loss Statement", 14, y);
  y += 8;
  docPdf.setFontSize(11);
  docPdf.text(`Period: ${label}`, 14, y);
  y += 6;
  docPdf.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, 14, y);
  y += 10;

  docPdf.setFontSize(12);
  docPdf.setFont(undefined, "bold");
  docPdf.text("Income", 14, y);
  docPdf.setFont(undefined, "normal");
  y += 7;
  docPdf.setFontSize(10);
  if (incomeRows.length === 0) { docPdf.text("No income recorded.", 14, y); y += 6; }
  incomeRows.forEach(([head, amt]) => {
    if (y > 275) { docPdf.addPage(); y = 20; }
    docPdf.text(head, 14, y);
    docPdf.text(Math.round(amt).toLocaleString(), 195, y, { align: "right" });
    y += 6;
  });
  y += 2;
  docPdf.line(14, y, 196, y);
  y += 6;
  docPdf.setFont(undefined, "bold");
  docPdf.text("Total Income", 14, y);
  docPdf.text(Math.round(totalIncome).toLocaleString(), 195, y, { align: "right" });
  docPdf.setFont(undefined, "normal");
  y += 12;

  docPdf.setFontSize(12);
  docPdf.setFont(undefined, "bold");
  docPdf.text("Expenses", 14, y);
  docPdf.setFont(undefined, "normal");
  y += 7;
  docPdf.setFontSize(10);
  if (expenseRows.length === 0) { docPdf.text("No expenses recorded.", 14, y); y += 6; }
  expenseRows.forEach(([head, amt]) => {
    if (y > 275) { docPdf.addPage(); y = 20; }
    docPdf.text(head, 14, y);
    docPdf.text(Math.round(amt).toLocaleString(), 195, y, { align: "right" });
    y += 6;
  });
  y += 2;
  docPdf.line(14, y, 196, y);
  y += 6;
  docPdf.setFont(undefined, "bold");
  docPdf.text("Total Expenses", 14, y);
  docPdf.text(Math.round(totalExpense).toLocaleString(), 195, y, { align: "right" });
  docPdf.setFont(undefined, "normal");
  y += 12;

  docPdf.setFontSize(13);
  docPdf.setFont(undefined, "bold");
  const netLabel = netProfit >= 0 ? "Net Profit" : "Net Loss";
  docPdf.text(netLabel, 14, y);
  docPdf.text(Math.round(Math.abs(netProfit)).toLocaleString(), 195, y, { align: "right" });
  docPdf.setFont(undefined, "normal");
  y += 16;

  if (y > 260) { docPdf.addPage(); y = 20; }
  docPdf.setFontSize(14);
  docPdf.setFont(undefined, "bold");
  docPdf.text("Balance Sheet", 14, y);
  docPdf.setFont(undefined, "normal");
  y += 9;
  docPdf.setFontSize(10);
  docPdf.text(netLabel, 14, y);
  docPdf.text(Math.round(Math.abs(netProfit)).toLocaleString(), 195, y, { align: "right" });
  y += 6;
  docPdf.text("Investment", 14, y);
  docPdf.text(Math.round(investment).toLocaleString(), 195, y, { align: "right" });
  y += 2;
  y += 4;
  docPdf.line(14, y, 196, y);
  y += 6;
  docPdf.setFont(undefined, "bold");
  const capital = investment + netProfit;
  docPdf.text("Total Capital", 14, y);
  docPdf.text(Math.round(capital).toLocaleString(), 195, y, { align: "right" });

  return docPdf.output("blob");
}

async function sharePL(label, blob) {
  const filename = `Profit_Loss_${label.replace(/\s+/g, "_")}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Profit & Loss Statement", text: label }); return; } catch {}
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ProfitLoss({ transactions }) {
  const [granularity, setGranularity] = useState("monthly");
  const todayD = new Date();
  const [dayValue, setDayValue] = useState(todayD.toISOString().slice(0, 10));
  const [monthValue, setMonthValue] = useState(todayD.toISOString().slice(0, 7));
  const [yearValue, setYearValue] = useState(String(todayD.getFullYear()));

  const value = granularity === "daily" ? dayValue : granularity === "monthly" ? monthValue : yearValue;
  const label = periodLabel(granularity, value);

  const periodTx = useMemo(() => filterByPeriod(transactions, granularity, value), [transactions, granularity, value]);
  const incomeRows = useMemo(() => aggregateByHead(periodTx, "income"), [periodTx]);
  const expenseRows = useMemo(() => aggregateByHead(periodTx, "expense"), [periodTx]);
  const totalIncome = incomeRows.reduce((s, [, v]) => s + v, 0);
  const totalExpense = expenseRows.reduce((s, [, v]) => s + v, 0);
  const netProfit = totalIncome - totalExpense;
  const investment = useMemo(() => totalInvestment(periodTx), [periodTx]);
  const totalCapital = investment + netProfit;

  const download = () => {
    const blob = generatePLPdf(label, incomeRows, expenseRows, totalIncome, totalExpense, netProfit, investment);
    sharePL(label, blob);
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <h3 className="text-base font-bold text-stone-800 mb-3">Profit &amp; Loss statement</h3>

      <div className="flex gap-2 mb-3">
        {[{ id: "daily", label: "Daily" }, { id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" }].map(g => (
          <button key={g.id} onClick={() => setGranularity(g.id)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-semibold ${granularity === g.id ? "bg-[#0a1628] text-white" : "bg-stone-100 text-stone-500"}`}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        {granularity === "daily" && (
          <input type="date" value={dayValue} onChange={e => setDayValue(e.target.value)} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-base outline-none focus:border-stone-400" />
        )}
        {granularity === "monthly" && (
          <input type="month" value={monthValue} onChange={e => setMonthValue(e.target.value)} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-base outline-none focus:border-stone-400" />
        )}
        {granularity === "yearly" && (
          <select value={yearValue} onChange={e => setYearValue(e.target.value)} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-base outline-none focus:border-stone-400">
            {Array.from({ length: 6 }, (_, i) => String(todayD.getFullYear() - i)).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-emerald-700 font-medium">Income</p>
          <p className="text-base font-bold text-emerald-700 tabular-nums">{fmt(totalIncome)}</p>
        </div>
        <div className="bg-rose-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-rose-700 font-medium">Expenses</p>
          <p className="text-base font-bold text-rose-700 tabular-nums">{fmt(totalExpense)}</p>
        </div>
        <div className={`rounded-xl p-2.5 text-center ${netProfit >= 0 ? "bg-[#0a1628]" : "bg-rose-600"}`}>
          <p className="text-xs text-white/70 font-medium">{netProfit >= 0 ? "Net Profit" : "Net Loss"}</p>
          <p className="text-base font-bold text-white tabular-nums">{fmt(Math.abs(netProfit))}</p>
        </div>
      </div>

      {(incomeRows.length > 0 || expenseRows.length > 0) && (
        <div className="space-y-3 mb-4">
          {incomeRows.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-emerald-700 mb-1">Income by head</p>
              {incomeRows.map(([h, v]) => (
                <div key={h} className="flex justify-between text-sm py-0.5">
                  <span className="text-stone-600">{h}</span>
                  <span className="font-medium tabular-nums">{fmt(v)}</span>
                </div>
              ))}
            </div>
          )}
          {expenseRows.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-rose-700 mb-1">Expenses by head</p>
              {expenseRows.map(([h, v]) => (
                <div key={h} className="flex justify-between text-sm py-0.5">
                  <span className="text-stone-600">{h}</span>
                  <span className="font-medium tabular-nums">{fmt(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {investment > 0 && (
        <div className="border border-[#d4af5f]/30 bg-[#faf6ea] rounded-xl p-3.5 mb-4">
          <p className="text-sm font-bold text-[#0a1628] mb-2">Balance Sheet</p>
          <div className="flex justify-between text-sm py-0.5">
            <span className="text-stone-600">{netProfit >= 0 ? "Net Profit" : "Net Loss"}</span>
            <span className={`font-medium tabular-nums ${netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmt(Math.abs(netProfit))}</span>
          </div>
          <div className="flex justify-between text-sm py-0.5">
            <span className="text-stone-600">Investment</span>
            <span className="font-medium tabular-nums text-stone-700">{fmt(investment)}</span>
          </div>
          <div className="flex justify-between text-sm pt-1.5 mt-1.5 border-t border-[#d4af5f]/25">
            <span className="font-bold text-[#0a1628]">Total Capital</span>
            <span className="font-bold tabular-nums text-[#0a1628]">{fmt(totalCapital)}</span>
          </div>
        </div>
      )}

      <button onClick={download} className="w-full flex items-center justify-center gap-2 bg-[#0a1628] text-white py-2.5 rounded-lg text-base font-medium">
        <Share2 size={17} /> Download / Share statement
      </button>
    </div>
  );
}
