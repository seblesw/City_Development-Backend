const { Op } = require("sequelize");

module.exports = (db, DataTypes) => {
  const Woreda = db.define(
    "Woreda",
    {
      id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { len: [2, 100] },
      },
      code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { is: /^[A-Z]{3}-Z\d+-W\d+$/ },
      },
      zone_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "zones", key: "id" },
      },
    },
    {
      tableName: "woredas",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["code"], unique: true, },
        { fields: ["name", "zone_id"], unique: true, },
        { fields: ["zone_id"] },
      ],
      
    }
  );

  return Woreda;
};