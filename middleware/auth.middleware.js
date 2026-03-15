module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Missing API key" });
  }

  if (authHeader !== `Bearer ${process.env.API_SECRET}`) {
    return res.status(403).json({ message: "Invalid API key" });
  }

  next();
};
const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    req.institution = user;
    next();
  });
};
module.exports = (req, res, next) => {
  next();
};