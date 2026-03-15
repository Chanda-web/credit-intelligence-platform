console.log(">>> LOAN ROUTES LOADED <<<");

const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth.middleware");


// TEST ROUTE
router.get("/test", (req, res) => {
  res.send("Loan routes working");
});


// GET ALL LOANS
router.get("/", auth, async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT 
        la.id AS loan_id,
        c.full_name,
        la.approved_amount,
        i.name AS institution,
        la.approved_at
      FROM loan_approvals la
      JOIN customers c ON la.customer_id = c.id
      JOIN institutions i ON la.institution_id = i.id
      ORDER BY la.approved_at DESC
    `);

    res.json(result.rows);

  } catch (err) {

    console.error("DB ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }

});


// GET LOANS FOR ONE CUSTOMER
router.get("/customer/:customer_id", auth, async (req, res) => {

  try {

    const { customer_id } = req.params;

    const result = await pool.query(`
      SELECT 
        la.id AS loan_id,
        c.full_name,
        la.approved_amount,
        i.name AS institution,
        la.approved_at
      FROM loan_approvals la
      JOIN customers c ON la.customer_id = c.id
      JOIN institutions i ON la.institution_id = i.id
      WHERE la.customer_id = $1
      ORDER BY la.approved_at DESC
    `,[customer_id]);

    res.json(result.rows);

  } catch (err) {

    console.error("CUSTOMER LOANS ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }

});


// CREATE / APPROVE LOAN
router.post("/", auth, async (req, res) => {

  try {

    const { customer_id, institution_id, approved_amount } = req.body;

    if (!customer_id || !institution_id || !approved_amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(`
      INSERT INTO loan_approvals
      (customer_id, institution_id, approved_amount)
      VALUES ($1,$2,$3)
      RETURNING *
    `,[customer_id, institution_id, approved_amount]);

    res.json({
      message: "Loan approved successfully",
      loan: result.rows[0]
    });

  } catch (err) {

    console.error("APPROVAL ERROR:", err);
    res.status(500).json({ error: "Error approving loan" });

  }

});


// RECORD PAYMENT
router.post("/:loan_id/pay", auth, async (req, res) => {

  try {

    const { loan_id } = req.params;
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Payment amount required" });
    }

    // SAVE PAYMENT
    await pool.query(
      `INSERT INTO loan_payments (loan_id, amount)
       VALUES ($1,$2)`,
      [loan_id, amount]
    );

    // TOTAL PAID
    const totals = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total_paid
      FROM loan_payments
      WHERE loan_id = $1
    `,[loan_id]);

    // LOAN AMOUNT
    const loan = await pool.query(`
      SELECT approved_amount
      FROM loan_approvals
      WHERE id = $1
    `,[loan_id]);

    if (loan.rows.length === 0) {
      return res.status(404).json({ error: "Loan not found" });
    }

    const total_paid = Number(totals.rows[0].total_paid);
    const approved_amount = Number(loan.rows[0].approved_amount);

    const remaining_balance = approved_amount - total_paid;

    res.json({
      status: "Payment recorded",
      total_paid,
      remaining_balance
    });

  } catch (err) {

    console.error("PAYMENT ERROR:", err);
    res.status(500).json({ error: "Payment failed" });

  }

});


// GET LOAN BALANCE
router.get("/:loan_id/balance", auth, async (req, res) => {

  try {

    const { loan_id } = req.params;

    const loan = await pool.query(`
      SELECT approved_amount
      FROM loan_approvals
      WHERE id = $1
    `,[loan_id]);

    if (loan.rows.length === 0) {
      return res.status(404).json({ error: "Loan not found" });
    }

    const payments = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total_paid
      FROM loan_payments
      WHERE loan_id = $1
    `,[loan_id]);

    const approved_amount = Number(loan.rows[0].approved_amount);
    const total_paid = Number(payments.rows[0].total_paid);

    const remaining_balance = approved_amount - total_paid;

    res.json({
      loan_id,
      approved_amount,
      total_paid,
      remaining_balance
    });

  } catch (err) {

    console.error("BALANCE ERROR:", err);
    res.status(500).json({ error: "Server error" });

  }

});

module.exports = router;