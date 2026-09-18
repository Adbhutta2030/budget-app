import express from "express";
import cors from "cors";
import { pool, initSchema } from "./db.js";
import { requireAuth } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // vault documents are base64, so allow a bit of room

const ALLOWED_MIME = /^image\/(png|jpe?g|webp|gif)$|^application\/pdf$/;
const MAX_DATA_URL_LENGTH = 2_000_000; // roughly matches the old Firestore rule cap

// ---- Budget (transactions/bills/heads) ----

app.get("/api/budget", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT data FROM user_budgets WHERE uid = $1", [req.uid]);
  res.json(rows[0]?.data ?? {});
});

app.put("/api/budget", requireAuth, async (req, res) => {
  const data = req.body || {};
  await pool.query(
    `INSERT INTO user_budgets (uid, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (uid) DO UPDATE SET data = $2, updated_at = now()`,
    [req.uid, JSON.stringify(data)]
  );
  res.json({ ok: true });
});

// ---- Vault ----

app.get("/api/vault", requireAuth, async (req, res) => {
  const items = await pool.query(
    "SELECT id, category, title, mime_type AS \"mimeType\", data_url AS \"dataUrl\", created_at AS \"createdAt\" FROM vault_items WHERE uid = $1 ORDER BY created_at DESC",
    [req.uid]
  );
  const cats = await pool.query("SELECT list FROM vault_categories WHERE uid = $1", [req.uid]);
  res.json({ items: items.rows, categories: cats.rows[0]?.list ?? [] });
});

app.post("/api/vault", requireAuth, async (req, res) => {
  const { category, title, mimeType, dataUrl } = req.body || {};

  if (!category || !title || !mimeType || !dataUrl) {
    return res.status(400).json({ error: "Missing fields" });
  }
  if (!ALLOWED_MIME.test(mimeType)) {
    return res.status(400).json({ error: "Only image or PDF files are allowed" });
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return res.status(400).json({ error: "File too large" });
  }

  const { rows } = await pool.query(
    `INSERT INTO vault_items (uid, category, title, mime_type, data_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, category, title, mime_type AS "mimeType", data_url AS "dataUrl", created_at AS "createdAt"`,
    [req.uid, category, title, mimeType, dataUrl]
  );
  res.json(rows[0]);
});

app.delete("/api/vault/:id", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM vault_items WHERE id = $1 AND uid = $2", [req.params.id, req.uid]);
  res.json({ ok: true });
});

app.post("/api/vault/categories", requireAuth, async (req, res) => {
  const list = Array.isArray(req.body?.list) ? req.body.list : [];
  await pool.query(
    `INSERT INTO vault_categories (uid, list) VALUES ($1, $2)
     ON CONFLICT (uid) DO UPDATE SET list = $2`,
    [req.uid, JSON.stringify(list)]
  );
  res.json({ ok: true });
});

// ---- Ledger (udhar / lending-borrowing records) ----

app.get("/api/ledger", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, person, phone, direction, amount::float AS amount, date, note, created_at AS "createdAt"
     FROM ledger_entries WHERE uid = $1 ORDER BY date DESC`,
    [req.uid]
  );
  res.json(rows);
});

app.post("/api/ledger", requireAuth, async (req, res) => {
  const { person, phone, direction, amount, date, note } = req.body || {};
  if (!person || !direction || amount == null || !date) {
    return res.status(400).json({ error: "Missing fields" });
  }
  const { rows } = await pool.query(
    `INSERT INTO ledger_entries (uid, person, phone, direction, amount, date, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, person, phone, direction, amount::float AS amount, date, note, created_at AS "createdAt"`,
    [req.uid, person, phone || "", direction, amount, date, note || ""]
  );
  res.json(rows[0]);
});

app.put("/api/ledger/:id", requireAuth, async (req, res) => {
  const { person, phone, direction, amount, date, note } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE ledger_entries SET person = $1, phone = $2, direction = $3, amount = $4, date = $5, note = $6
     WHERE id = $7 AND uid = $8
     RETURNING id, person, phone, direction, amount::float AS amount, date, note, created_at AS "createdAt"`,
    [person, phone || "", direction, amount, date, note || "", req.params.id, req.uid]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

app.delete("/api/ledger/:id", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM ledger_entries WHERE id = $1 AND uid = $2", [req.params.id, req.uid]);
  res.json({ ok: true });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 8080;
initSchema()
  .then(() => app.listen(port, () => console.log(`Backend listening on ${port}`)))
  .catch((e) => {
    console.error("Failed to init schema:", e);
    process.exit(1);
  });
