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
          notEmpty: { msg: "የመሬት ቁጥር ባዶ መሆን አይቻልም።" }
        }
      },
      land_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: { args: [1], msg: "ማህበረ ደረጃ ከ1 በታች መሆን አይቻልም።" } }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" }
      },
      application_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "applications", key: "id" }
      },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: { min: { args: [0], msg: "ስፋት ከ0 በታች መሆን አይቻልም።" } }
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
            if (!["Point", "Polygon"].includes(value.type))
              throw new Error("ትክክለኛ GeoJSON መሆን አለባቸው።");
            if (value.type === "Point") {
              const [lon, lat] = value.coordinates;
              if (lon < -180 || lon > 180 || lat < -90 || lat > 90)
                throw new Error("ኮርድኔት የተሳሳተ ነው።");
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
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          isDate: { msg: "ትክክለኛ ቀን ያስገቡ (YYYY-MM-DD)" },
          notFutureDate(value) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize to start of day
            if (new Date(value) > today) {
              throw new Error("የምዝገባ ቀን ወደፊት መሆን አይቻልም።");
            }
          }
        }
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" }
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
        { fields: ["land_level"] },
        { fields: ["user_id"] },
        { fields: ["application_id"] },
        { fields: ["land_use"] },
        { fields: ["ownership_type"] }
      ],
      hooks: {
        beforeCreate: async (landRecord, options) => {
          // Validate user_id and administrative_unit_id
          const user = await db.models.User.findByPk(landRecord.user_id, {
            transaction: options.transaction
          });
          if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
          if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
            throw new Error("የመሬት መዝገብ አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።");
          }
          // Validate unique parcel_number within administrative_unit_id
          const existing = await db.models.LandRecord.findOne({
            where: {
              parcel_number: landRecord.parcel_number,
              administrative_unit_id: landRecord.administrative_unit_id
            },
            transaction: options.transaction
          });
          if (existing) throw new Error("ይህ የመሬት ቁጥር አስቀድመው ተመዝግቧል።");
          // Validate application_id
          const application = await db.models.Application.findByPk(
            landRecord.application_id,
            { transaction: options.transaction }
          );
          if (!application) throw new Error("መጠየቂያ አልተገኘም።");
          if (
            application.user_id !== landRecord.user_id ||
            application.administrative_unit_id !== landRecord.administrative_unit_id ||
            !["ረቂቅ", "ቀርቧል"].includes(application.status)
          ) {
            throw new Error("የመጠየቂያ ተጠቃሚ፣ አስተዳደራዊ ክፍል ወይም ሁኔታ ከመሬት መዝገብ ጋር መመሳሰል አለበት።");
          }
        },
        beforeUpdate: async (landRecord, options) => {
          // Validate administrative_unit_id and user_id on update
          if (landRecord.changed("administrative_unit_id") || landRecord.changed("user_id")) {
            const user = await db.models.User.findByPk(landRecord.user_id, {
              transaction: options.transaction
            });
            if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
            if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
              throw new Error("የመሬት መዝገብ አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።");
            }
            // Validate application_id consistency
            const application = await db.models.Application.findByPk(
              landRecord.application_id,
              { transaction: options.transaction }
            );
            if (
              application.user_id !== landRecord.user_id ||
              application.administrative_unit_id !== landRecord.administrative_unit_id
            ) {
              throw new Error("የመጠየቂያ ተጠቃሚ እና አስተዳደራዊ ክፍል ከመሬት መዝገብ ጋር መመሳሰል አለባቸው።");
            }
          }
          // Prevent updates if application is APPROVED
          const application = await db.models.Application.findByPk(
            landRecord.application_id,
            { transaction: options.transaction }
          );
          if (application.status === "ጸድቋል") {
            throw new Error("የጸድቋል መጠየቂያ ጋር የተገናኘ መሬት መዝገብ መቀየር አይቻልም።");
          }
        }
      },
      validate: {
        async validLandLevel() {
          const unit = await db.models.AdministrativeUnit.findByPk(this.administrative_unit_id);
          if (unit && this.land_level > unit.max_land_levels) {
            throw new Error("የመሬት ደረጃ ከአስተዳደር ክፍል ከፍተኛ ደረጃ መብለጥ አይቻልም።");
          }
        }
      }
    }
  );

  return LandRecord;
};