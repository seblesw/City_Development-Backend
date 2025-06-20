module.exports = (db, DataTypes) => {
  const Role = db.define(
    'Role',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
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
        defaultValue: {}
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
      }
    },
    {
      tableName: 'roles',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ['name'] }
      ],
      hooks: {
        afterSync: async (options) => {
          const defaultRole = {
            name: 'ተጠቃሚ',
            // permissions: {
            //   view_own_records: true,
            //   submit_application: true
            // },
          };
          await db.models.Role.findOrCreate({
            where: { name: defaultRole.name },
            defaults: defaultRole,
            transaction: options.transaction
          });
        }
      }
    }
  );

  return Role;
};