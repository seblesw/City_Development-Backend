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
        defaultValue: 'ተጠቃሚ',
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
        beforeCreate: async (role, options) => {
          // Ensure default role 'ተጠቃሚ' exists or is being created
          if (role.name !== 'ተጠቃሚ') {
            const defaultRole = await db.models.Role.findOne({
              where: { name: 'ተጠቃሚ' },
              transaction: options.transaction
            });
            if (!defaultRole) {
              throw new Error('ነባሪ ሚና ተጠቃሚ መጀመሪያ መፍጠር አለበት።');
            }
          }
        }
      }
    }
  );

  return Role;
};