const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth.middleware");

router.post("/", auth, async (req, res) => {

  console.log(">>> DECISION ROUTE HIT <<<");

  try {
   const { national_id, requested_amount } = req.body;

// 🚨 CHECK BLACKLIST FIRST
const blacklistCheck = await pool.query(
  "SELECT * FROM blacklist WHERE national_id = $1",
  [national_id]
);

if (blacklistCheck.rows.length > 0) {
  return res.json({
    decision: "DECLINE",
    reason: "Customer is blacklisted"
  });
}

// 1️⃣ Find customer
const customer = await pool.query(
  "SELECT * FROM customers WHERE national_id = $1",
  [national_id]
);

    if (customer.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customerData = customer.rows[0];

   // get existing approved loans
const existingLoans = await pool.query(
  `SELECT COALESCE(SUM(approved_amount),0) AS total
   FROM loan_approvals
   WHERE customer_id = $1`,
  [customerData.id]
);

const totalDebt = parseFloat(existingLoans.rows[0].total);

// affordability calculation
const safeLimit = Math.max((customerData.monthly_income * 0.4) - totalDebt, 0);

    // 2️⃣ Get loan history
    const loans = await pool.query(
      "SELECT approved_amount FROM loan_approvals WHERE customer_id = $1",
      [customerData.id]
    );

    const totalLoans = loans.rows.reduce(
      (sum, loan) => sum + parseFloat(loan.approved_amount),
      0
    );

    const numberOfLoans = loans.rows.length;

    // 3️⃣ Calculate credit score
    let creditScore = 700 - numberOfLoans * 50 - totalLoans / 100;

    let riskLevel = "LOW";
    if (creditScore < 600) riskLevel = "MEDIUM";
    if (creditScore < 500) riskLevel = "HIGH";

    console.log("Attempting to insert credit score...");

    // 4️⃣ Save credit score history
    await pool.query(
      `INSERT INTO credit_scores
       (customer_id, score, risk_level, total_debt, loan_count)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        customerData.id,
        Math.round(creditScore),
        riskLevel,
        totalLoans,
        numberOfLoans
      ]
    );

    console.log("Credit score saved:", creditScore);

    // 5️⃣ Affordability rule
    const income = parseFloat(customerData.monthly_income);
    const maxAllowed = safeLimit;

    let decision = "APPROVE";
    let reason = "Good standing";

    // 6️⃣ Risk check
    if (riskLevel === "HIGH") {
      decision = "DECLINE";
      reason = "High credit risk";
    }

    // 7️⃣ Affordability check
    if (requested_amount > maxAllowed) {
      decision = "DECLINE";
      reason = "Requested amount exceeds affordability";
    }

    // 8️⃣ Loan stacking detection (same day approval)
    const todayLoan = await pool.query(
      `SELECT * FROM loan_approvals
       WHERE customer_id = $1
       AND approved_at::date = CURRENT_DATE`,
      [customerData.id]
    );

    if (todayLoan.rows.length > 0) {
      decision = "DECLINE";
      reason = "Customer already received a loan today";
    }

    // 9️⃣ Store loan if approved
    if (decision === "APPROVE") {
      await pool.query(
        `INSERT INTO loan_approvals (customer_id, institution_id, approved_amount)
         VALUES ($1,$2,$3)`,
        [customerData.id, 1, requested_amount]
      );
    }

   // Log credit check
await pool.query(
  `INSERT INTO credit_checks
  (institution_id, customer_id, national_id, credit_score, risk_level, requested_amount, decision)
  VALUES ($1,$2,$3,$4,$5,$6,$7)`,
 [
  req.institution?.institution_id || null,
  customerData.id,
  national_id,
  creditScore,
  riskLevel,
  requested_amount,
  decision
]
);

console.log("Credit check logged with score and risk");

    // 🔟 Return decision response
    res.json({
      customer: customerData.full_name,
      credit_score: Math.round(creditScore),
      risk_level: riskLevel,
      requested_amount,
      safe_limit: maxAllowed,
      decision,
      reason
    });

  } catch (err) {
    console.error("Decision route error:", err);
    res.status(500).json({ error: "Server error" });
  }

});

module.exports = router;