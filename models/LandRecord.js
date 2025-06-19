
const LAND_USE_TYPES = {
  RESIDENTIAL: 'መኖሪያ',
  MIXED: 'ድብልቅ',
  COMMERCIAL: 'ንግድ',
  ADMINISTRATIVE: 'አስተዳደራዊ',
  SERVICE: 'አገልግሎት',
  MANUFACTURING_STORAGE: 'ማምረቻ እና ማከማቻ',
  TRANSPORT: 'መንገዶች እና ትራንስፖርት',
  URBAN_AGRICULTURE: 'ከተማ ግብርና',
  FOREST: 'ደን',
  RECREATION: 'መዝናኛ እና መጫወቻ ሜዳ',
  OTHER: 'ሌላ'
};

const OWNERSHIP_TYPES = {
  COURT_ORDER: 'የፍርድ ቤት ትእዛዝ',
  TRANSFER: 'የባለቤትነት ማስተላለፍ',
  LEASE: 'የሊዝ ይዞታ',
  LEASE_ALLOCATION: 'የሊዝ ይዞታ-ምደባ',
  NO_PRIOR_DOCUMENT: 'ቅድመ ሰነድ የሌለው',
  DISPLACEMENT: 'መፈናቀል'
};

module.exports = (db, DataTypes) => {
  const LandRecord = db.define(
    'LandRecord',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      parcel_number: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
      },
      land_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: {
            args: [1],
            msg: 'የመሬት ደረጃ ከ1 በታች መሆን አዯችልም።'
          }
        }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'administrative_units', key: 'id' }
      },
      application_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'applications', key: 'id' }
      },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: {
            args: [0],
            msg: 'ስፋት ከ0 በታች መሆን አዯችልም።'
          }
        }
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(LAND_USE_TYPES)],
            msg: 'የመሬት አጠቃቀም ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(OWNERSHIP_TYPES)],
            msg: 'የባለቤትነት አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
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
      coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
        validate: {
          isValidCoordinates(value) {
            if (!value) return; // Allow null
            if (!(Array.isArray(value.coordinates) && value.type === 'Point')) {
              throw new Error('መጋጠሚያዎች የGeoJSON Point መሆን አለባቸው።');
            }
            const [lon, lat] = value.coordinates;
            if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
              throw new Error('መጋጠሚያዎች ትክክለኛ የሆኑ ኬንትሮስ እና ኬንትሮስ መሆን አለባቸው።');
            }
          }
        }
      },
      registration_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          isDate: { msg: 'ትክክለኛ የምዝገባ ቀን ያስገቡ (YYYY-MM-DD)።' }
        }
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ረቂቅ',
        validate: {
          isIn: {
            args: [['ረቂቅ', 'ተመዝግቧል', 'ጸድቋል', 'ውድቅ ተደርጓል']],
            msg: 'የመሬት መዝገብ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      owner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'land_owners', key: 'id' }
      },
      registered_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      }
    },
    {
      tableName: 'land_records',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ['parcel_number', 'administrative_unit_id'] },
        { fields: ['administrative_unit_id'] },
        { fields: ['land_level'] },
        { fields: ['owner_id'] },
        { fields: ['application_id'], unique: true },
        { fields: ['land_use'] },
        { fields: ['ownership_type'] }
      ],
      hooks: {
        beforeCreate: async (landRecord, options) => {
          // Ensure administrative_unit_id matches registered_by user's unit
          const user = await db.models.User.findByPk(landRecord.registered_by, {
            transaction: options.transaction
          });
          if (!user) throw new Error('ተጠቃሚ አልተገኘም።');
          if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
            throw new Error('የመሬት መዝገብ አስተዳደራዊ ክፍል ከመመዝገቢው ተጠቃሚ ጋር መመሳሰል አለበት።');
          }
          // Ensure owner_id matches application’s land_owner_id
          const application = await db.models.Application.findByPk(landRecord.application_id, {
            transaction: options.transaction
          });
          if (!application) throw new Error('መጠየቂያ አልተገኘም።');
          if (application.land_owner_id !== landRecord.owner_id) {
            throw new Error('የመሬት መዝገብ ባለቤት እና የመጠየቂያ ተጠቃሚ መጣጣም አለባቸው።');
          }
        },
        beforeUpdate: async (landRecord, options) => {
          if (landRecord.changed('administrative_unit_id')) {
            const user = await db.models.User.findByPk(landRecord.registered_by, {
              transaction: options.transaction
            });
            if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
              throw new Error('የመሬት መዝገብ አስተዳደራዊ ክፍል ከመመዝገቢው ተጠቃሚ ጋር መመሳሰል አለበት።');
            }
          }
        }
      },
      validate: {
        async validLandLevel() {
          const unit = await db.models.AdministrativeUnit.findByPk(this.administrative_unit_id);
          if (unit && this.land_level > unit.max_land_levels) {
            throw new Error('የመሬት ደረጃ ከአስተዳደር ክፍል ከፍተኛ ደረጃ መብለጥ አዯችልም።');
          }
        }
      }
    }
  );

  return LandRecord;
};
