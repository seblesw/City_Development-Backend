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
      first_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      middle_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      last_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      alternative_phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      national_id: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
      },

      marital_status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [["Single", "Married", "family"]],
        },
      },

      spouse_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      spouse_phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      profile_picture: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      spouse_profile_picture: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address_kebele: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address_block_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address_special_name: {
        type: DataTypes.STRING,
        allowNull: true,
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
      last_login: {
        type: DataTypes.DATE,
        allowNull: true,
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
