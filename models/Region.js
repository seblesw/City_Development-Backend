//models/Region.js
module.exports = (db, DataTypes) => {
  const Region = db.define(
    'Region',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          len: [2, 100],
        },
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
        validate: {
          len: [1, 20],
        },
      },
    },
    {
      tableName: 'regions',
      timestamps: true,
    }
  );

  return Region;
};