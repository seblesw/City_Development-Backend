module.exports = (db, DataTypes) => {
  const Role = db.define(
    'Role',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          len: {
            args: [2, 50],
            msg: 'የሚና ስም ከ2 እስከ 50 ቁምፊዎች መሆን አለበት።'
          }
        }
      },
      permissions: {
        type: DataTypes.JSON,
        allowNull: true,
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
      tableName: 'roles',
      timestamps: true,
      paranoid: true,
      indexes: [
        { unique: true, fields: ['name'] }
      ]
    }
  );

  return Role;
};