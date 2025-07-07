const { Op } = require("sequelize");

module.exports = (db, DataTypes) => {
  const OversightOffice = db.define(
    "OversightOffice",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      region_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "regions", key: "id" },
      },
      zone_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "zones", key: "id" },
      },
      woreda_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "woredas", key: "id" },
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { len: [2, 100] },
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: { len: [1, 50] },
      },
    },
    {
      tableName: "oversight_offices",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ["code"],},
        { unique: true, fields: ["name", "region_id"],},
        { fields: ["region_id"] },
        { fields: ["zone_id"], where: { zone_id: { [Op.ne]: null } } },
        { fields: ["woreda_id"], where: { woreda_id: { [Op.ne]: null } } },
      ],
    }
  );
  return OversightOffice;
};