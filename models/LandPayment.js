module.exports = (db, DataTypes) => {
  const LandPayment = db.define(
    'LandPayment',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      payment_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['የኪራይ ክፍያ', 'ግብር', 'የንግድ አገልግሎት ክፍያ', 'የማህበረሰብ አስተዋጽኦ', 'ቅጣቡ']]
        }
      },
      amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: { min: 0 }
      },
      payment_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      payment_due_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      transaction_reference: {
        type: DataTypes.STRING,
        allowNull: true
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'land_payments',
      timestamps: true,
      indexes: [
        { fields: ['transaction_reference'] }
      ]
    }
  );

  return LandPayment;
};