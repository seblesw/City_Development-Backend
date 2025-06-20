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
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
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
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: 'አስተያየቶች ከ500 ቁምፊዎች መብለጥ አይችልም።' }
        }
      },
      rejection_reason: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: 'የውድቅ ምክንያት ከ500 ቁምፊዎች መብለጥ አይችልም።' }
        }
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
      tableName: 'applications',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['land_owner_id'] },
        { fields: ['administrative_unit_id'] },
        { fields: ['land_record_id'] },
        { fields: ['status'] },
        { fields: ['application_type'] },
        { fields: ['priority'] }
      ],
      hooks: {
        beforeCreate: async (application, options) => {
          // Ensure administrative_unit_id matches created_by and user_id
          const user = await db.models.User.findByPk(application.created_by, {
            transaction: options.transaction
          });
          if (!user) throw new Error('ተጠቃሚ አልተገኘም።');
          const landOwner = await db.models.LandOwner.findByPk(application.user_id, {
            transaction: options.transaction
          });
          if (!landOwner) throw new Error('የመሬት ባለቤት አልተገኘም።');
          if (
            user.administrative_unit_id !== landOwner.administrative_unit_id ||
            user.administrative_unit_id !== application.administrative_unit_id
          ) {
            throw new Error('አስተዳደራዊ ክፍል ከመመዝገቢው እና የመሬት ባለቤት ጋር መመሳሰል አለበት።');
          }
          // Validate land_record_id if provided
          if (application.land_record_id) {
            const landRecord = await db.models.LandRecord.findByPk(application.land_record_id, {
              transaction: options.transaction
            });
            if (!landRecord) throw new Error('የመሬት መዝገብ አልተገኘም።');
            if (
              landRecord.application_id !== null &&
              landRecord.application_id !== application.id ||
              landRecord.administrative_unit_id !== application.administrative_unit_id
            ) {
              throw new Error('የመሬት መዝገብ ከመጠየቂያ እና አስተዳደራዊ ክፍል ጋር መመሳሰል አለበት።');
            }
          }
        },
        beforeUpdate: async (application, options) => {
          // Validate status transitions
          const validTransitions = {
            [APPLICATION_STATUSES.DRAFT]: [APPLICATION_STATUSES.SUBMITTED, APPLICATION_STATUSES.CANCELLED],
            [APPLICATION_STATUSES.SUBMITTED]: [APPLICATION_STATUSES.UNDER_REVIEW, APPLICATION_STATUSES.CANCELLED],
            [APPLICATION_STATUSES.UNDER_REVIEW]: [APPLICATION_STATUSES.APPROVED, APPLICATION_STATUSES.REJECTED],
            [APPLICATION_STATUSES.APPROVED]: [],
            [APPLICATION_STATUSES.REJECTED]: [],
            [APPLICATION_STATUSES.CANCELLED]: []
          };
          if (application.changed('status')) {
            const previousStatus = application.previous('status');
            if (!validTransitions[previousStatus].includes(application.status)) {
              throw new Error(`ከ${previousStatus} ወደ ${application.status} መሸጋገር አይፈቀድም።`);
            }
            application.status_history = [
              ...(application.status_history || []),
              {
                status: application.status,
                changed_by: application.updated_by,
                changed_at: new Date()
              }
            ];
            // Sync LandRecord and LandPayment status on APPROVED
            if (application.status === APPLICATION_STATUSES.APPROVED && application.land_record_id) {
              await db.models.LandRecord.update(
                { status: 'ጸድቋል' },
                { where: { id: application.land_record_id }, transaction: options.transaction }
              );
              await db.models.LandPayment.update(
                { payment_status: 'ተጠናቋል' },
                { where: { application_id: application.id }, transaction: options.transaction }
              );
            }
          }
          // Ensure land_record_id for SUBMITTED status
          if (application.status === APPLICATION_STATUSES.SUBMITTED && !application.land_record_id) {
            throw new Error('ቀርቧል ሁኔታ የመሬት መዝገብ መለያ ይፈልጋል።');
          }
        },
        beforeValidate: async (application, options) => {
          // Validate co-owners
          const landOwner = await db.models.LandOwner.findByPk(application.land_owner_id, {
            transaction: options.transaction
          });
          if (!landOwner) throw new Error('የመሬት ባለቤት አልተገኘም።');
          const coOwnersCount = await db.models.CoOwner.count({
            where: { land_owner_id: application.land_owner_id },
            transaction: options.transaction
          });
          if (landOwner.marital_status === 'ባለትዳር' && coOwnersCount !== 1) {
            throw new Error('ባለትዳር ተጠቃሚ በትክክል አንድ የጋራ ባለቤት መኖር አለበት።');
          } else if (landOwner.marital_status === 'ጋራ ባለቤትነት' && coOwnersCount < 1) {
            throw new Error('ጋራ ባለቤትነት ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።');
          } else if (landOwner.marital_status === 'ቤተሰብ' && coOwnersCount < 1) {
            throw new Error('ቤተሰብ ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።');
          } else if (landOwner.marital_status === 'ነጠላ' && coOwnersCount > 0) {
            throw new Error('ነጠላ ተጠቃሚ የጋራ ባለቤት መኖር አይችልም።');
          }
        }
      }
    }
  );

  return Application;
};