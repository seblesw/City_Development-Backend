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
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Region', 'Zone City', 'Woreda city', 'Meri','Newus','Tadagi']],
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
        type: DataTypes.STRING(20),
        unique: true,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
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