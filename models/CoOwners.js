const RELATIONSHIP_TYPES = {
  SPOUSE: 'ትዳር ጓደኛ',
  FAMILY: 'ቤተሰብ',
  PARTNER: 'አጋር'
};

module.exports = (db, DataTypes) => {
  const CoOwners = db.define(
    'CoOwners',
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
      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: {
            msg: 'ሙሉ ስም ባዶ መሆን አይችልም።'
          }
        }
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          is: {
            args: [/^\+?\d{10,15}$/],
            msg: 'የስልክ ቁጥር ትክክለኛ መሆን አለበት።'
          }
        }
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [5, 20],
            msg: 'ብሔራዊ መታወቂያ ቁጥር ትክክለኛ መሆን አለበት።'
          }
        }
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true
      },
      relationship_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(RELATIONSHIP_TYPES)],
            msg: 'የግንኙነት አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      name_translations: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
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
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'co_owners',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id'] },
        { unique: true, fields: ['user_id', 'national_id'], where: { national_id: { [DataTypes.Op.ne]: null } } }
      ],
      validate: {
        atLeastOneIdentifier() {
          if (!this.phone_number && !this.national_id) {
            throw new Error('ቢያንስ አንድ የስልክ ቁጥር ወይም ብሔራዊ መታወቂያ መግለፅ አለበት።');
          }
        }
      }
    }
  );

  return CoOwners;
};