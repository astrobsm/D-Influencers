const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const db = require("./db");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

const appRoot = path.resolve(__dirname, "..");
app.use(express.static(appRoot));

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true, service: "dinfluencers-api", db: "connected" });
  } catch (error) {
    res.json({
      ok: true,
      service: "dinfluencers-api",
      db: "disconnected",
      dbError: error.message,
    });
  }
});

app.get("/api/dashboard", async (_req, res) => {
  try {
    const [prospects, converted, team, commissions, followups] = await Promise.all([
      db.query("SELECT COUNT(*)::int AS count FROM prospects"),
      db.query("SELECT COUNT(*)::int AS count FROM prospects WHERE status = 'converted'"),
      db.query("SELECT COUNT(*)::int AS count FROM team_members"),
      db.query("SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM commissions WHERE status = 'paid'"),
      db.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE status = 'pending'"),
    ]);

    const totalProspects = prospects.rows[0].count;
    const convertedCount = converted.rows[0].count;

    res.json({
      totalProspects,
      conversions: convertedCount,
      conversionRate: totalProspects ? Math.round((convertedCount / totalProspects) * 100) : 0,
      teamSize: team.rows[0].count,
      totalCommissions: commissions.rows[0].total,
      pendingFollowups: followups.rows[0].count,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/prospects", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, phone, source, status, priority, notes, added_date, next_followup, created_at, updated_at
       FROM prospects
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/prospects", async (req, res) => {
  const { name, phone, source, status, priority, notes, next_followup } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO prospects (name, phone, source, status, priority, notes, next_followup)
       VALUES ($1, $2, $3, COALESCE($4, 'cold'), COALESCE($5, 'medium'), $6, $7)
       RETURNING *`,
      [name, phone, source, status, priority, notes, next_followup]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/prospects/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, source, status, priority, notes, next_followup } = req.body;
  try {
    const result = await db.query(
      `UPDATE prospects
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           source = COALESCE($3, source),
           status = COALESCE($4, status),
           priority = COALESCE($5, priority),
           notes = COALESCE($6, notes),
           next_followup = COALESCE($7, next_followup),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [name, phone, source, status, priority, notes, next_followup, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Prospect not found" });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/prospects/:id", async (req, res) => {
  try {
    const result = await db.query("DELETE FROM prospects WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Prospect not found" });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/followups", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT f.id, f.prospect_id, p.name AS prospect_name, f.scheduled_date, f.method, f.notes, f.status
       FROM follow_ups f
       LEFT JOIN prospects p ON p.id = f.prospect_id
       ORDER BY f.scheduled_date ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/followups", async (req, res) => {
  const { prospect_id, scheduled_date, method, notes } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO follow_ups (prospect_id, scheduled_date, method, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [prospect_id, scheduled_date, method, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/followups/:id/complete", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE follow_ups
       SET status = 'done', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Follow-up not found" });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/team", async (_req, res) => {
  try {
    const result = await db.query("SELECT * FROM team_members ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/team", async (req, res) => {
  const { name, phone, level, sponsor_id, active, join_date, notes } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO team_members (name, phone, level, sponsor_id, active, join_date, notes)
       VALUES ($1, $2, COALESCE($3, 'starter'), $4, COALESCE($5, true), COALESCE($6, CURRENT_DATE), $7)
       RETURNING *`,
      [name, phone, level, sponsor_id, active, join_date, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/commissions", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT c.id, c.member_id, tm.name AS member_name, c.amount, c.type, c.month, c.status, c.notes, c.created_at
       FROM commissions c
       LEFT JOIN team_members tm ON tm.id = c.member_id
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/commissions", async (req, res) => {
  const { member_id, amount, type, month, status, notes } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO commissions (member_id, amount, type, month, status, notes)
       VALUES ($1, $2, COALESCE($3, 'personal'), COALESCE($4, TO_CHAR(NOW(), 'YYYY-MM')), COALESCE($5, 'paid'), $6)
       RETURNING *`,
      [member_id, amount, type, month, status, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/training", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT tp.id, tp.member_id, tm.name AS member_name, tp.module, tp.completed, tp.completed_date, tp.created_at
       FROM training_progress tp
       LEFT JOIN team_members tm ON tm.id = tp.member_id
       ORDER BY tp.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/training", async (req, res) => {
  const { member_id, module, completed, completed_date } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO training_progress (member_id, module, completed, completed_date)
       VALUES ($1, $2, COALESCE($3, false), $4)
       RETURNING *`,
      [member_id, module, completed, completed_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(appRoot, "index.html"));
});

// Only listen when not running in a serverless environment (Vercel sets VERCEL=1)
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`D'Influencers app running on http://localhost:${port}`);
  });
}

module.exports = app;
