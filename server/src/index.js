const { createDb } = require('./db');
const { createApp } = require('./app');
const { seed } = require('./seed');

const db = createDb();
if (db.prepare('SELECT COUNT(*) AS n FROM titles').get().n === 0) seed(db);

const port = process.env.PORT || 4000;
createApp(db).listen(port, () => console.log(`StreamHub API running on http://localhost:${port}`));
