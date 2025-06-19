const APPLICATION_STATUSES = {
  DRAFT: 'ረቂቅ',
  SUBMITTED: 'ቀርቧል',
  UNDER_REVIEW: 'በግምገማ ላይ',
  APPROVED: 'ጸድቋል',
  REJECTED: 'ውድቅ ተደርጓል',
  CANCELLED: 'ተሰርዟል'
};

const APPLICATION_TYPES = {
  OWNERSHIP_REGISTRATION: 'የባለቤትነት ምዝገባ',
  OWNERSHIP_TRANSFER: 'የባለቤትነት ሽግግር',
  LEASE_REGISTRATION: 'የኪራይ ምዝገባ',
  PAYMENT_REQUEST: 'የክፍያ ጥያቄ',
  OTHER: 'ሌላ'
};

const PRIORITIES = {
  LOW: 'ዝቅተኛ',
  MEDIUM: 'መካከለኛ',
  HIGH: 'ከፍተኛ'
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
      land_owner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'land_owners', key: 'id' }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'administrative_units', key: 'id' }
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
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: APPLICATION_STATUSES.DRAFT,
        validate: {
          isIn: {
            args: [Object.values(APPLICATION_STATUSES)],
            msg: 'የመጠየቂያ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      status_history: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
      },
      application_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(APPLICATION_TYPES)],
            msg: 'የመጠየቂያ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      priority: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PRIORITIES.MEDIUM,
        validate: {
          isIn: {
            args: [Object.values(PRIORITIES)],
            msg: 'ቅድሚያ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      comments: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      rejection_reason: {
        type: DataTypes.TEXT,
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
    },
    {
      tableName: 'applications',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['land_owner_id'] },
        { fields: ['administrative_unit_id'] },
        { fields: ['land_record_id'] },
        { fields: ['document_id'] },
        { fields: ['land_payment_id'] },
        { fields: ['status'] },
        { fields: ['priority'] }
      ],
      hooks: {
        beforeUpdate: async (application) => {
          if (application.changed('status')) {
            application.status_history = [
              ...(application.status_history || []),
              {
                status: application.status,
                changed_by: application.updated_by,
                changed_at: new Date()
              }
            ];
            if (application.status === APPLICATION_STATUSES.APPROVED && application.land_record_id) {
              await db.models.LandRecord.update(
                { status: 'ጸድቋል' },
                { where: { id: application.land_record_id } }
              );
            }
          }
        }
      },
      validate: {
        async validateCoOwners() {
          const landOwner = await db.models.LandOwner.findByPk(this.land_owner_id);
          const coOwnersCount = await db.models.CoOwners.count({ where: { land_owner_id: this.land_owner_id } });
          if (landOwner && landOwner.marital_status === 'ባለትዳር' && coOwnersCount !== 1) {
            throw new Error('ባለትዳር ተጠቃሚ በትክክል አንድ የጋራ ባለቤት መኖር አለበት።');
          } else if (landOwner && landOwner.marital_status === 'ጋራ ባለቤትነት' && coOwnersCount < 1) {
            throw new Error('ጋራ ባለቤትነት ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።');
          } else if (landOwner && ['ነጠላ', 'ቤተሰብ'].includes(landOwner.marital_status) && coOwnersCount > 0) {
            throw new Error('ነጠላ ወይም ቤተሰብ ተጠቃሚ የጋራ ባለቤት መኖር አይችልም።');
          }
        },
        async validateApplicationConsistency() {
          if (this.land_payment_id) {
            const payment = await db.models.LandPayment.findByPk(this.land_payment_id);
            if (payment && payment.land_record_id && this.land_record_id && payment.land_record_id !== this.land_record_id) {
              throw new Error('የክፍያ እና የመጠየቂያ መሬት መዝገብ መጣጣም አለባቸው።');
            }
          }
        }
      }
    }
  );

  return Application;
};