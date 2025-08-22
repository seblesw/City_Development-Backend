const { Op } = require("sequelize");

module.exports = (db, DataTypes) => {
  const Zone = db.define(
    "Zone",
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
      },
      region_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "regions", key: "id" },
      },
    },
    {
      tableName: "zones",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["code"], unique: true },
        { fields: ["name", "region_id"], unique: true },
        { fields: ["region_id"] },
      ],
    }
  );

  return Zone;
};