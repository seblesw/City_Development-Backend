const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");

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
        unique: { msg: "ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።" },
        validate: {
          isEmail: { msg: "ትክክለኛ ኢሜይል ያስገቡ።" },
        },
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: { msg: "ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።" },
        validate: {
          is: {
            args: [/^\+251[79]\d{8}$/],
            msg: "ትክክለኛ ስልክ ቁጥር ያስገቡ (+2517... ወይም +2519...)።",
          },
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "roles", key: "id" },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" },
      },
      oversight_office_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "oversight_offices", key: "id" },
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: { msg: "ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።" },
        validate: {
          notEmpty: { msg: "ብሔራዊ መታወቂያ ቁጥር ባዶ መሆን አይችልም።" },
          len: { args: [5, 50], msg: "ብሔራዊ መታወቂያ ቁጥር ከ5 እስከ 50 ቁምፊዎች መሆን አለበት።" },
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
            args: [["ወንድ", "ሴት", "ሌላ"]],
            msg: "ጾታ ከተፈቀዱት እሴቶች (ወንድ, ሴት, ሌላ) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      marital_status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["ነጠላ", "ባለትዳር", "ፍቺ", "ባልዋይ"]],
            msg: "የጋብቻ ሁኔታ ከተፈቀዱት እሴቶች (ነጠላ, ባለትዳር, ፍቺ, ባልዋይ) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      relationship_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [["የትዳር ጓደኛ", "ልጅ", "ወላጅ", "ወንድም/እህት", "ሌላ"]],
            msg: "የግንኙነት አይነት ከተፈቀዱት እሴቶች (የትዳር ጓደኛ, ልጅ, ወላጅ, ወንድም/እህት, ሌላ) ውስጥ አንዱ መሆን አለበት።",
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
      freezeTableName: true,
      indexes: [
        { fields: ["email"], unique: true, where: { email: { [Op.ne]: null } } },
        { fields: ["phone_number"], unique: true, where: { phone_number: { [Op.ne]: null } } },
        { fields: ["national_id"], unique: true },
        { fields: ["role_id"], where: { role_id: { [Op.ne]: null } } },
        { fields: ["administrative_unit_id"] },
        { fields: ["oversight_office_id"], where: { oversight_office_id: { [Op.ne]: null } } },
        { fields: ["primary_owner_id"], where: { primary_owner_id: { [Op.ne]: null } } },
        { fields: ["is_active"] },
      ],
      hooks: {
        beforeCreate: async (user, options) => {
          const adminUnit = await db.models.AdministrativeUnit.findByPk(user.administrative_unit_id, {
            transaction: options.transaction,
          });
          if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");

          if (!user.email && !user.phone_number) {
            throw new Error("ኢሜይል ወይም ስልክ ቁጥር ከነዚህ ውስጥ አንዱ መግባት አለበት።");
          }

          if (!user.password && !user.primary_owner_id) {
            user.password = await bcrypt.hash("12345678", 10);
          }

          if (user.primary_owner_id && user.password) {
            throw new Error("የጋራ ባለቤቶች የይለፍ ቃል መኖር አይችልም።");
          }

          if (user.primary_owner_id) {
            const primaryOwner = await User.findByPk(user.primary_owner_id, { transaction: options.transaction });
            if (!primaryOwner || primaryOwner.primary_owner_id !== null) {
              throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
            }
          }
        },
        beforeUpdate: async (user, options) => {
          if (user.changed("administrative_unit_id")) {
            const adminUnit = await db.models.AdministrativeUnit.findByPk(user.administrative_unit_id, {
              transaction: options.transaction,
            });
            if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
          }

          if (user.changed("email") || user.changed("phone_number")) {
            if (!user.email && !user.phone_number) {
              throw new Error("ኢሜይል ወይም ስልክ ቁጥር ከነዚህ ውስጥ አንዱ መግባት አለበት።");
            }
          }

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