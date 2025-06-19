
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
            msg: 'የክፍያ መጠን ከ0 በታች መሆን አዯችልም።'
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
          isDate: { msg: 'ትክክለኛ የክፍያ ቀን ያስገቡ (YYYY-MM-DD)።' }
        }
      },
      payment_due_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          isDate: { msg: 'ትክክለኛ የክፍያ ተጠናቀቀበት ቀን ያስገቡ (YYYY-MM-DD)።' }
        }
      },
      transaction_reference: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 50],
            msg: 'የግብይት ማጣቀሻ ከ50 ቁምፊዎች መብለጥ አዯችልም።'
          }
        }
      },
      external_payment_id: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 50],
            msg: 'የውጭ ክፍያ መለያ ከ50 ቁምፊዎች መብለጥ አዯችልም።'
          }
        }
      },
      notes: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 500],
            msg: 'ማስታወሻ ከ500 ቁምፊዎች መብለጥ አዯችልም።'
          }
        }
      },
      payment_history: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
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
      }
    },
    {
      tableName: 'land_payments',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['application_id'] },
        { fields: ['land_record_id'] },
        { fields: ['payment_type'] },
        { fields: ['payment_status'] },
        { fields: ['transaction_reference'], unique: true, where: { transaction_reference: { [db.Sequelize.Op.ne]: null } } }
      ],
      hooks: {
        beforeCreate: async (payment, options) => {
          // Ensure created_by user's administrative_unit_id matches land_record's
          const landRecord = await db.models.LandRecord.findByPk(payment.land_record_id, {
            transaction: options.transaction
          });
          if (!landRecord) throw new Error('የመሬት መዝገብ አልተገኘም።');
          const user = await db.models.User.findByPk(payment.created_by, {
            transaction: options.transaction
          });
          if (!user) throw new Error('ተጠቃሚ አልተገኘም�');
          if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
            throw new Error('የክፍያ መመዝገቢ አስተዳደራዊ ክፍል ከመሬት መዝገ� ጋር መምሳሰ አለበቘ');
          }
          // Ensure application_id matches land_record's application_id
          if (landRecord.application_id !== payment.application_id) {
            throw new Error('የክፍያ መጠየቂያ ከመንደ መዝግብ መጠበ ቃ ጋር መምሳሰ አለ ቤ');
          }
          // Validate payment_type for lease ownership
          if (
            landRecord.ownership_type === 'የሊዝ ይዞታ' &&
            payment.payment_type !== PAYMENT_TYPES.LEASE_PAYMENT
          ) {
            throw new Error('የሊዝ ይዞታ ባለቤትነት የኪራይ ክፍያ ይፈልጋል።');
          }
          // Validate payment dates
          if (payment.payment_date > payment.payment_due_date) {
            throw new Error('የክፍያ ቀን ከክፍያ ተጠናቀቀበት ቀን በፊት መሆን አለበት።');
          }
        },
        beforeUpdate: async (payment, options) => {
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
          if (payment.changed('application_id')) {
            const landRecord = await db.models.LandRecord.findByPk(payment.land_record_id, {
              transaction: options.transaction
            });
            if (landRecord.application_id !== payment.application_id) {
              throw new Error('የክፍያ መጠየቂያ ከመሬት መዝገብ መጠየቂያ ጋር መመሳሰል አለበት።');
            }
          }
        }
      }
    }
  );

  return LandPayment;
};
