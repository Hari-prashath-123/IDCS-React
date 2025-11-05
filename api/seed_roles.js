
require('dotenv').config();
const db = require('./src/models');

async function seedRoles() {
  await db.sequelize.sync();
  const roles = ['student', 'staff', 'hod', 'ahod', 'principal', 'pet_staff'];
  for (const roleName of roles) {
    await db.Role.findOrCreate({ where: { name: roleName } });
  }
  console.log('Roles seeded successfully.');
  await db.sequelize.close();
}

seedRoles().catch(err => {
  console.error('Error seeding roles:', err);
  db.sequelize.close();
});
