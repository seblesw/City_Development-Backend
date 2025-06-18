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
            msg: 'የልል ስም ከ2 እስከ 100 ቁምፊዎች መሆ�ኖር አለበት።'
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
            msg: 'የልል ኮድ ከ1 እስከ 20 ቁምፊዎች መሆአለበት።'
          },
          isAlphanumeric: {
            msg: 'የልል ኮድ ፊደል እና ቁጥር ብቻ መሆን አለበት።'
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
      ]
    }
  );

  return Region;
};