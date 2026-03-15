const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth.middleware");

console.log(">>> CUSTOMER ROUTES LOADED <<<");

router.get("/report/:national_id", auth, async (req, res) => {

  try {

    const { national_id } = req.params;

    const result = await pool.query(`
      SELECT 
        c.full_name,
        COUNT(la.id) AS total_loans,
        COALESCE(SUM(la.approved_amount),0) AS total_borrowed,
        COALESCE(SUM(lp.amount),0) AS total_paid
      FROM customers c
      LEFT JOIN loan_approvals la 
        ON c.id = la.customer_id
      LEFT JOIN loan_payments lp 
        ON la.id = lp.loan_id
      WHERE c.national_id = $1
      GROUP BY c.full_name
    `,[national_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const row = result.rows[0];

    const outstanding_balance =
      Number(row.total_borrowed) - Number(row.total_paid);

    let risk_level = "LOW";

    if (outstanding_balance > 10000) risk_level = "HIGH";
    else if (outstanding_balance > 5000) risk_level = "MEDIUM";

    res.json({
      customer: row.full_name,
      total_loans: Number(row.total_loans),
      total_borrowed: Number(row.total_borrowed),
      total_paid: Number(row.total_paid),
      outstanding_balance,
      risk_level
    });

  } catch (err) {

    console.error("REPORT ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }

});

// TEST ROUTE
router.get("/test", (req, res) => {
  res.json({ message: "Customer route working" });
});

// CREDIT CHECK
router.post("/credit-check", async (req, res) => {
  try {
    const { national_id, requested_amount } = req.body;

    // Find customer
    const customerResult = await pool.query(
      "SELECT * FROM customers WHERE national_id = $1",
      [national_id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerResult.rows[0];

    // Get total loans
    const loanResult = await pool.query(
      "SELECT SUM(approved_amount) AS total_loans, COUNT(*) AS number_of_loans FROM loan_approvals WHERE customer_id = $1",
      [customer.id]
    );

    const total_loans = loanResult.rows[0].total_loans || 0;
    const number_of_loans = loanResult.rows[0].number_of_loans || 0;

    // Simple credit score calculation
    let credit_score = 700;

    credit_score -= number_of_loans * 50;
    credit_score -= total_loans / 50;

    if (credit_score < 300) credit_score = 300;

    // Risk level
    let risk_level = "LOW";

    if (credit_score < 600) risk_level = "MEDIUM";
    if (credit_score < 450) risk_level = "HIGH";

    res.json({
      customer: {
        name: customer.full_name,
        national_id: customer.national_id,
        monthly_income: customer.monthly_income
      },
      total_loans,
      number_of_loans,
      credit_score,
      risk_level
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// CUSTOMER DEBT EXPOSURE
router.get("/exposure/:national_id", auth, async (req, res) => {

  try {

    const { national_id } = req.params;

    // Get customer
    const customer = await pool.query(
      `SELECT id, full_name 
       FROM customers 
       WHERE national_id = $1`,
      [national_id]
    );

    if (customer.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer_id = customer.rows[0].id;

    // Total loans and borrowed amount
    const loans = await pool.query(
      `SELECT 
        COUNT(*) AS total_loans,
        COALESCE(SUM(approved_amount),0) AS total_borrowed
       FROM loan_approvals
       WHERE customer_id = $1`,
      [customer_id]
    );

    // Total paid
    const payments = await pool.query(
      `SELECT 
        COALESCE(SUM(lp.amount),0) AS total_paid
       FROM loan_payments lp
       JOIN loan_approvals la ON lp.loan_id = la.id
       WHERE la.customer_id = $1`,
      [customer_id]
    );

    const total_loans = Number(loans.rows[0].total_loans);
const total_borrowed = Number(loans.rows[0].total_borrowed);
const total_paid = Number(payments.rows[0].total_paid);

    const outstanding_balance = total_borrowed - total_paid;

    // Simple risk rule
    let risk_level = "LOW";

    if (outstanding_balance > 5000) {
      risk_level = "HIGH";
    } else if (outstanding_balance > 2000) {
      risk_level = "MEDIUM";
    }

    res.json({
      customer: customer.rows[0].full_name,
      total_loans,
      total_borrowed,
      total_paid,
      outstanding_balance,
      risk_level
    });

  } catch (err) {

    console.error("EXPOSURE ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }

});



module.exports = router;