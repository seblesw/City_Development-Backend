module.exports = (db, DataTypes) => {
  const GlobalNoticeSchedule = db.define(
    "GlobalNoticeSchedule",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: { len: [1, 1000] },
      },
      scheduled_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "global_notice_schedules",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["scheduled_date"] },
        { fields: ["is_active"] },
      ],
    }
  );

  return GlobalNoticeSchedule;
};