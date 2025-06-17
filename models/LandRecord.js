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
        validate: { min: 1 }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'administrative_units', key: 'id' }
      },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: { min: 0 }
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['መኖሪያ', 'ድብልቅ', 'ንግድ', 'አስተዳደራዊ', 'አገልግሎት', 'ማምረቻ እና ማከማቻ', 'መንገዶች እና ትራንስፖርት', 'ከተማ ግብርና', 'ደን', 'መዝናኛ እና መጫወቶ ሜዳ', 'ሌላ']]
        }
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['የፍርድ ቤት ትእዛዝ', 'የባለቤትነት ማስተላለፍ', 'የኪራይ ይዞታ', 'የኪራይ ይዞታ-ምደባ', 'ቅድመ ሰነድ የሌለው', 'መፈናቀል']]
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
          }
        }
      },
      registration_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      }
    },
    {
      tableName: 'land_records',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['parcel_number'] },
        { fields: ['administrative_unit_id'] }
      ],
      validate: {
        async validLandLevel() {
          const unit = await db.models.AdministrativeUnit.findByPk(this.administrative_unit_id);
          if (unit && this.land_level > unit.max_land_levels) {
            throw new Error('የመሬት ደረጃ ከአስተዳደር ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።');
          }
        }
      }
    }
  );

  return LandRecord;
};