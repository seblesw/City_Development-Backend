const bcrypt = require("bcryptjs");

module.exports = (db, DataTypes) => {
  const User = db.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "ሙሉ ስም ባዶ መሆን አዯችልም።" },
          len: { args: [2, 100], msg: "ሙሉ ስም ከ2 እስከ 100 ቁምፊዎች መሆን አለበት።" }
        }
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: { msg: "ትክክለኛ ኢሜይል ያስገቡ።" } }
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          is: { args: [/^\+251[79]\d{8}$/], msg: "ትክክለኛ ስልክ ቁጥር ያስገቡ (+2517... ወይም +2519...)።" }
        }
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: "ብሔራዊ መታወቂያ ቁጥር ባዶ መሆን አዯችልም።" },
          len: { args: [5, 50], msg: "ብሔራ�ዊ መታወቂያ ቁጥር ከ5 እስከ 50 ቁምፊዎች መሆን አለቘ።" },
          is: { args: /^[A-Za-z0-9-]+$/, msg: "ብሔራዊ መታወቂያ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መሆን አለበት።" }
        }
      },
      marital_status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["ነጠላ", "ባለትዳር", "ቤተሰብ", "ጋራ ባለቤትነት"]],
            msg: "የጋብቻ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["ሴት", "ወንድ", "ሌላ"]],
            msg: "ጾታ ከተፈቀዱት እሴቶች (ሴት፣ ወንድ፣ ሌላ) ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" }
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "roles", key: "id" }
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      last_login: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: "users",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["email"], unique: true },
        { fields: ["phone_number"], unique: true },
        { fields: ["national_id"], unique: true },
        { fields: ["role_id"] },
        { fields: ["administrative_unit_id"] }
      ],
      hooks: {
        beforeCreate: async (user, options) => {
          if (user.password) {
            user.password = await bcrypt.hash(user.password, 10);
          }
          // Validate co-owner count based on marital status
          const coOwnersCount = await db.models.CoOwner.count({
            where: { user_id: user.id },
            transaction: options.transaction
          });
          if (user.marital_status === "ባለትዳር" && coOwnersCount !== 1) {
            throw new Error("ባለትዳር ተጠቃሚ በትክክል አንድ የጋራ ባለቤት መኖር አለበት።");
          } else if (user.marital_status === "ጋራ ባለቤትነት" && coOwnersCount < 1) {
            throw new Error("ጋራ ባለቤትነት ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።");
          } else if (user.marital_status === "ቤተሰብ" && coOwnersCount < 1) {
            throw new Error("ቤተሰብ ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።");
          } else if (user.marital_status === "ነጠላ" && coOwnersCount > 0) {
            throw new Error("ነጠላ ተጠቃሚ የጋራ ባለቤት መኖር አዯችልም።");
          }
        },
        beforeUpdate: async (user, options) => {
          if (user.changed("password") && user.password) {
            user.password = await bcrypt.hash(user.password, 10);
          }
          if (user.changed("marital_status")) {
            const coOwnersCount = await db.models.CoOwner.count({
              where: { user_id: user.id },
              transaction: options.transaction
            });
            if (user.marital_status === "ባለትዳር" && coOwnersCount !== 1) {
              throw new Error("ባለትዳር ተጠቃሚ በትክክል አንድ የጋራ ባለቤት መኖር አለበት።");
            } else if (user.marital_status === "ጋራ ባለቤትነት" && coOwnersCount < 1) {
              throw new Error("ጋራ ባለቤትነት ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።");
            } else if (user.marital_status === "ቤተሰብ" && coOwnersCount < 1) {
              throw new Error("ቤተሰብ ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።");
            } else if (user.marital_status === "ነጠላ" && coOwnersCount > 0) {
              throw new Error("ነጠላ ተጠቃሚ የጋራ ባለቤት መኖር አዯችልም።");
            }
          }
        }
      }
    }
  );

  User.prototype.validatePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
  };

  return User;
};