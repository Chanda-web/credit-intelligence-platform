const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  try {

    // Total credit checks (from credit_scores table)
    const totalChecksResult = await pool.query(
      "SELECT COUNT(*) FROM credit_scores"
    );

    const totalChecks = Number(totalChecksResult.rows[0].count);

    // Average credit score
    const avgScoreResult = await pool.query(
      "SELECT AVG(score) FROM credit_scores"
    );

    const avgScore = Math.round(avgScoreResult.rows[0].avg || 0);

    // Approvals vs Declines
    const decisionResult = await pool.query(`
      SELECT decision, COUNT(*) 
      FROM loan_decisions 
      GROUP BY decision
    `);

    let approvals = 0;
    let declines = 0;

    decisionResult.rows.forEach(row => {
      if (row.decision === "APPROVED") approvals = Number(row.count);
      if (row.decision === "DECLINED") declines = Number(row.count);
    });

    const approvalRate =
      approvals + declines === 0
        ? 0
        : Math.round((approvals / (approvals + declines)) * 100);

    res.json({
      totalChecks,
      avgScore,
      approvalRate
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

module.exports = router;