const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Role = sequelize.define('Role', {
    name: {
      type: DataTypes.ENUM('student', 'staff', 'hod', 'ahod', 'principal', 'pet_staff'),
      allowNull: false,
      unique: true,
    },
  });
  return Role;
};
