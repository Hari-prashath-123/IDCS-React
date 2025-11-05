
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./src/models');
const { User, Student, Staff, Role } = db;

function mapStaffPositionToRole(position) {
  const pos = position.toLowerCase();
  if (pos.includes('hod')) return 'hod';
  if (pos.includes('assistant') && pos.includes('hod')) return 'ahod';
  if (pos.includes('principal')) return 'principal';
  if (pos.includes('pet')) return 'pet_staff';
  return 'staff';
}

async function importUsers() {
  await db.sequelize.sync();
  const roles = await Role.findAll();
  const roleMap = {};
  roles.forEach(role => { roleMap[role.name] = role.id; });

  const filePath = path.join(__dirname, 'exported_data.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const transaction = await db.sequelize.transaction();
  try {
    // Import Students
      for (const student of data.students) {
        if (!student.reg_no) {
          console.warn('Skipping student with missing reg_no:', student);
          continue;
        }
        const user = await User.create({
          username: student.reg_no,
          email: `${student.reg_no}@example.com`,
          password: '123',
          roleId: roleMap['student'],
        }, { transaction });
        await Student.create({
          userId: user.id,
          reg_no: student.reg_no,
          roll: student.roll || student.reg_no || '',
          department: student.department || 'Unknown',
          section: student.section || '',
          name: student.name || student.first_name || 'Unknown',
          year: student.year || 1,
        }, { transaction });
      }
    // Import Staff
    for (const staff of data.staff) {
      if (!staff.staff_id) {
        console.warn('Skipping staff with missing staff_id:', staff);
        continue;
      }
      const roleName = mapStaffPositionToRole(staff.position);
      const user = await User.create({
        username: staff.staff_id,
        email: `${staff.staff_id}@example.com`,
        password: '123',
        roleId: roleMap[roleName],
      }, { transaction });
      await Staff.create({
        userId: user.id,
        staff_id: staff.staff_id,
        name: staff.name,
        position: staff.position,
        department: staff.department,
      }, { transaction });
    }
    await transaction.commit();
    console.log('Users imported successfully.');
  } catch (err) {
    await transaction.rollback();
    console.error('Error importing users:', err);
  } finally {
    await db.sequelize.close();
  }
}

importUsers();
