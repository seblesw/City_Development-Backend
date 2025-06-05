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
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      phone_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          is: /^\+?[1-9]\d{1,14}$/, 
        },
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "roles",
          key: "id",
        },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "administrative_units",
          key: "id",
        },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "users",
      timestamps: true,
      hooks: {
        beforeCreate: async (user) => {
          if (user.password_hash) {
            user.password_hash = await bcrypt.hash(user.password_hash, 10);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed("password_hash")) {
            user.password_hash = await bcrypt.hash(user.password_hash, 10);
          }
        },
      },
    }
  );

  User.prototype.validatePassword = async function (password) {
    return await bcrypt.compare(password, this.password_hash);
  };

  return User;
};
