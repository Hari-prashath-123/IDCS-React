const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Gatepass = sequelize.define('Gatepass', {
    reason: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    outTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    inTime: {
      type: DataTypes.DATE,
    },
    status: {
      type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
      defaultValue: 'Pending',
      allowNull: false,
    },
    remarks: {
      type: DataTypes.STRING,
    },
    // studentId will be set up as association in index.js
  });
  return Gatepass;
};
