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
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Region', 'Regiopolitan', 'Kifle Ketema','Zone City', 'Woreda city', 'Meri','Newus','Tadagi']],
        },
      },
      parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'administrative_units',
          key: 'id',
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