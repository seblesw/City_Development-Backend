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
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
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
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "የክልል ኮድ ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መሆን አለበት።",
          },
        },
      },
    },

    {
      tableName: "regions",
      timestamps: true,
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
