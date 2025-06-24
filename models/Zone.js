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
        validate: { is: /^[A-Z]{3}-Z\d+$/ },
      },
      region_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "regions", key: "id" },
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    deleted_at:{
      type: DataTypes.DATE,
      allowNull:true,
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
      hooks: {
        beforeCreate: async (zone, options) => {
          const region = await db.models.Region.findByPk(zone.region_id, { transaction: options.transaction });
          if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");
          const count = await db.models.Zone.count({
            where: { region_id: zone.region_id },
            transaction: options.transaction,
          });
          zone.code = `${region.code}-Z${count + 1}`;
        },
      },
    }
  );

  return Zone;
};