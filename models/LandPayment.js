const PAYMENT_TYPES = {
  LEASE_PAYMENT: 'የኪራይ ክፍያ',
  TAX: 'ግብር',
  COMMERCIAL_SERVICE_FEE: 'የንግድ አገልግሎት ክፍያ',
  COMMUNITY_CONTRIBUTION: 'የማህበረሰብ አስተዋጽኦ',
  PENALTY: 'ቅጣት'
};

const PAYMENT_STATUSES = {
  PENDING: 'በመጠባበቅ ላይ',
  COMPLETED: 'ተጠናቋል',
  FAILED: 'አልተሳካም',
  CANCELLED: 'ተሰርዟል'
};

const PAYMENT_METHODS = {
  CASH: 'ጥሬ ገንዘብ',
  BANK_TRANSFER: 'የባንክ ማስተላለፍ',
  MOBILE_MONEY: 'የሞባይል ገንዘብ',
  ONLINE_PAYMENT: 'የመስመር ላይ ክፍያ'
};

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
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'land_records', key: 'id' }
      },
      payment_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_TYPES)],
            msg: 'የክፍያ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: {
            args: [0],
            msg: 'የክፍያ መጠን ከ0 በታች መሆን አይችልም።'
          }
        }
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ETB',
        validate: {
          isIn: {
            args: [['ETB', 'USD']],
            msg: 'የገንዘብ አይነት ትክክለኛ መሆን አለበት።'
          }
        }
      },
      payment_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PAYMENT_STATUSES.PENDING,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_STATUSES)],
            msg: 'የክፍያ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_METHODS)],
            msg: 'የክፍያ ዘዴ ከተፈቀደው እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
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
        allowNull: true,
        validate: {
          len: {
            args: [0, 50],
            msg: 'የግብይት ማጣቀሻ ትክክለኛ መሆን አለበት።'
          }
        }
      },
      external_payment_id: {
        type: DataTypes.STRING,
        allowNull: true
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      payment_history: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
      },
      recorded_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      },

    },
    {
      tableName: 'land_payments',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['transaction_reference'], unique: true, where: { transaction_reference: { [db.Sequelize.Op.ne]: null } } },
        { fields: ['land_record_id'] },
        { fields: ['recorded_by'] },
        { fields: ['payment_status'] }
      ],
      validate: {
        validPaymentDates() {
          if (this.payment_date > this.payment_due_date) {
            throw new Error('የክፍያ ቀን ከክፍያ ተጠናቀቀበት ቀን በፊት መሆን አለበት።');
          }
        },
        async validateApplicationConsistency() {
          const application = await db.models.Application.findOne({ where: { land_payment_id: this.id } });
          if (application && application.land_record_id && application.land_record_id !== this.land_record_id) {
            throw new Error('የክፍያ እና የመጠየቂያ መሬት መዝገብ መጣጣም አለባቸው።');
          }
        }
      },
      hooks: {
        beforeUpdate: async (payment) => {
          if (payment.changed('payment_status')) {
            payment.payment_history = [
              ...(payment.payment_history || []),
              {
                status: payment.payment_status,
                changed_by: payment.updated_by,
                changed_at: new Date()
              }
            ];
          }
        }
      }
    }
  );

  return LandPayment;
};