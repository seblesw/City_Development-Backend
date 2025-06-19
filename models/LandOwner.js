
module.exports = (db, DataTypes) => {
  const LandOwner = db.define(
    'LandOwner',
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
        unique: true,
        references: { model: 'users', key: 'id' }
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: 'ብሔራዊ መታወቂያ ቁጥር ባዶ መሆን አዯችልም።' },
          len: { args: [5, 50], msg: 'ብሔራዊ መታወቂያ ቁጥር ከ5 እስከ 50 ቁምፊዎች መሆን አለበት።' }
        }
      },
      marital_status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [['ነጠላ', 'ባለትዳር', 'ቤተሰብ', 'ጋራ ባለቤትነት']],
            msg: 'የጋብቻ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [['ሴት', 'ወንድ', 'ሌላ']],
            msg: 'ጾታ ከተፈቀዱት እሴቶች (ሴት፣ ወንድ፣ ሌላ) ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      address_kebele: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: 'የኬቤሌ አድራሻ ከ100 ቁምፊዎች መብለጥ አዯችልም።' }
        }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'administrative_units', key: 'id' }
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
      tableName: 'land_owners',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['user_id'], unique: true },
        { fields: ['national_id'], unique: true },
        { fields: ['administrative_unit_id'] },
        { fields: ['marital_status'] }
      ],
      hooks: {
        beforeCreate: async (landOwner, options) => {
          // Ensure administrative_unit_id matches User's administrative_unit_id
          const user = await db.models.User.findByPk(landOwner.user_id, {
            transaction: options.transaction
          });
          if (!user) throw new Error('ተጠቃሚ አልተገኘም።');
          if (user.administrative_unit_id !== landOwner.administrative_unit_id) {
            throw new Error('የመሬት ባለቤት አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።');
          }
        },
        beforeUpdate: async (landOwner, options) => {
          if (landOwner.changed('administrative_unit_id')) {
            const user = await db.models.User.findByPk(landOwner.user_id, {
              transaction: options.transaction
            });
            if (user.administrative_unit_id !== landOwner.administrative_unit_id) {
              throw new Error('የመሬት ባለቤት አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።');
            }
          }
        }
      }
    }
  );

  return LandOwner;
};