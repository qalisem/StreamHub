const bcrypt = require('bcryptjs');

// Original sample catalog for demos and load testing (fictional titles)
const ADJ = ['Silent', 'Crimson', 'Last', 'Hidden', 'Golden', 'Broken', 'Midnight', 'Northern', 'Electric', 'Distant'];
const NOUN = ['Harbor', 'Signal', 'Garden', 'Frontier', 'Echo', 'Kingdom', 'Orbit', 'River', 'Circuit', 'Lantern'];
const GENRES = ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Thriller', 'Documentary', 'Animation', 'Romance', 'Horror'];
const CAST = ['Maya Torres', 'Jon Park', 'Leila Haddad', 'Sam Okafor', 'Ava Lindqvist', 'Ravi Mehta', 'Nora Blake', 'Theo Grant'];
const TIERS = ['basic', 'standard', 'premium'];
const COLORS = ['1a73e8', '34a853', 'ea4335', 'fbbc04', '9334e6', '00897b', 'e8710a', '5f6368'];

// Self-contained SVG poster so the demo works offline
function poster(name, color, genre) {
  const words = name.replace('The ', '').split(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#${color}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><text x="24" y="330" fill="#fff" font-family="Arial" font-size="15" opacity=".75">${genre.toUpperCase()}</text>${words.map((w, i) => `<text x="22" y="${372 + i * 38}" fill="#fff" font-family="Arial" font-weight="bold" font-size="34">${w}</text>`).join('')}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function seed(db, count = 50, { now = () => new Date() } = {}) {
  const users = [
    ['admin@streamhub.test', 'Admin123', 'Admin', 'admin'],
    ['content@streamhub.test', 'Content123', 'Content Manager', 'content_manager'],
    ['user@streamhub.test', 'User1234', 'Demo User', 'subscriber'],
    ['basic@streamhub.test', 'Basic1234', 'Basic Subscriber', 'subscriber'],
  ];
  const addUser = db.prepare('INSERT OR IGNORE INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)');
  users.forEach(([e, p, n, r]) => addUser.run(e, bcrypt.hashSync(p, 10), n, r));

  const basicUser = db.prepare("SELECT id FROM users WHERE email = 'basic@streamhub.test'").get();
  const existingBasicSubscription = db.prepare(`SELECT id FROM subscriptions
    WHERE user_id = ? AND status IN ('active','cancelled','past_due')`).get(basicUser.id);
  if (!existingBasicSubscription) {
    const startedAt = now();
    const periodEnd = new Date(startedAt.getTime() + 30 * 86400000);
    const seedBasicSubscription = db.transaction(() => {
      const subscription = db.prepare(`INSERT INTO subscriptions
        (user_id, plan_code, status, card_last4, started_at, period_end)
        VALUES (?, 'basic', 'active', '4242', ?, ?)`)
        .run(basicUser.id, startedAt.toISOString(), periodEnd.toISOString());
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, description, created_at)
        VALUES (?, ?, 'basic', 899, '4242', 'succeeded', 'Initial Basic subscription', ?)`)
        .run(basicUser.id, subscription.lastInsertRowid, startedAt.toISOString());
    });
    seedBasicSubscription();
  }

  const add = db.prepare(`INSERT INTO titles (name, type, genre, year, rating, runtime, synopsis, cast_list, poster_url, trailer_url, tier)
    VALUES (@name, @type, @genre, @year, @rating, @runtime, @synopsis, @cast_list, @poster_url, @trailer_url, @tier)`);
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const name = `The ${ADJ[i % 10]} ${NOUN[(i * 3 + Math.floor(i / 10)) % 10]}${i >= 100 ? ' ' + Math.floor(i / 100) : ''}`;
      const type = i % 3 === 0 ? 'show' : 'movie';
      const genre = GENRES[i % GENRES.length];
      add.run({
        name, type, genre,
        year: 1995 + ((i * 7) % 31),
        rating: Math.round((5 + ((i * 13) % 50) / 10) * 10) / 10,
        runtime: type === 'movie' ? 85 + ((i * 11) % 70) : 45,
        synopsis: `A ${genre.toLowerCase()} ${type} about ordinary people pulled into an extraordinary situation near the ${NOUN[i % 10].toLowerCase()}.`,
        cast_list: [CAST[i % 8], CAST[(i + 3) % 8], CAST[(i + 5) % 8]].join(', '),
        poster_url: poster(name, COLORS[i % 8], genre),
        trailer_url: null,
        tier: TIERS[i % 3],
      });
    }
  });
  tx();
}

module.exports = { seed };

if (require.main === module) {
  const { createDb } = require('./db');
  const db = createDb();
  seed(db);
  console.log('Seeded users and titles');
}
