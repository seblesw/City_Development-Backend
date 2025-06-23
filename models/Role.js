const { Op } = require("sequelize");

module.exports = (db, DataTypes) => {
  const Role = db.define(
    "Role",
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
        unique: { msg: "ይህ ሚና ስም ቀደም ሲል ተመዝግቧል።" },
        validate: {
          notEmpty: { msg: "ሚና ስም ባዶ መሆን አይችልም።" },
          len: { args: [2, 50], msg: "ሚና ስም ከ2 እስከ 50 ቁምፊዎች መሆን አለበት።" },
          is: { args: /^[\u1200-\u137F\sA-Za-z0-9]+$/u, msg: "ሚና ስም ፊደል፣ ቁጥር ወይም ክፍተት ብቻ መያዝ አለበት።" },
        },
      },
      permissions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        validate: {
          isValidPermissions(value) {
            if (value && typeof value !== "object") {
              throw new Error("ፍቃዶች ትክክለኛ ጄሰን ነገር መሆን አለባቸው።");
            }
          },
        },
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "roles",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ["name"] },
        { fields: ["created_by"] },
        { fields: ["updated_by"], where: { updated_by: { [Op.ne]: null } } },
      ],
      hooks: {
        beforeCreate: async (role, options) => {
          // Validate created_by
          const creator = await db.models.User.findByPk(role.created_by, { transaction: options.transaction });
          if (!creator) throw new Error("ትክክለኛ ፈጣሪ ተጠቃሚ ይምረጡ።");

          // Ensure default role 'ተጠቃሚ' exists unless creating it
          if (role.name !== "ተጠቃሚ") {
            const defaultRole = await db.models.Role.findOne({
              where: { name: "ተጠቃሚ", deleted_at: { [Op.eq]: null } },
              transaction: options.transaction,
            });
            if (!defaultRole) {
              throw new Error("ነባሪ ሚና 'ተጠቃሚ' መጀመሪያ መፍጠር አለበት።");
            }
          }
        },
        beforeUpdate: async (role, options) => {
          // Validate updated_by if provided
          if (role.updated_by) {
            const updater = await db.models.User.findByPk(role.updated_by, { transaction: options.transaction });
            if (!updater) throw new Error("ትክክለኛ አዘምን ተጠቃሚ ይምረጡ።");
          }
        },
      },
    }
  );

  return Role;
};