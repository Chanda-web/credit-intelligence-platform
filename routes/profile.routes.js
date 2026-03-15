const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth.middleware");

router.get("/:national_id", auth, async (req, res) => {

  try {

    const { national_id } = req.params;

    // 1️⃣ Get customer
    const customer = await pool.query(
      "SELECT * FROM customers WHERE national_id = $1",
      [national_id]
    );

    if (customer.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customerData = customer.rows[0];

    // 2️⃣ Get loan history
    const loans = await pool.query(
      `SELECT 
         la.approved_amount,
         la.approved_at,
         i.name as institution
       FROM loan_approvals la
       JOIN institutions i ON la.institution_id = i.id
       WHERE la.customer_id = $1
       ORDER BY approved_at DESC`,
      [customerData.id]
    );

    // 3️⃣ Calculate totals
    const totalDebt = loans.rows.reduce(
      (sum, loan) => sum + parseFloat(loan.approved_amount),
      0
    );

    const loanCount = loans.rows.length;

    // 4️⃣ Get latest credit score
    const score = await pool.query(
      `SELECT score, risk_level
       FROM credit_scores
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [customerData.id]
    );

    let creditScore = null;
    let riskLevel = null;

    if (score.rows.length > 0) {
      creditScore = score.rows[0].score;
      riskLevel = score.rows[0].risk_level;
    }

    // 5️⃣ Return credit profile
    res.json({
      customer: customerData.full_name,
      national_id: customerData.national_id,
      monthly_income: customerData.monthly_income,
      credit_score: creditScore,
      risk_level: riskLevel,
      total_loans: loanCount,
      total_debt: totalDebt,
      loan_history: loans.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }

});

module.exports = router;