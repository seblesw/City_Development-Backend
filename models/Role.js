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
        defaultValue: "ተጠቃሚ",
        unique: { msg: "ይህ ሚና ስም ቀደም ሲል ተመዝግቧል።" },
        validate: {
          notEmpty: { msg: "ሚና ስም ባዶ መሆን አይችልም።" },
          len: { args: [2, 50], msg: "ሚና ስም ከ2 እስከ 50 ቁምፊዎች መሆን አለበት።" },
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
    },
    {
      tableName: "roles",
      freezeTableName: true,
    }
  );

  return Role;
};