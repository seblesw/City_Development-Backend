module.exports = (db, DataTypes) => {
  const LandOwner = db.define(
    "LandOwner",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "land_records", key: "id" },
      },
      // Optional fields:
      ownership_percentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        validate: {
          min: 0,
          max: 100,
        },
      },
      verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "land_owners",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ["user_id", "land_record_id"] },
        { fields: ["user_id"] },
        { fields: ["land_record_id"] },
      ],
    }
  );

  return LandOwner;
};