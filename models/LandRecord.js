const { Op } = require('sequelize');

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
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      parcel_number: { type: DataTypes.STRING, unique: true, allowNull: false },
      land_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: { args: [1], msg: 'የመሬት ደረጃ ከ1 በታች መሆን አዯችልም።' } }
      },
      administrative_unit_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'administrative_units', key: 'id' } },
      application_id: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: 'applications', key: 'id' } },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: { min: { args: [0], msg: 'ስፋት ከ0 በታች መሆን አዯችልም።' } }
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: { args: [Object.values(LAND_USE_TYPES)], msg: 'የመሬት አጠቃቀም ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።' } }
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: { args: [Object.values(OWNERSHIP_TYPES)], msg: 'የባለቤትነት አይነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።' } }
      },
      coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
        validate: {
          isValidCoordinates(value) {
            if (!value) return;
            if (!['Point', 'Polygon'].includes(value.type)) throw new Error('ትክክለኛ GeoJSON መሆን አለባቸው።');
            if (value.type === 'Point') {
              const [lon, lat] = value.coordinates;
              if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new Error('ኮርድኔት የተሳሳተ ነው።');
            }
            if (value.type === 'Polygon' && (!Array.isArray(value.coordinates) || !value.coordinates.every(ring => Array.isArray(ring)))) {
              throw new Error('Polygon መጋጠሚያ ትክክል አይደለም።');
            }
          }
        }
      },
      registration_date: { type: DataTypes.DATEONLY, allowNull: false, validate: { isDate: { msg: 'ትክክለኛ ቀን ያስገቡ (YYYY-MM-DD)' } } },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ረቂቅ',
        validate: { isIn: { args: [['ረቂቅ', 'ተመዝግቧል', 'ጸድቋል', 'ውድቅ ተደርጓል']], msg: 'የሁኔታ እሴት የተሳሳተ ነው።' } }
      },
      user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      registered_by: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      approved_by: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } }
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
        { fields: ['user_id'] },
        { fields: ['application_id'], unique: true },
        { fields: ['land_use'] },
        { fields: ['ownership_type'] }
      ],
      hooks: {
        beforeCreate: async (landRecord, options) => {
          // Validate registered_by and administrative_unit_id
          const user = await db.models.User.findByPk(landRecord.registered_by, { transaction: options.transaction });
          if (!user) throw new Error('ተጠቃሚ አልተገኘም።');
          if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
            throw new Error('የመሬት መዝገብ አስተዳደራዊ ክፍል ከመመዝገቢው ጋር መመሳሰል አለበት።');
          }
          // Validate unique parcel_number within administrative_unit_id
          const existing = await db.models.LandRecord.findOne({
            where: { parcel_number: landRecord.parcel_number, administrative_unit_id: landRecord.administrative_unit_id },
            transaction: options.transaction
          });
          if (existing) throw new Error('ይህ የመሬት ቁጥር አስቀድመው ተመዝግቧል።');
          // Validate application_id and user_id consistency
          const application = await db.models.Application.findByPk(landRecord.application_id, { transaction: options.transaction });
          if (!application) throw new Error('መጠየቂያ አልተገኘም።');
          if (application.user_id !== landRecord.user_id) {
            throw new Error('የመጠየቂያ ተጠቃሚ እና የመሬት መዝገብ ተጠቃሚ መመሳሰል አለባቸው።');
          }
        },
        beforeUpdate: async (landRecord, options) => {
          const previous = await db.models.LandRecord.findByPk(landRecord.id, { transaction: options.transaction });
          // Prevent reverting APPROVED to DRAFT
          if (previous.status === 'ጸድቋል' && landRecord.status === 'ረቂቅ') {
            throw new Error('የጸድቋል መዝገብ ወደ ረቂቅ መመለስ አዯችልም።');
          }
          // Prevent changing user_id or application_id for APPROVED records
          if (
            previous.status === 'ጸድቋል' &&
            (landRecord.user_id !== previous.user_id || landRecord.application_id !== previous.application_id)
          ) {
            throw new Error('የጸድቋል መዝገቦች ተጠቃሚ ወይም መጠየቂያ መቀየር አዯችልም።');
          }
          // Validate administrative_unit_id on update
          if (landRecord.changed('administrative_unit_id')) {
            const user = await db.models.User.findByPk(landRecord.registered_by, { transaction: options.transaction });
            if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
              throw new Error('የመሬት መዝገብ አስተዳደራዊ ክፍል ከመመዝገቢው ጋር መመሳሰል አለበት።');
            }
          }
          // Sync status with Application
          if (landRecord.changed('status')) {
            const application = await db.models.Application.findByPk(landRecord.application_id, { transaction: options.transaction });
            if (landRecord.status === 'ጸድቋል' && application.status !== 'ጸድቋል') {
              throw new Error('የመሬት መዝገብ ጸድቆ መጠየቂያው ጸድቆ መሆን አለበት።');
            }
            if (landRecord.status === 'ውድቅ ተደርጓል' && application.status !== 'ውድቅ ተደርጓል') {
              throw new Error('የመሬት መዝገብ ውድቅ ሲደረግ መጠየቂያው ውድቅ መሆን አለበት።');
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