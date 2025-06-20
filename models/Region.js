module.exports = (db, DataTypes) => {
  const Region = db.define(
    'Region',
    {
      id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          len: {
            args: [2, 100],
            msg: 'የክልል ስም ከ2 እስከ 100 ቁምፊዎች መሆን አለበት።'
          }
        }
      },
      name_translations: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          len: {
            args: [1, 20],
            msg: 'የክልል ኮድ ከ1 እስከ 20 ቁምፊዎች መሆን አለበት።'
          },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: 'የክልል ኮድ ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መሆን አለበት።'
          }
        }
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      },
    },
    {
      tableName: 'regions',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['code'], unique: true, where: { code: { [db.Sequelize.Op.ne]: null } } },
        { fields: ['name'] }
      ],
      hooks: {
        beforeCreate: async (region) => {
          if (!region.code) {
            region.code = region.name.toUpperCase().replace(/\s/g, '').slice(0, 10) + '-' + Math.random().toString(36).slice(-4);
          }
        }
      }
    }
  );

  return Region;
};