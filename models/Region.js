module.exports = (db, DataTypes) => {
  const Region = db.define(
    "Region",
    {
      id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          len: {
            args: [2, 100],
            msg: "የክልል ስም ከ2 እስከ 100 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          len: {
            args: [1, 20],
            msg: "የክልል ኮድ ከ1 እስከ 20 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
    },

    {
      tableName: "regions",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        {
          fields: ["code"],
          unique: true,
          where: { code: { [db.Sequelize.Op.ne]: null } },
        },
        { fields: ["name"] },
      ],
    }
  );

  return Region;
};
