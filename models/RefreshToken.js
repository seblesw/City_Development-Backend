module.exports = (db, DataTypes) => {
  const RefreshToken = db.define(
    'RefreshToken',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: {
            msg: 'የማደስ ቶከን ባዶ መሆን አይችልም።'
          }
        }
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: {
            msg: 'የማብቂያ ቀን ትክክለኛ መሆን አለበት።'
          }
        }
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
    },
    {
      tableName: 'refresh_tokens',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ['token'] },
        { fields: ['user_id'] }
      ],
      hooks: {
        beforeCreate: (token) => {
          if (!token.expires_at) {
            token.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
          }
        }
      }
    }
  );

  return RefreshToken;
};