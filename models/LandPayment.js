// models/LandPayment.js
module.exports = (db, DataTypes) => {
  const LandPayment = db.define(
    'LandPayment',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'land_records',
          key: 'id',
        },
      },
      payment_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Lease Fee', 'Tax', 'Commercial Service Fee', 'Community Contribution', 'Penalty']],
        },
      },
      amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          isFloat: true,
          min: 0,
        },
      },
      total_lease_value: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          isFloat: true,
          min: 0,
        },
      },
      lease_duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          isInt: true,
          min: 0,
        },
      },
      lease_start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      lease_end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      lease_status: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['Active', 'Expired', 'Terminated']],
        },
      },
      payment_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      payment_due_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      payment_status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Not Paid', 'Paid', 'Partial', 'Overdue', 'Refunded']],
        },
      },
      pre_payment: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          isFloat: true,
          min: 0,
        },
      },

      remaining_payment: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          isFloat: true,
          min: 0,
        },
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['Cash', 'Bank Transfer', 'Mobile Payment', 'Cheque']],
        },
      },
      transaction_reference: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          len: [1, 50],
        },
      },
      recorded_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'land_payments',
      timestamps: true,
      indexes: [
        { fields: ['land_record_id'] },
        { fields: ['payment_status'] },
      ],
    }
  );

  return LandPayment;
};