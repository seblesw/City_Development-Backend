
module.exports = (db, DataTypes) => {
  const CoOwner = db.define(
    'CoOwner',
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
          notEmpty: { msg: 'ሙሉ ስም ባዶ መሆን አዯችልም።' },
          len: { args: [2, 100], msg: 'ሙሉ ስም ከ2 እስከ 100 ቁምፊዎች መሆን አለበት።' }
        }
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
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          is: { args: [/^\+251[79]\d{8}$/], msg: 'ትክክለኛ ስልክ ቁጥር ያስገቡ (+2519... ወይም +2517...)።' }
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
      relationship_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [['የትዳር ጓደኛ', 'ልጅ', 'ወላጅ', 'ወንድም/እህት', 'ሌላ']],
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
      }
    },
    {
      tableName: 'co_owners',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['land_owner_id'] },
        { fields: ['national_id'], unique: true }
      ]
    }
  );

  return CoOwner;
};