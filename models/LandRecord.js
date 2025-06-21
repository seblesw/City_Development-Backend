// models/LandRecord.js
const { Op } = require("sequelize");

const LAND_USE_TYPES = {
  RESIDENTIAL: "መኖሪያ",
  MIXED: "ድብልቅ",
  COMMERCIAL: "ንግድ",
  ADMINISTRATIVE: "አስተዳደራዊ",
  SERVICE: "አገልግሎት",
  MANUFACTURING_STORAGE: "ማምረቻ እና ማከማቻ",
  TRANSPORT: "መንገዶች እና ትራንስፖርት",
  URBAN_AGRICULTURE: "ከተማ ግብርና",
  FOREST: "ደን",
  RECREATION: "መዝናኛ እና መጫወቻ ሜዳ",
  OTHER: "ሌላ"
};

const OWNERSHIP_TYPES = {
  COURT_ORDER: "የፍርድ ቤት ትእዛዝ",
  TRANSFER: "የባለቤትነት ማስተላለፍ",
  LEASE: "የሊዝ ይዞታ",
  LEASE_ALLOCATION: "የሊዝ ይዞታ-ምደባ",
  NO_PRIOR_DOCUMENT: "ቅድመ ሰነድ የሌለው",
  DISPLACEMENT: "መፈናቀል"
};

module.exports = (db, DataTypes) => {
  const LandRecord = db.define(
    "LandRecord",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      parcel_number: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የመሬት ቁጥር ባዶ መሆን አይችልም።" },
          len: { args: [1, 50], msg: "የመሬት ቁጥር ከ1 እስከ 50 ቁምፊዎች መሆን አለበት።" }
        }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" }
      },
      application_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // Nullable for initial creation
        references: { model: "applications", key: "id" }
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" }
      },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: { min: { args: [0], msg: "ስፋት ከ0 በታች መሆን አይችልም።" } }
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(LAND_USE_TYPES)],
            msg: "የመሬት አጠቃቀም ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።"
          }
        }
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(OWNERSHIP_TYPES)],
            msg: "የባለቤትነት አይነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።"
          }
        }
      },
      coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
        validate: {
          isValidCoordinates(value) {
            if (!value) return;
            if (!["Point", "Polygon"].includes(value.type)) {
              throw new Error("ትክክለኛ GeoJSON መሆን አለባቸው።");
            }
            if (value.type === "Point") {
              const [lon, lat] = value.coordinates;
              if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                throw new Error("ኮርድኔት የተሳሳተ ነው።");
              }
            }
            if (
              value.type === "Polygon" &&
              (!Array.isArray(value.coordinates) ||
                !value.coordinates.every((ring) => Array.isArray(ring)))
            ) {
              throw new Error("Polygon መጋጠሚያ ትክክል አይደለም።");
            }
          }
        }
      },
      registration_date: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: { msg: "ትክክለኛ ቀን ያስገቡ።" },
          notFutureDate(value) {
            const today = new Date();
            if (new Date(value) > today) {
              throw new Error("የምዝገባ ቀን ወደፊት መሆን አይችልም።");
            }
          }
        }
      }
    },
    {
      tableName: "land_records",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ["parcel_number", "administrative_unit_id"] },
        { fields: ["administrative_unit_id"] },
        { fields: ["user_id"] },
        { fields: ["application_id"], where: { application_id: { [Op.ne]: null } } },
        { fields: ["land_use"] },
        { fields: ["ownership_type"] }
      ],
      hooks: {
        beforeCreate: async (landRecord, options) => {
          // Validate unique parcel_number within administrative_unit_id
          const existing = await db.models.LandRecord.findOne({
            where: {
              parcel_number: landRecord.parcel_number,
              administrative_unit_id: landRecord.administrative_unit_id
            },
            transaction: options.transaction
          });
          if (existing) throw new Error("ይህ የመሬት ቁጥር አስቀድመው ተመዝግቧል።");
        },
        beforeUpdate: async (landRecord, options) => {
          // Prevent updates if linked application is APPROVED
          if (landRecord.application_id) {
            const application = await db.models.Application.findByPk(
              landRecord.application_id,
              { transaction: options.transaction }
            );
            if (application?.status === "ጸድቋል") {
              throw new Error("የጸድቋል መጠየቂያ ጋር የተገናኘ መሬት መዝገብ መቀየር አይችልም።");
            }
          }
          // Validate unique parcel_number on update
          if (landRecord.changed("parcel_number") || landRecord.changed("administrative_unit_id")) {
            const existing = await db.models.LandRecord.findOne({
              where: {
                parcel_number: landRecord.parcel_number,
                administrative_unit_id: landRecord.administrative_unit_id,
                id: { [Op.ne]: landRecord.id }
              },
              transaction: options.transaction
            });
            if (existing) throw new Error("ይህ የመሬት ቁጥር አስቀድመው ተመዝግቧል።");
          }
        }
      }
    }
  );

  return LandRecord;
};