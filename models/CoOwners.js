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
      land_owner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'land_owners', key: 'id' }
      },
      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: 'ሙሉ ስም ባዶ መሆን አይችልም።' },
          len: { args: [2, 100], msg: 'ሙሉ ስም ከ2 እስከ 100 ቁምፊዎች መሆን አለበት።' }
        }
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          is: { args: [/^\+?\d{10,15}$/], msg: 'የስልክ ቁጥር ትክክለኛ መሆን አለበት።' }
        }
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [5, 20], msg: 'ብሔራዊ መታወቂያ ቁጥር ትክክለኛ መሆን አለበት።' }
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
        { fields: ['land_owner_id'] },
        { unique: true, fields: ['land_owner_id', 'national_id'], where: { national_id: { [db.Sequelize.Op.ne]: null } } }
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