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

      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'roles',
      timestamps: true,
    }
  );

  return Role;
};