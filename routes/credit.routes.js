const express = require("express");
const router = express.Router();
const pool = require("../db");

router.post("/search", async (req,res)=>{

try{

const { national_id } = req.body;

// borrower
const borrower = await pool.query(
"SELECT id, full_name, national_id FROM customers WHERE national_id=$1",
[national_id]
);

if(borrower.rows.length===0){
return res.json({error:"Borrower not found"});
}

const customerId = borrower.rows[0].id;

// credit score
const score = await pool.query(`
SELECT 
score,
risk_level,
total_debt,
loan_count
FROM credit_scores
WHERE customer_id = $1
`,[customerId]);

// loan summary
const loans = await pool.query(`
SELECT
COUNT(*) as total_loans,
COALESCE(SUM(amount),0) as total_borrowed
FROM loan_applications
WHERE customer_id = $1
`,[customerId]);

// payments
const payments = await pool.query(`
SELECT COALESCE(SUM(lp.amount),0) AS total_paid
FROM loan_payments lp
JOIN loan_approvals la ON lp.loan_id = la.id
WHERE la.customer_id = $1
`, [customerId]);

// loan history (THIS IS NEW)
const history = await pool.query(`
SELECT
amount,
status,
created_at
FROM loan_applications
WHERE customer_id = $1
ORDER BY created_at DESC
`,[customerId]);

const totalBorrowed = loans.rows[0].total_borrowed || 0;
const totalPaid = payments.rows[0].total_paid || 0;

res.json({

borrower: borrower.rows[0],

credit: score.rows[0],

loan_summary:{
total_loans: loans.rows[0].total_loans,
total_borrowed: totalBorrowed,
total_paid: totalPaid,
outstanding_balance: totalBorrowed-totalPaid
},

loan_history: history.rows

});

}catch(err){

console.error(err);
res.status(500).json({error:"Server error"});

}

});

module.exports = router;