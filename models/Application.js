const STATUS_TYPES = {
  PENDING: 'በመጠባበቅ ላይ',
  DRAFT: 'ተጻፎ ተቀምጧል',
  IN_REVIEW: 'በግምገማ ላይ',
  REJECTED: 'ውድቅ ተደርጓል',
  APPROVED: 'ጸድቋል'
};

const TRANSACTION_TYPES = {
  LAND_REGISTRATION: 'የመሬት ምዝገባ',
  TRANSFER: 'ማስተላለፍ',
  UPDATE: 'ማሻሻል',
  OTHER: 'ሌላ'
};

module.exports = (db, DataTypes) => {
  const Application = db.define(
    'Application',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: STATUS_TYPES.PENDING,
        validate: {
          isIn: {
            args: [Object.values(STATUS_TYPES)],
            msg: 'ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      transaction_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(TRANSACTION_TYPES)],
            msg: 'የግብይት አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
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
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'administrative_units', key: 'id' }
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'land_records', key: 'id' }
      },
      document_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'documents', key: 'id' }
      },
      land_payment_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'land_payments', key: 'id' }
      },
      comments: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      status_history: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
      }
    },
    {
      tableName: 'applications',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['administrative_unit_id'] },
        { fields: ['land_record_id'] },
        { fields: ['document_id'] },
        { fields: ['land_payment_id'] },
        { fields: ['status'] }
      ],
      validate: {
        async validateCoOwners() {
          const user = await db.models.User.findByPk(this.user_id);
          const coOwners = await db.models.CoOwners.findAll({ where: { user_id: this.user_id } });

          if (user.marital_status === 'ነጠላ' && coOwners.length > 0) {
            throw new Error('ነጠላ ተጠቃሚ ጋራ ባለቤቶች ሊኖሩት አይችልም።');
          }
          if (user.marital_status === 'ባለትዳር' && (coOwners.length !== 1 || !coOwners.find(co => co.relationship_type === 'ትዳር ጓደኛ'))) {
            throw new Error('ባለትዳር ተጠቃሚ አንድ ትዳር ጓደኛ እንደ ጋራ ባለቤት መግለፅ አለበት።');
          }
          if (['ቤተሰብ', 'ጋራ ባለቤትነት'].includes(user.marital_status) && coOwners.length === 0) {
            throw new Error('ቤተሰብ ወይም ጋራ ባለቤትነት ተጠቃሚ ቢያንስ አንድ ጋራ ባለቤት መግለፅ አለበት።');
          }
        },
        atLeastOneReference() {
          if (!this.land_record_id && !this.document_id && !this.land_payment_id) {
            throw new Error('ቢያንስ አንድ የመሬት መዝገብ፣ ሰነድ ወይም የመሬት ክፍያ መግለፅ አለበት።');
          }
        }
      },
      hooks: {
        beforeUpdate: async (application) => {
          if (application.changed('status')) {
            const previousStatus = application.previous('status');
            application.status_history = [
              ...(application.status_history || []),
              {
                status: application.status,
                changed_by: application.updated_by,
                changed_at: new Date()
              }
            ];
          }
        }
      }
    }
  );

  return Application;
};