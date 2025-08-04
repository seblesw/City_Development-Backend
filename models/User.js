const { Op } = require("sequelize");
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
          len: { args: [2, 50], msg: "ስም ከ2 እስከ 50 ፊደል መሆን አለበት።" },
        },
      },
      middle_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የ አባት  ስም ከ0 እስከ 50 ፊደል መሆን አለበት።" },
        },
      },
      last_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የ አያት ስም ባዶ መሆን አይችልም።" },
          len: { args: [2, 50], msg: "የ አያት ስም ከ2 እስከ 50 ፊደል መሆን አለበት።" },
        },
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: { msg: "ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።" },
        validate: {
          isEmail: { msg: "ትክክለኛ ኢሜይል ያስገቡ።" },
        },
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: { msg: "ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።" },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      resetPasswordToken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      resetPasswordExpires: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "roles", key: "id" },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "administrative_units", key: "id" },
      },
      oversight_office_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "oversight_offices", key: "id" },
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: { msg: "ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።" },
        validate: {
          notEmpty: { msg: "ብሔራዊ መታወቂያ ቁጥር ባዶ መሆን አይችልም።" },
          len: {
            args: [3, 50],
            msg: "ብሔራዊ መታወቂያ ቁጥር ከ3 እስከ 50 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [["ወንድ", "ሴት"]],
            msg: "ጾታ ከተፈቀዱት (ወንድ, ሴት) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      relationship_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [["የትዳር ጓደኛ", "ልጅ", "ወላጅ", "ወንድም", "እህት", "ሌላ"]],
            msg: "የግንኙነት አይነት ከተፈቀዱት እሴቶች (የትዳር ጓደኛ, ልጅ, ወላጅ, ወንድም, እህት, ሌላ) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      marital_status: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [["ያላገባ/ች", "ባለትዳር"]],
            msg: "የጋብቻ ሁኔታ ከተፈቀዱት  (ያላገባ/ች, ባለትዳር,) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      last_login: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      otp: {
        type: DataTypes.STRING,
      }, // Stores the OTP
      otpExpiry: {
        type: DataTypes.DATE,
      }, // OTP expiry time
      isFirstLogin: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      }, 
    },
    {
      tableName: "users",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      deletedAt: "deletedAt",
      indexes: [
        {
          fields: ["email"],
          unique: true,
          where: { email: { [Op.ne]: null } },
        },
        {
          fields: ["phone_number"],
          unique: true,
          where: { phone_number: { [Op.ne]: null } },
        },
        { fields: ["national_id"], unique: true },
        { fields: ["role_id"], where: { role_id: { [Op.ne]: null } } },
        { fields: ["administrative_unit_id"] },
        {
          fields: ["oversight_office_id"],
          where: { oversight_office_id: { [Op.ne]: null } },
        },
        { fields: ["is_active"] },
        { fields: ["createdAt"] },
        { fields: ["deletedAt"], where: { deletedAt: { [Op.ne]: null } } },
      ],
    }
  );
  return User;
};
