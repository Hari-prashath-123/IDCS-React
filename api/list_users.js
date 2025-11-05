require('dotenv').config();
const db = require('./src/models');

async function listUsers() {
  await db.sequelize.sync();
  try {
    const users = await db.User.findAll();
    console.log(users.map(u => u.toJSON()));
  } catch (err) {
    console.error('Error fetching users:', err);
  } finally {
    await db.sequelize.close();
  }
}

listUsers();
