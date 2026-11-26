const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sign, requireAuth } = require('../middleware/auth');
const { queueEmail } = require('../email');

const RESET_MINUTES = 30; // FR-1.5
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/; // FR-1.1

module.exports = (db, { now = () => new Date() } = {}) => {
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
    queueEmail(db, { userId: user.id, template: 'welcome', now }); // FR-7.1
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  });

  r.post('/login', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = findByEmail.get(email);
    if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' }); // generic on purpose
    }
    if (!user.active) return res.status(403).json({ error: 'This account has been deactivated' });
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
    queueEmail(db, { userId: user.id, template: 'password_changed', now });
    res.json({ message: 'Password changed successfully' });
  });

  // FR-1.5: forgot password. Same answer whether or not the email exists, so the
  // endpoint cannot be used to find out who has an account.
  const FORGOT_MESSAGE = 'If that email has an account, a reset link is on its way.';
  r.post('/forgot', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    const user = findByEmail.get(email);
    if (user && user.active) {
      const token = crypto.randomBytes(32).toString('hex');
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + RESET_MINUTES * 60000);
      db.prepare(`INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)`)
        .run(user.id, hashToken(token), expiresAt.toISOString(), createdAt.toISOString());
      queueEmail(db, { userId: user.id, template: 'password_reset', now, data: { token } });
    }
    res.json({ message: FORGOT_MESSAGE });
  });

  // FR-1.5: reset with the emailed token. Single use, 30 minute expiry; only the hash is stored.
  r.post('/reset', (req, res) => {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const reset = token && db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hashToken(token));
    if (!reset || reset.used_at || now().getTime() > new Date(reset.expires_at).getTime()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    }
    if (!PASSWORD_RE.test(password)) return res.status(400).json({ error: 'Password needs 8+ characters with a letter and a number' });
    const usedAt = now().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), reset.user_id);
      // using one link also cancels any other open links for this account
      db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(usedAt, reset.user_id);
    })();
    queueEmail(db, { userId: reset.user_id, template: 'password_changed', now });
    res.json({ message: 'Password reset. You can log in with your new password.' });
  });

  return r;
};
