const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');

function setup(count = 50) {
  const db = createDb(':memory:');
  seed(db, count);
  const app = createApp(db);
  const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.token;
  return { db, app, login };
}

module.exports = { setup, request };
