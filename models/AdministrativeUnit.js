
module.exports= (db, DataTypes) => {
  const AdministrativeUnit = db.define(
    "AdministrativeUnit",
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
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "administrative_units",
          key: "id",
        },
      },
    },
    {
      tableName: "administrative_units",
      timestamps: true,
    }
  );

  return AdministrativeUnit;
}