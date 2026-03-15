const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/:national_id', async (req, res) => {
  try {

    const { national_id } = req.params;

    const customerResult = await pool.query(
      "SELECT * FROM customers WHERE national_id = $1",
      [national_id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerResult.rows[0];

   const loansResult = await pool.query(
  "SELECT * FROM loan_approvals WHERE customer_id = $1",
  [customer.id]
);

    const creditScoreResult = await pool.query(
      "SELECT * FROM credit_scores WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1",
      [customer.id]
    );

    res.json({
      customer,
      loans: loansResult.rows,
      latest_credit_score: creditScoreResult.rows[0] || null
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/loan-stacking/all", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        c.full_name,
        c.national_id,
        COUNT(DISTINCT la.institution_id) AS institutions,
        COUNT(la.id) AS total_loans,
        SUM(la.approved_amount) AS total_borrowed
      FROM customers c
      JOIN loan_approvals la
        ON c.id = la.customer_id
      GROUP BY c.full_name, c.national_id
      HAVING COUNT(DISTINCT la.institution_id) > 1
      ORDER BY institutions DESC
    `);

    const alerts = result.rows.map(row => ({
      customer: row.full_name,
      national_id: row.national_id,
      institutions: Number(row.institutions),
      total_loans: Number(row.total_loans),
      total_borrowed: Number(row.total_borrowed),
      risk_level: "CRITICAL",
      alert: "Loan stacking detected"
    }));

    res.json(alerts);

  } catch (err) {

    console.error("LOAN STACKING ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }

});

router.get("/risk-alerts/all", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        c.full_name,
        c.national_id,
        COUNT(la.id) AS total_loans,
        COALESCE(SUM(la.approved_amount),0) AS total_borrowed
      FROM customers c
      JOIN loan_approvals la
        ON c.id = la.customer_id
      GROUP BY c.full_name, c.national_id
      HAVING SUM(la.approved_amount) > 5000
      ORDER BY total_borrowed DESC
    `);

    const alerts = result.rows.map(row => ({
      customer: row.full_name,
      national_id: row.national_id,
      total_loans: Number(row.total_loans),
      total_borrowed: Number(row.total_borrowed),
      risk_level: "HIGH",
      alert: "Customer heavily leveraged"
    }));

    res.json(alerts);

  } catch (err) {

    console.error("RISK ALERT ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }

});


module.exports = router;