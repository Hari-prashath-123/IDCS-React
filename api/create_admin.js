// api/create_admin.js
const bcrypt = require('bcryptjs');
const db = require('./src/models');

// Get args from command line
const args = process.argv.slice(2);
const username = args[0];
const email = args[1];
const password = args[2];

if (!username || !email || !password) {
  console.error('Usage: node create_admin.js <username> <email> <password>');
  process.exit(1);
}

const createAdmin = async () => {
  await db.sequelize.sync();
  const transaction = await db.sequelize.transaction();
  try {
    // 1. Find the 'principal' role
    const principalRole = await db.Role.findOne({ where: { name: 'principal' } });
    if (!principalRole) {
      console.error("Error: 'principal' role not found.");
      console.error("Please run 'node seed_roles.js' first.");
      await transaction.rollback();
      return;
    }
    // 2. Hash the password
    const hashedPassword = bcrypt.hashSync(password, 8);
    // 3. Create the new User
    const newUser = await db.User.create({
      username: username,
      email: email,
      password: hashedPassword,
      roleId: principalRole.id
    }, { transaction });
    // 4. Create the associated Staff profile
    await db.Staff.create({
      staffId: username,
      name: username,
      position: 'Principal',
      department: 'Administration',
      userId: newUser.id
    }, { transaction });
    // 5. Commit
    await transaction.commit();
    console.log(`✅ Success! Admin user '${username}' created with the 'principal' role.`);
  } catch (err) {
    await transaction.rollback();
    console.error('Error creating admin user:', err);
  } finally {
    await db.sequelize.close();
  }
};

createAdmin();
