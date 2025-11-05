const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Leave = sequelize.define('Leave', {
    reason: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fromDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    toDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
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
  return Leave;
};
