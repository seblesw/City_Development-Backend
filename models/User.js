const bcrypt = require('bcryptjs');

module.exports = (db, DataTypes) => {
  const User = db.define(
    'User',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING(100),
        unique: true,
        allowNull: false,
        validate: {
          len: [2, 100],
        },
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          len: [8, 255],
        },
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
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          len: [2, 100],
        },
      },
      last_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          len: [2, 100],
        },
      },
      phone_number: {
        type: DataTypes.STRING(15),
        allowNull: true,
        validate: {
          len: [10, 15],
        },
      },
      alternative_phone_number: {
        type: DataTypes.STRING(15),
        allowNull: true,
        validate: {
          len: [10, 15],
        },
      },
      national_id: {
        type: DataTypes.STRING(20),
        unique: true,
        allowNull: true,
        validate: {
          len: [1, 20],
        },
      },
      marital_status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Single', 'Married']],
        },
      },
      spouse_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
          len: [2, 100],
        },
      },
      spouse_phone_number: {
        type: DataTypes.STRING(15),
        allowNull: true,
        validate: {
          len: [10, 15],
        },
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
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          len: [1, 50],
        },
      },
      address_block_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          len: [1, 50],
        },
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'id',
        },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'administrative_units',
          key: 'id',
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
      language_preference: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'users',
      timestamps: true,
      hooks: {
        beforeCreate: async (user) => {
          if (user.password_hash) {
            user.password_hash = await bcrypt.hash(user.password_hash, 10);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed('password_hash')) {
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