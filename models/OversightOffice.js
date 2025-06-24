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
      hooks: {
        beforeCreate: async (office, options) => {
          const region = await db.models.Region.findByPk(office.region_id, { transaction: options.transaction });
          if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");
          const zone = office.zone_id ? await db.models.Zone.findByPk(office.zone_id, { transaction: options.transaction }) : null;
          const woreda = office.woreda_id ? await db.models.Woreda.findByPk(office.woreda_id, { transaction: options.transaction }) : null;
          const count = await db.models.OversightOffice.count({ transaction: options.transaction });
          office.code = `${region.code}-${zone?.code.split("-")[1] || "NZ"}-${woreda?.code.split("-")[2] || "NW"}-OF${count + 1}`;
          const existing = await db.models.OversightOffice.findOne({
            where: { code: office.code },
            transaction: options.transaction,
          });
          if (existing) throw new Error("የቢሮ ኮድ ተይዟል።");
        },
        beforeUpdate: async (office, options) => {
          if (office.changed("code")) {
            const existing = await db.models.OversightOffice.findOne({
              where: { code: office.code, id: { [Op.ne]: office.id } },
              transaction: options.transaction,
            });
            if (existing) throw new Error("የቢሮ ኮድ ተይዟል።");
          }
        },
      },
    }
  );

  return OversightOffice;
};