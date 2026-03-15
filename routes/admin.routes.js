const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/stats", async (req, res) => {
  try {

    const totalChecks = await db.query(
      "SELECT COUNT(*) FROM credit_checks"
    );

    const avgScore = await db.query(
      "SELECT AVG(credit_score) FROM credit_checks"
    );

    const decisions = await db.query(`
      SELECT decision, COUNT(*) 
      FROM credit_checks 
      GROUP BY decision
    `);

    res.json({
      total_credit_checks: totalChecks.rows[0].count,
      average_credit_score: avgScore.rows[0].avg,
      decision_breakdown: decisions.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Admin stats error" });
  }
});

router.get("/defaulters", async (req, res) => {
  try {

    const result = await db.query(`
      SELECT 
        c.full_name,
        c.national_id,
        la.approved_amount AS loan_amount,
        COALESCE(SUM(lp.amount),0) AS total_paid,
        (la.approved_amount - COALESCE(SUM(lp.amount),0)) AS outstanding_balance
      FROM customers c
      JOIN loan_approvals la ON c.id = la.customer_id
      LEFT JOIN loan_payments lp ON la.id = lp.loan_id
      GROUP BY c.full_name, c.national_id, la.approved_amount
      HAVING (la.approved_amount - COALESCE(SUM(lp.amount),0)) > 0
    `);

    res.json({
      defaulters: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Defaulter detection error" });
  }
});

router.get("/risk-distribution", async (req, res) => {
  try {

    const result = await db.query(`
      SELECT 
        COALESCE(risk_level,'UNKNOWN') AS risk_level,
        COUNT(*) 
      FROM credit_checks
      GROUP BY COALESCE(risk_level,'UNKNOWN')
    `);

    res.json({
      risk_distribution: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Risk distribution error" });
  }
});

router.get("/loans", async (req, res) => {
  try {

    const result = await db.query(`
      SELECT
        c.full_name,
        c.national_id,
        la.approved_amount AS loan_amount,
        COALESCE(SUM(lp.amount),0) AS total_paid,
        (la.approved_amount - COALESCE(SUM(lp.amount),0)) AS balance,
        la.approved_at
      FROM customers c
      JOIN loan_approvals la ON c.id = la.customer_id
      LEFT JOIN loan_payments lp ON la.id = lp.loan_id
      GROUP BY
        c.full_name,
        c.national_id,
        la.approved_amount,
        la.approved_at
      ORDER BY la.approved_at DESC
    `);

    res.json({
      loans: result.rows
    });

  } catch (err) {

    console.error("Loans API Error:", err);

    res.status(500).json({
      error: "Loans fetch error",
      details: err.message
    });

  }
});

module.exports = router;