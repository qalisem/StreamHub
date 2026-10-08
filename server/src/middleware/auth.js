const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = '30m'; // FR-1.2: session expires after 30 minutes

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.display_name }, SECRET, { expiresIn: EXPIRES });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// FR-1.3: role checks enforced on the server
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Not allowed' });

module.exports = { sign, requireAuth, requireRole };
