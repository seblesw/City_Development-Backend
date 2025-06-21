// models/User.js
const bcrypt = require("bcryptjs");

module.exports = (db, DataTypes) => {
  const User = db.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      first_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "ስም ባዶ መሆን አይችልም።" },
          len: { args: [2, 50], msg: "ስም ከ2 እስከ 50 ቁምፊዎች መሆን አለበት።" },
        },
      },
      last_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የአባት ስም ባዶ መሆን አይችልም።" },
          len: { args: [2, 50], msg: "የአባት ስም ከ2 እስከ 50 ቁምፊዎች መሆን አለበት።" },
        },
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: { isEmail: { msg: "ትክክለኛ ኢሜይል ያስገቡ።" } },
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          is: {
            args: [/^\+251[79]\d{8}$/],
            msg: "ትክክለኛ ስልክ ቁጥር ያስገቡ (+2517... ወይም +2519...)።",
          },
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true, // Nullable for landowners
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // Nullable for landowners
        references: { model: "roles", key: "id" },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" },
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: "ብሔራዊ መታወቂያ ቁጥር ባዶ መሆን አይችልም።" },
          len: {
            args: [5, 50],
            msg: "ብሔራዊ መታወቂያ ቁጥር ከ5 እስከ 50 ቁምፊዎች መሆን አለበት።",
          },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "ብሔራዊ መታወቂያ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መሆን አለበት።",
          },
        },
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["ሴት", "ወንድ", "ሌላ"]],
            msg: "ጾታ ከተፈቀዱት እሴቶች (ሴት፣ ወንድ፣ ሌላ) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      marital_status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["ነጠላ", "ባለትዳር", "ቤተሰብ", "የጋራ ባለቤትነት"]],
            msg: "የጋብቻ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      relationship_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [["የትዳር ጓደኛ", "ልጅ", "ወላጅ", "ወንድም/እህት", "ሌላ"]],
            msg: "የግንኙነት አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      primary_owner_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_login: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "users",
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ["email"], unique: true, where: { email: { [db.Op.ne]: null } } },
        { fields: ["phone_number"], unique: true, where: { phone_number: { [db.Op.ne]: null } } },
        { fields: ["national_id"], unique: true },
        { fields: ["role_id"], where: { role_id: { [db.Op.ne]: null } } },
        { fields: ["administrative_unit_id"] },
        { fields: ["primary_owner_id"], where: { primary_owner_id: { [db.Op.ne]: null } } },
      ],
      hooks: {
        beforeCreate: async (user) => {
          if (user.password) {
            user.password = await bcrypt.hash(user.password, 10);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed("password") && user.password) {
            user.password = await bcrypt.hash(user.password, 10);
          }
        },
      },
    }
  );


  User.prototype.validatePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
  };

  return User;
};