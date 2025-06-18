module.exports = (db, DataTypes) => {
  const Region = db.define(
    'Region',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
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
        allowNull: true,
        validate: {
          len: {
            args: [1, 20],
            msg: 'የክልል ኮድ ከ1 እስከ 20 ቁምፊዎች መሆን አለበት።'
          },
          isAlphanumeric: {
            msg: 'የክልል ኮድ ፊደል እና ቁጥር ብቻ መሆን አለበት።'
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
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'regions',
      timestamps: true,
      paranoid: true,
      indexes: [
        { unique: true, fields: ['code'], where: { code: { [DataTypes.Op.ne]: null } } },
        { fields: ['name'] }
      ]
    }
  );

  return Region;
};