require('dotenv').config();
const { Sequelize } = require('sequelize');
const dbConfig = require('../config/db.config');

const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  dialect: dbConfig.dialect,
  logging: false,
});

const User = require('./user.model')(sequelize);
const Role = require('./role.model')(sequelize);
const Student = require('./student.model')(sequelize);
const Staff = require('./staff.model')(sequelize);
const Bonafide = require('./bonafide.model')(sequelize);
const Leave = require('./leave.model')(sequelize);
const OD = require('./od.model')(sequelize);
const Gatepass = require('./gatepass.model')(sequelize);

// Relationships
User.belongsTo(Role);
Role.hasMany(User);

Student.belongsTo(User);
User.hasOne(Student);

Staff.belongsTo(User);
User.hasOne(Staff);

Bonafide.belongsTo(Student, { foreignKey: 'userId' });
Student.hasMany(Bonafide, { foreignKey: 'userId' });

Leave.belongsTo(Student);
Student.hasMany(Leave);

OD.belongsTo(Student);
Student.hasMany(OD);

Gatepass.belongsTo(Student);
Student.hasMany(Gatepass);

Student.belongsTo(Staff, { as: 'mentor', foreignKey: 'mentorId' });
Student.belongsTo(Staff, { as: 'advisor', foreignKey: 'advisorId' });
Student.belongsTo(Staff, { as: 'hod', foreignKey: 'hodId' });

module.exports = {
  sequelize,
  User,
  Role,
  Student,
  Staff,
  Bonafide,
  Leave,
  OD,
  Gatepass,
};
