module.exports = (db, DataTypes) => {
  const AdministrativeUnit = db.define(
    'AdministrativeUnit',
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
          notEmpty: true,
          len: [2, 100],
        },
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
      },
    },
    {
      tableName: 'administrative_units',
      timestamps: true,
    }
  );

  return AdministrativeUnit;
};