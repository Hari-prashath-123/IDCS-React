const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Bonafide = sequelize.define('Bonafide', {
    reason: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    Mstatus: {
      type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
      defaultValue: 'Pending',
      allowNull: false,
    },
    Astatus: {
      type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
      defaultValue: 'Pending',
      allowNull: false,
    },
    Hstatus: {
      type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
      defaultValue: 'Pending',
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    remarks: {
      type: DataTypes.STRING,
    },
    // studentId will be set up as association in index.js
  });
  return Bonafide;
};
