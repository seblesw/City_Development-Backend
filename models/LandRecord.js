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
  RECREATION: 'መዝናኛ እና መጫወቶ ሜዳ',
  OTHER: 'ሌላ'
};

const OWNERSHIP_TYPES = {
  COURT_ORDER: 'የፍርድ ቤት ትእዛዝ',
  TRANSFER: 'የባለቤትነት ማስተላለፍ',
  LEASE: 'የኪራይ ይዞታ',
  LEASE_ALLOCATION: 'የኪራይ ይዞታ-ምደባ',
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
      tableName: 'land_records',
      timestamps: true,
      paranoid: true,
      indexes: [
        { unique: true, fields: ['parcel_number'] },
        { fields: ['administrative_unit_id'] },
        { fields: ['land_level'] }
      ],
      validate: {
        async validLandLevel() {
          const unit = await db.models.AdministrativeUnit.findByPk(this.administrative_unit_id);
          if (unit && this.land_level > unit.max_land_levels) {
            throw new Error('የመሬት ደረጃ ከአስተዳደር ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።');
          }
        }
      },
      hooks: {
        beforeSave: async (landRecord) => {
          // Check if linked to an Application and ensure administrative_unit_id consistency
          const application = await db.models.Application.findOne({ where: { land_record_id: landRecord.id } });
          if (application && application.administrative_unit_id !== landRecord.administrative_unit_id) {
            throw new Error('የመሬት መዝገብ እና የመጠየቂያ አስተዳደራዊ ክፍል መጣጣም አለባቸው።');
          }
        }
      }
    }
  );

  return LandRecord;
};