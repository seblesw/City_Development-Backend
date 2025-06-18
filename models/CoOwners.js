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
          is: { args: [/^\+251[79]\d{8}$/], msg: 'ትክክለኛ ስልክ ቁጥር ያስገቡ።' }
        }
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [5, 20], msg: 'ብሔራዊ መታወቂያ ቁጥር ከ5 እስከ 20 ቁምፊዎች መሆን አለበት።' }
        }
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 255], msg: 'አድራሻ ከ255 ቁምፊዎች መብለጥ አይችልም።' }
        }
      },
      relationship_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [['ትዳር ጓደኛ', 'ልጅ', 'ወላጅ', 'ወንድም/እህት', 'ሌላ']],
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
    },
    {
      tableName: 'co_owners',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['land_owner_id'] },
      ]
    }
  );

  return CoOwners;
};