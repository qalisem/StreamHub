const express = require('express');
const bcrypt = require('bcryptjs');
const { sign, requireAuth } = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/; // FR-1.1

module.exports = (db) => {
  const r = express.Router();
  const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const publicUser = (u) => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role });

  r.post('/register', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const displayName = String(req.body.displayName || '').trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (!PASSWORD_RE.test(password)) return res.status(400).json({ error: 'Password needs 8+ characters with a letter and a number' });
    if (!displayName) return res.status(400).json({ error: 'Display name is required' });
    if (findByEmail.get(email)) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)').run(email, hash, displayName);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  });

  r.post('/login', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = findByEmail.get(email);
    if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' }); // generic on purpose
    }
    res.json({ token: sign(user), user: publicUser(user) });
  });

  r.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  });

  return r;
};
