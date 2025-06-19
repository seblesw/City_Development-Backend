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
          notEmpty: { msg: "ሙሉ ስም ባዶ መሆን አይችልም።" },
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
          is: { args: [/^\+251[79]\d{8}$/], msg: "ትክክለኛ ስልክ ቁጥር ያስገቡ።" }
        }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
      },
    },
    {
      tableName: "users",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['email'], unique: true },
        { fields: ['phone_number'], unique: true },
        { fields: ['role_id'] }
      ],
      hooks: {
        beforeCreate: async (user) => {
          if (user.password) {
            user.password = await bcrypt.hash(user.password, 10);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed("password")) {
            user.password = await bcrypt.hash(user.password, 10);
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