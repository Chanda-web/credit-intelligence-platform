const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {

try {

const totalChecks = await pool.query(
"SELECT COUNT(*) FROM credit_checks"
);

const avgScore = await pool.query(
"SELECT AVG(score) FROM credit_scores"
);

const approvals = await pool.query(
"SELECT COUNT(*) FROM loan_applications WHERE status='approved'"
);

const declines = await pool.query(
"SELECT COUNT(*) FROM loan_applications WHERE status='rejected'"
);

res.json({
total_checks: totalChecks.rows[0].count,
average_score: Math.round(avgScore.rows[0].avg),
approvals: approvals.rows[0].count,
declines: declines.rows[0].count
});

} catch(err){
console.error(err);
res.status(500).send("Server Error");
}

});

module.exports = router;