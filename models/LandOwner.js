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
        allowNull: true,
        unique: true,
        validate: {
          len: { args: [5, 20], msg: 'ብሔራዊ መታወቂያ ቁጥር ከ5 እስከ 20 ቁምፊዎች መሆን አለበት።' }
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
        allowNull: true,
        validate: {
          isIn: {
            args: [['ሴት', 'ወንድ', 'ሌላ']],
            msg: 'ጾታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      date_of_birth: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        validate: {
          isDate: { msg: 'ትክክለኛ የልደት ቀን ያስገቡ።' }
        }
      },
      address_kebele: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: 'የኬቤሌ አድራሻ ከ100 ቁምፊዎች መብለጥ አይችልም።' }
        }
      },
      profile_picture: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 255], msg: 'የመገለጫ ፎቶ መንገድ ከ255 ቁምፊዎች መብለጥ አይችልም።' }
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
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'land_owners',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['national_id'], where: { national_id: { [db.Sequelize.Op.ne]: null } } },
        { fields: ['administrative_unit_id'] }
      ]
    }
  );

  return LandOwner;
};