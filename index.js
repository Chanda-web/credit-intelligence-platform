require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

// serve dashboard
app.use(express.static("public"));
app.use(express.static("dashboard"));

app.post("/login", async (req, res) => {
  try {
    const { institution, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM institutions WHERE name = $1",
      [institution]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Institution not found" });
    }

    const inst = result.rows[0];

    if (password !== "password123") {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = jwt.sign(
      { institution_id: inst.id, name: inst.name },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      institution: inst.name
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// IMPORT LOAN ROUTES
console.log("Loading loan routes from:", require.resolve("./routes/loan.routes.js"));
console.log("Loading decision route from:", require.resolve("./routes/decision.routes.js"));

const loanRoutes = require("./routes/loan.routes.js");
const customerRoutes = require("./routes/customer.routes.js");
const decisionRoutes = require("./routes/decision.routes.js");
const reportRoutes = require('./routes/report.routes');
const adminRoutes = require("./routes/admin.routes");
const profileRoutes = require("./routes/profile.routes");
const repaymentRoutes = require("./routes/repayment.routes");
const analyticsRoutes = require("./routes/analytics.routes");

console.log("ROUTES IMPORTED SUCCESSFULLY");

// CONNECT ROUTES
app.use("/api/loans", loanRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/decision", decisionRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/credit-profile", profileRoutes);
app.use("/api/repay", repaymentRoutes);
app.use("/api/credit", require("./routes/credit.routes"));
app.use("/api/analytics", analyticsRoutes);

// 🔐 JWT MIDDLEWARE
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Token required" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });

    req.institution = user;
    next();
  });
}

// Health check
app.get("/", (req, res) => {
  res.json({ status: "API running 🚀" });
});

// Risk calculation
function calculateRisk(totalDebt, income) {
  const ratio = income > 0 ? totalDebt / income : 0;

  if (ratio >= 0.5) {
    return "HIGH";
  } else if (ratio >= 0.3) {
    return "MEDIUM";
  } else {
    return "LOW";
  }
}

// Credit decision logic
function makeCreditDecision(totalDebt, income, requestedAmount) {
  const newTotalDebt = totalDebt + requestedAmount;
  const ratio = income > 0 ? newTotalDebt / income : 0;

  if (ratio >= 0.7) {
    return {
      decision: "DECLINED",
      reason: "Debt too high compared to income"
    };
  }

  if (ratio >= 0.5) {
    return {
      decision: "REVIEW",
      reason: "Borderline affordability"
    };
  }

  return {
    decision: "APPROVED",
    reason: "Affordable loan"
  };
}

// 🔐 AUTH TOKEN ROUTE
app.post("/auth/token", async (req, res) => {
  const { institution_id, api_key } = req.body;

  if (!institution_id || !api_key) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const result = await pool.query(
    "SELECT institution_id, name FROM institutions WHERE institution_id=$1 AND api_key=$2",
    [institution_id, api_key]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const institution = result.rows[0];

  const token = jwt.sign(
    {
      institution_id: institution.institution_id,
      name: institution.name
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({
    token,
    expires_in: "1h"
  });
});

// 💰 LOAN APPLICATION ROUTE
app.post('/loan/apply', authenticateToken, async (req, res) => {
  try {
    const { national_id, amount } = req.body;

    if (!national_id || !amount) {
      return res.status(400).json({ error: "national_id and amount required" });
    }

    // Find customer
    const customerResult = await pool.query(
      "SELECT * FROM customers WHERE national_id = $1",
      [national_id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerResult.rows[0];

    // Check existing loans
    const loanResult = await pool.query(
      "SELECT * FROM loan_approvals WHERE customer_id = $1",
      [customer.id]
    );

    const existingLoans = loanResult.rows.length;

    // Calculate total debt
    const totalDebtResult = await pool.query(
      "SELECT SUM(approved_amount) as total FROM loan_approvals WHERE customer_id = $1",
      [customer.id]
    );

   const totalDebt = Number(totalDebtResult.rows[0].total) || 0;

    // Calculate risk
    const riskLevel = calculateRisk(totalDebt, customer.monthly_income);

    const decisionResult = makeCreditDecision(
  totalDebt,
  customer.monthly_income,
  amount
);

    // Get institution numeric ID
    const instResult = await pool.query(
      "SELECT id FROM institutions WHERE institution_id = $1",
      [req.institution.institution_id]
    );

    if (instResult.rows.length === 0) {
      return res.status(404).json({ error: "Institution not found" });
    }

    const institutionNumericId = instResult.rows[0].id;

   let status = decisionResult.decision;

// Auto approve if APPROVED
if (decisionResult.decision === "APPROVED") {
      await pool.query(
        "INSERT INTO loan_approvals (customer_id, institution_id, approved_amount) VALUES ($1, $2, $3)",
        [customer.id, institutionNumericId, amount]
      );

      status = "APPROVED";
    }

   res.json({
  customer: customer.full_name,
  requested_amount: amount,
  monthly_income: customer.monthly_income,
  existing_debt: totalDebt,
  risk_level: riskLevel,
  decision: decisionResult.decision,
  reason: decisionResult.reason,
  status: status,
  existing_loans: existingLoans
});

  } catch (err) {
    console.error(err);

    if (err.code === "23505") {
      return res.status(400).json({
        error: "Customer already has a loan approved today"
      });
    }

    res.status(500).json({ error: "Server error" });
  }
});

// Protected test route
app.get('/protected', authenticateToken, (req, res) => {
  res.json({
    message: "You are authorized 🔐",
    institution: req.institution.name
  });
});

// Loan Risk Check Endpoint
app.post('/loan/check', authenticateToken, async (req, res) => {
    try {
        const { national_id } = req.body;

        if (!national_id) {
            return res.status(400).json({ error: "national_id is required" });
        }

        // Find customer
        const customerResult = await pool.query(
            "SELECT * FROM customers WHERE national_id = $1",
            [national_id]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        const customer = customerResult.rows[0];

        // Check existing loans
        const loanResult = await pool.query(
            "SELECT * FROM loan_approvals WHERE customer_id = $1",
            [customer.id]
        );

        const loans = loanResult.rows;
        const totalDebt = loans.reduce((sum, loan) => sum + parseFloat(loan.approved_amount), 0);

        // Risk logic
        const riskLevel = calculateRisk(totalDebt, customer.monthly_income);

        res.json({
            customer: customer.full_name,
            national_id: customer.national_id,
            monthly_income: customer.monthly_income,
            existing_loans: loans.length,
            total_debt: totalDebt,
            risk_level: riskLevel
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// 📜 CUSTOMER LOAN HISTORY

app.get('/customer/summary/:national_id', authenticateToken, async (req, res) => {
  try {
    const { national_id } = req.params;

    // Get customer
    const customerResult = await pool.query(
      'SELECT * FROM customers WHERE national_id = $1',
      [national_id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerResult.rows[0];

    // Get loans
    const loansResult = await pool.query(
      `SELECT approved_amount 
       FROM loan_approvals
       WHERE customer_id = $1`,
      [customer.id]
    );

    const loans = loansResult.rows;

    const totalLoans = loans.reduce(
      (sum, loan) => sum + Number(loan.approved_amount),
      0
    );

    const loanCount = loans.length;

    // Simple risk logic
    let risk = "LOW";
    if (totalLoans > customer.monthly_income) {
      risk = "HIGH";
    } else if (totalLoans > customer.monthly_income * 0.5) {
      risk = "MEDIUM";
    }

    res.json({
      customer: customer.full_name,
      income: customer.monthly_income,
      total_loans: totalLoans,
      loan_count: loanCount,
      risk: risk
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Protected Loans Endpoint
app.get("/loans", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        customers.full_name,
        loan_approvals.approved_amount,
        institutions.name AS institution,
        loan_approvals.approved_at
      FROM loan_approvals
      JOIN customers ON loan_approvals.customer_id = customers.id
      JOIN institutions ON loan_approvals.institution_id = institutions.id
    `);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📜 CUSTOMER LOAN HISTORY
app.get('/customer/loans/:national_id', authenticateToken, async (req, res) => {
  try {
    const { national_id } = req.params;

    const result = await pool.query(`
      SELECT 
        c.full_name,
        c.national_id,
        la.approved_amount,
        i.name AS institution,
        la.approved_at
      FROM loan_approvals la
      JOIN customers c ON la.customer_id = c.id
      JOIN institutions i ON la.institution_id = i.id
      WHERE c.national_id = $1
      ORDER BY la.approved_at DESC
    `, [national_id]);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📊 CREDIT SCORE ENDPOINT
app.get('/customer/score/:national_id', authenticateToken, async (req, res) => {
  try {
    const { national_id } = req.params;

    // Get customer
    const customerResult = await pool.query(
      "SELECT * FROM customers WHERE national_id = $1",
      [national_id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerResult.rows[0];

    // Get loans
    const loansResult = await pool.query(
      "SELECT approved_amount FROM loan_approvals WHERE customer_id = $1",
      [customer.id]
    );

    const loans = loansResult.rows;

    const totalDebt = loans.reduce(
      (sum, loan) => sum + Number(loan.approved_amount),
      0
    );

    const loanCount = loans.length;

    const income = customer.monthly_income;

    // Debt ratio
    const ratio = totalDebt / income;

    // Credit Score Logic (Simple Model)
    let score = 750;

    if (ratio > 0.7) score -= 200;
    else if (ratio > 0.5) score -= 120;
    else if (ratio > 0.3) score -= 60;

    score -= loanCount * 10;

    if (score < 300) score = 300;
    if (score > 850) score = 850;

    // Risk level
    let risk = "LOW";
    if (score < 500) risk = "HIGH";
    else if (score < 650) risk = "MEDIUM";

    // Save score history
await pool.query(
  `INSERT INTO credit_scores 
   (customer_id, score, risk_level, total_debt, loan_count)
   VALUES ($1, $2, $3, $4, $5)`,
  [
    customer.id,
    score,
    risk,
    totalDebt,
    loanCount
  ]
);

    res.json({
      customer: customer.full_name,
      national_id: customer.national_id,
      credit_score: score,
      risk_level: risk,
      total_loans: loanCount,
      total_debt: totalDebt,
      monthly_income: income
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📈 CREDIT SCORE HISTORY
app.get('/customer/score-history/:national_id', authenticateToken, async (req, res) => {
  try {
    const { national_id } = req.params;

    const result = await pool.query(`
      SELECT 
        c.full_name,
        c.national_id,
        cs.score,
        cs.risk_level,
        cs.total_debt,
        cs.loan_count,
        cs.created_at
      FROM credit_scores cs
      JOIN customers c ON cs.customer_id = c.id
      WHERE c.national_id = $1
      ORDER BY cs.created_at DESC
      LIMIT 10
    `, [national_id]);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📊 FULL CREDIT REPORT
app.get('/customer/report/:national_id', authenticateToken, async (req, res) => {
  try {
    const { national_id } = req.params;

    // Get customer
    const customerResult = await pool.query(
      "SELECT * FROM customers WHERE national_id = $1",
      [national_id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerResult.rows[0];

    // Get loans
    const loansResult = await pool.query(`
      SELECT 
        la.approved_amount,
        i.name AS institution,
        la.approved_at
      FROM loan_approvals la
      JOIN institutions i ON la.institution_id = i.id
      WHERE la.customer_id = $1
      ORDER BY la.approved_at DESC
    `, [customer.id]);

    const loans = loansResult.rows;

    // Totals
    const totalDebt = loans.reduce(
      (sum, loan) => sum + Number(loan.approved_amount),
      0
    );

    const loanCount = loans.length;
    const income = customer.monthly_income;

    // Calculate score
    let score = 700;

    if (totalDebt > income * 2) score -= 200;
    else if (totalDebt > income) score -= 100;
    else score -= 50;

    if (loanCount > 5) score -= 100;
    else if (loanCount > 2) score -= 50;

    if (score < 300) score = 300;

    // Risk
    let risk = "LOW";
    if (score < 500) risk = "HIGH";
    else if (score < 650) risk = "MEDIUM";

    // Get last score
    const lastScore = await pool.query(`
      SELECT score FROM credit_scores
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [customer.id]);

    // Save only if changed
    if (
      lastScore.rows.length === 0 ||
      lastScore.rows[0].score != score
    ) {
      await pool.query(`
        INSERT INTO credit_scores
        (customer_id, score, risk_level, total_debt, loan_count)
        VALUES ($1,$2,$3,$4,$5)
      `, [
        customer.id,
        score,
        risk,
        totalDebt,
        loanCount
      ]);
    }

    // Score history
    const historyResult = await pool.query(`
      SELECT 
        score,
        risk_level,
        total_debt,
        loan_count,
        created_at
      FROM credit_scores
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [customer.id]);

    res.json({
      customer: {
        name: customer.full_name,
        national_id: customer.national_id,
        monthly_income: customer.monthly_income
      },
      credit_score: score,
      risk_level: risk,
      summary: {
        total_loans: loanCount,
        total_debt: totalDebt
      },
      loans: loans,
      score_history: historyResult.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// SERVER
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
