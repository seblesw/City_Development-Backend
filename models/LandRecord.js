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
            msg: 'የመሬት ደረጃ ከ1 በታች መሆን አይችልም።'
          }
        }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'administrative_units', key: 'id' }
      },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: {
            args: [0],
            msg: 'መጠን ከ0 በታች መሆን አይችልም።'
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
      address: {
        type: DataTypes.STRING,
        allowNull: true
      },
      coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
        validate: {
          isValidCoordinates(value) {
            if (value && !(Array.isArray(value.coordinates) && value.type === 'Point')) {
              throw new Error('መጋጠሚያዎች የGeoJSON Point መሆን አለባቸው።');
            }
            if (value && value.coordinates) {
              const [lon, lat] = value.coordinates;
              if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                throw new Error('መጋጠሚያዎች ትክክለኛ የሆኑ ኬንትሮስ እና ኬንትሮስ መሆን አለባቸው።');
              }
            }
          }
        }
      },
      registration_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
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
      },

    },
    {
      tableName: 'land_records',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ['parcel_number'] },
        { fields: ['administrative_unit_id'] },
        { fields: ['land_level'] },
        { fields: ['owner_id'] }
      ],
      validate: {
        async validLandLevel() {
          const unit = await db.models.AdministrativeUnit.findByPk(this.administrative_unit_id);
          if (unit && this.land_level > unit.max_land_levels) {
            throw new Error('የመሬት ደረጃ ከአስተዳደር ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።');
          }
        },
        async validateOwnerConsistency() {
          const application = await db.models.Application.findOne({ where: { land_record_id: this.id } });
          if (application && application.land_owner_id !== this.owner_id) {
            throw new Error('የመሬት መዝገብ ባለቤት እና የመጠየቂያ ተጠቃሚ መጣጣም አለባቸው።');
          }
        }
      }
    }
  );

  return LandRecord;
};