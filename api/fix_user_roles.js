require('dotenv').config();
const db = require('./src/models');

async function fixUserRoles() {
  await db.sequelize.sync();
  try {
    // Get all roles and build a map
    const roles = await db.Role.findAll();
    const roleMap = {};
    roles.forEach(role => { roleMap[role.name] = role.id; });

    // Find all users with null RoleId
    const users = await db.User.findAll({ where: { RoleId: null } });
    for (const user of users) {
      // Guess role based on username pattern (customize as needed)
      let roleId = null;
      if (/^\d+$/.test(user.username)) {
        roleId = roleMap['student'];
      } else if (/^ADA|^STAFF/.test(user.username)) {
        roleId = roleMap['staff'];
      } else {
        roleId = roleMap['student']; // Default fallback
      }
      if (roleId) {
        await user.update({ RoleId: roleId });
        console.log(`Updated user ${user.username} with RoleId ${roleId}`);
      } else {
        console.warn(`Could not determine role for user ${user.username}`);
      }
    }
  } catch (err) {
    console.error('Error updating user roles:', err);
  } finally {
    await db.sequelize.close();
  }
}

fixUserRoles();
