
module.exports = (db, DataTypes) => {
  const PaymentSchedule = db.define(
    "PaymentSchedule",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      land_payment_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "land_payments", key: "id" },
      },
      expected_amount: {
        type: DataTypes.DECIMAL,
        allowNull: false,
        validate: { min: 0 },
      },
      due_date: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: { isDate: true },
      },
      grace_period_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
        validate: { min: 0 },
      },
      penalty_rate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 0.07,
        validate: { min: 0 },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      related_schedule_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "payment_schedules", key: "id" },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: { len: [0, 500] },
      },
    },
    {
      tableName: "payment_schedules",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["land_payment_id"] },
        { fields: ["related_schedule_id"] },
        { fields: ["due_date"] },
        { fields: ["is_active"] },
      ],
    }
  );

  return PaymentSchedule;
};
