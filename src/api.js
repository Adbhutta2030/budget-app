import { auth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL;

async function authedFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  const token = await user.getIdToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  getBudget: () => authedFetch("/api/budget"),
  saveBudget: (data) => authedFetch("/api/budget", { method: "PUT", body: JSON.stringify(data) }),

  getVault: () => authedFetch("/api/vault"),
  addVaultItem: (data) => authedFetch("/api/vault", { method: "POST", body: JSON.stringify(data) }),
  deleteVaultItem: (id) => authedFetch(`/api/vault/${id}`, { method: "DELETE" }),
  saveVaultCategories: (list) =>
    authedFetch("/api/vault/categories", { method: "POST", body: JSON.stringify({ list }) }),

  getLedger: () => authedFetch("/api/ledger"),
  addLedgerEntry: (data) => authedFetch("/api/ledger", { method: "POST", body: JSON.stringify(data) }),
  updateLedgerEntry: (id, data) => authedFetch(`/api/ledger/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLedgerEntry: (id) => authedFetch(`/api/ledger/${id}`, { method: "DELETE" }),
};
