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
      application_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'applications', key: 'id' }
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
            msg: 'የክፍያ መጠን ከ0 በታች መሆን አይቻልም።'
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
            msg: 'የገንዘብ አይነት ትክክለኛ መሆን አለበት (ETB ወይም USD)።'
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
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_METHODS)],
            msg: 'የክፍያ ዘዴ ከተፈቀደው እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      payment_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          isDate: { msg: 'ትክክለኛ የክፍያ ቀን ያስገቡ (YYYY-MM-DD)።' },
          notFutureDate(value) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (new Date(value) > today) {
              throw new Error('የክፍያ ቀን ወደፊት መሆን አይቻልም።');
            }
          }
        }
      },
      payment_due_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        validate: {
          isDate: { msg: 'ትክክለኛ የክፍያ ተጠናቀቀበት ቀን ያስገቡ (YYYY-MM-DD)።' }
        }
      },
      transaction_reference: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          len: {
            args: [0, 50],
            msg: 'የግብይት ማጣቀሻ ከ50 ቁምፊዎች መብለጥ አይቻልም።'
          }
        }
      },
      external_payment_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          len: {
            args: [0, 50],
            msg: 'የውጭ ክፍያ መለያ ከ50 ቁምፊዎች መብለጥ አይቻልም።'
          }
        }
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 500],
            msg: 'መግለጫ ከ500 ቁምፊዎች መብለጥ አይቻልም።'
          }
        }
      },
      payment_history: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
      }
    },
    {
      tableName: 'land_payments',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['application_id'] },
        { fields: ['payment_type'] },
        { fields: ['payment_status'] },
        { fields: ['transaction_reference'], unique: true, where: { transaction_reference: { [db.Sequelize.Op.ne]: null } } },
        { fields: ['external_payment_id'], unique: true, where: { external_payment_id: { [db.Sequelize.Op.ne]: null } } }
      ],
      hooks: {
        beforeCreate: async (payment, options) => {
          // Validate application_id
          const application = await db.models.Application.findByPk(payment.application_id, {
            transaction: options.transaction
          });
          if (!application) throw new Error('መጠየቂያ አልተገኘም።');
          if (!['ቀርቧል', 'ጸድቋል'].includes(application.status)) {
            throw new Error('ክፍያዎች በቀርቧል ወይም ጸድቋል ሁኔታ ላይ ብቻ ሊፈጠሩ ይችላሉ።');
          }
          // Validate payment dates
          if (payment.payment_due_date && new Date(payment.payment_date) > new Date(payment.payment_due_date)) {
            throw new Error('የክፍያ ቀን ከክፍያ ተጠናቀቀበት ቀን በፊት መሆን አለበት።');
          }
        },
        beforeUpdate: async (payment, options) => {
          // Validate application_id on update
          if (payment.changed('application_id')) {
            const application = await db.models.Application.findByPk(payment.application_id, {
              transaction: options.transaction
            });
            if (!application) throw new Error('መጠየቂያ አልተገኘም።');
          }
          // Prevent updates if application is APPROVED and payment is COMPLETED
          const application = await db.models.Application.findByPk(payment.application_id, {
            transaction: options.transaction
          });
          if (application.status === 'ጸድቋል' && payment.payment_status === PAYMENT_STATUSES.COMPLETED) {
            throw new Error('የጸድቋል መጠየቂያ እና ተጠናቅቋል ክፍያ መቀየር አይቻልም።');
          }
          // Validate payment_status transitions
          const validTransitions = {
            [PAYMENT_STATUSES.PENDING]: [PAYMENT_STATUSES.COMPLETED, PAYMENT_STATUSES.FAILED, PAYMENT_STATUSES.CANCELLED],
            [PAYMENT_STATUSES.COMPLETED]: [],
            [PAYMENT_STATUSES.FAILED]: [PAYMENT_STATUSES.PENDING],
            [PAYMENT_STATUSES.CANCELLED]: []
          };
          if (payment.changed('payment_status')) {
            const previousStatus = payment.previous('payment_status');
            if (!validTransitions[previousStatus].includes(payment.payment_status)) {
              throw new Error(`ከ${previousStatus} ወደ ${payment.payment_status} መሸጋገር አይቻልም።`);
            }
            // Update payment_history
            payment.payment_history = [
              ...(payment.payment_history || []),
              {
                status: payment.payment_status,
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