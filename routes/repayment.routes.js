const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth.middleware");

// Record a repayment
router.post("/", auth, async (req, res) => {

  try {

    const { loan_id, amount } = req.body;

    // 1️⃣ Record repayment
    await pool.query(
      `INSERT INTO repayments (loan_id, amount)
       VALUES ($1,$2)`,
      [loan_id, amount]
    );

    // 2️⃣ Calculate total repaid
    const paid = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total_paid
       FROM repayments
       WHERE loan_id = $1`,
      [loan_id]
    );

    const totalPaid = parseFloat(paid.rows[0].total_paid);

    // 3️⃣ Get loan amount
    const loan = await pool.query(
      `SELECT approved_amount
       FROM loan_approvals
       WHERE id = $1`,
      [loan_id]
    );

    const loanAmount = parseFloat(loan.rows[0].approved_amount);

    // 4️⃣ Calculate remaining balance
    const remainingBalance = loanAmount - totalPaid;

    res.json({
      status: "Payment recorded",
      total_paid: totalPaid,
      remaining_balance: remainingBalance
    });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Server error" });

  }

});

module.exports = router;