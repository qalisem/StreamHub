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

  r.put('/me', requireAuth, (req, res) => {
    const displayName = String(req.body.displayName || '').trim();
    if (!displayName || displayName.length > 60) {
      return res.status(400).json({ error: 'Display name must be between 1 and 60 characters' });
    }
    const result = db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(user) });
  });

  r.put('/password', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    if (!PASSWORD_RE.test(newPassword)) {
      return res.status(400).json({ error: 'New password needs 8+ characters with a letter and a number' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
    res.json({ message: 'Password changed successfully' });
  });

  return r;
};
