const { Op } = require("sequelize");

module.exports = (db, DataTypes) => {
  const AdministrativeUnit = db.define(
    "AdministrativeUnit",
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
      oversight_office_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "oversight_offices", key: "id" },
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { len: [2, 100] },
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [["ሪጂኦፖሊታን", "መካከለኛ ከተማ", "አነስተኛ ከተማ", "መሪ ማዘጋጃ ከተማ", "ንዑስ ማዘጋጃ ከተማ", "ታዳጊ ከተማ"]],
        },
      },
      unit_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 6 },
        set(value) {
          const typeLevels = {
            "ሪጂኦፖሊታን": 1,
            "መካከለኛ ከተማ": 2,
            "አነስተኛ ከተማ": 3,
            "መሪ ማዘጋጃ ከተማ": 4,
            "ንዑስ ማዘጋጃ ከተማ": 5,
            "ታዳጊ ከተማ": 6,
          };
          this.setDataValue("unit_level", typeLevels[this.type] || value);
        },
      },
      max_land_levels: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1 },
        set(value) {
          const levelMap = { 1: 5, 2: 5, 3: 5, 4: 4, 5: 3, 6: 2 };
          this.setDataValue("max_land_levels", levelMap[this.unit_level] || value);
        },
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
      tableName: "administrative_units",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ["code"], where: { deleted_at: { [Op.eq]: null } } },
        { unique: true, fields: ["name", "region_id", "oversight_office_id"], where: { deleted_at: { [Op.eq]: null } } },
        { fields: ["region_id"] },
        { fields: ["zone_id"], where: { zone_id: { [Op.ne]: null } } },
        { fields: ["woreda_id"], where: { woreda_id: { [Op.ne]: null } } },
        { fields: ["oversight_office_id"], where: { oversight_office_id: { [Op.ne]: null } } },
      ],
      hooks: {
        beforeCreate: async (unit, options) => {
          const region = await db.models.Region.findByPk(unit.region_id, { transaction: options.transaction });
          if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");
          const zone = unit.zone_id ? await db.models.Zone.findByPk(unit.zone_id, { transaction: options.transaction }) : null;
          const woreda = unit.woreda_id ? await db.models.Woreda.findByPk(unit.woreda_id, { transaction: options.transaction }) : null;
          const oversight = unit.oversight_office_id ? await db.models.OversightOffice.findByPk(unit.oversight_office_id, { transaction: options.transaction }) : null;
          if (unit.oversight_office_id && (!oversight || oversight.region_id !== unit.region_id)) throw new Error("ትክክለኛ ቢሮ ይምረጡ።");
          const count = await db.models.AdministrativeUnit.count({ transaction: options.transaction });
          unit.code = `${region.code}-${zone?.code.split("-")[1] || "NZ"}-${woreda?.code.split("-")[2] || "NW"}-AU${count + 1}`;
          const existing = await db.models.AdministrativeUnit.findOne({
            where: { code: unit.code },
            transaction: options.transaction,
          });
          if (existing) throw new Error("የክፍል ኮድ ተይዟል።");
        },
        beforeUpdate: async (unit, options) => {
          if (unit.changed("code")) {
            const existing = await db.models.AdministrativeUnit.findOne({
              where: { code: unit.code, id: { [Op.ne]: unit.id } },
              transaction: options.transaction,
            });
            if (existing) throw new Error("የክፍል ኮድ ተይዟል።");
          }
          if (unit.changed("oversight_office_id")) {
            const oversight = unit.oversight_office_id ? await db.models.OversightOffice.findByPk(unit.oversight_office_id, { transaction: options.transaction }) : null;
            if (unit.oversight_office_id && (!oversight || oversight.region_id !== unit.region_id)) throw new Error("ትክክለኛ ቢሮ ይምረጡ።");
          }
        },
      },
    }
  );

  return AdministrativeUnit;
};