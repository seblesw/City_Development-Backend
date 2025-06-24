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
  RECREATION: "መዝናኛ",
  OTHER: "ሌላ",
};

const OWNERSHIP_TYPES = {
  COURT_ORDER: "የፍርድ ቤት ትእዛዝ",
  TRANSFER: "የባለቤትነት ማስተላለፍ",
  LEASE: "የሊዝ ይዞታ",
  LEASE_ALLOCATION: "የሊዝ ይዞታ-ምደባ",
  NO_PRIOR_DOCUMENT: "ቅድመ ሰነድ የሌለው",
  DISPLACEMENT: "መፈናቀል",
};

module.exports = {
  LAND_USE_TYPES,
  OWNERSHIP_TYPES,
  model: (db, DataTypes) => {
    const LandRecord = db.define(
      "LandRecord",
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        parcel_number: {
          type: DataTypes.STRING,
          allowNull: false,
          validate: {
            notEmpty: { msg: "የመሬት ቁጥር ባዶ መሆን አይችልም።" },
            len: { args: [1, 50], msg: "የመሬት ቁጥር ከ1 እስከ 50 ቁምፊዎች መሆን አለበት።" },
            is: {
              args: /^[A-Za-z0-9-]+$/,
              msg: "የመሬት ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
            },
          },
        },
        land_level: {
          type: DataTypes.INTEGER,
          allowNull: false,
          validate: {
            min: { args: [1], msg: "ማህበረ ደረጃ ከ1 በታች መሆን አይችልም።" },
          },
        },
        administrative_unit_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "administrative_units", key: "id" },
        },
        application_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "applications", key: "id" },
        },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
        },
        area: {
          type: DataTypes.FLOAT,
          allowNull: false,
          validate: {
            min: { args: [0.1], msg: "ስፋት ከ0.1 ካሬ ሜትር በታች መሆን አይችልም።" },
          },
        },
        north_neighbor: {
          type: DataTypes.STRING,
          allowNull: true,
          validate: {
            len: { args: [0, 100], msg: "የሰሜን ጎራ ባለቤት ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
            isValidNeighbor(value) {
              if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
                throw new Error("የሰሜን ጎራ ባለቤት ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
              }
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የሰሜን ጎራ ባለቤት ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        east_neighbor: {
          type: DataTypes.STRING,
          allowNull: true,
          validate: {
            len: { args: [0, 100], msg: "የምሥራቅ ጎራ ባለቤት ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
            isValidNeighbor(value) {
              if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
                throw new Error("የምሥራቅ ጎራ ባለቤት ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
              }
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የምሥራቅ ጎራ ባለቤት ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        south_neighbor: {
          type: DataTypes.STRING,
          allowNull: true,
          validate: {
            len: { args: [0, 100], msg: "የደቡብ ጎራ ባለቤት ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
            isValidNeighbor(value) {
              if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
                throw new Error("የደቡብ ጎራ ባለቤት ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
              }
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የደቡብ ጎራ ባለቤት ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        west_neighbor: {
          type: DataTypes.STRING,
          allowNull: true,
          validate: {
            len: { args: [0, 100], msg: "የምዕራብ ጎራ ባለቤት ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
            isValidNeighbor(value) {
              if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
                throw new Error("የምዕራብ ጎራ ባለቤት ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
              }
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የምዕራብ ጎራ ባለቤት ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        block_number: {
          type: DataTypes.STRING,
          allowNull: true,
          validate: {
            len: { args: [0, 50], msg: "የቦታ ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።" },
            is: {
              args: /^[A-Za-z0-9-]+$/,
              msg: "የቦታ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የቦታ ቁጥር ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        block_special_name: {
          type: DataTypes.STRING,
          allowNull: true,
          validate: {
            len: { args: [0, 100], msg: "የቦታ ልዩ ስም ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
            is: {
              args: /^[a-zA-Z0-9\s-]+$/,
              msg: "የቦታ ልዩ ስም ፊደል፣ ቁጥር፣ ክፍተት ወዯም ሰረዝ ብቻ መያዝ አለበት።",
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የቦታ ልዩ ስም ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        land_use: {
          type: DataTypes.STRING,
          allowNull: false,
          validate: {
            isIn: {
              args: [Object.values(LAND_USE_TYPES)],
              msg: "የመሬት አጠቃቀም ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
            },
          },
        },
        ownership_type: {
          type: DataTypes.STRING,
          allowNull: false,
          validate: {
            isIn: {
              args: [Object.values(OWNERSHIP_TYPES)],
              msg: "የባለቤትነት አይነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
            },
          },
        },
        coordinates: {
          type: DataTypes.JSONB,
          allowNull: true,
          validate: {
            isValidCoordinates(value) {
              if (!value) return;
              if (!["Point", "Polygon"].includes(value.type)) {
                throw new Error("ትክክለኛ GeoJSON መሆን አለበት።");
              }
              if (value.type === "Point") {
                const [lon, lat] = value.coordinates;
                if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                  throw new Error("ኮርድኔት የተሳሳተ ነው።");
                }
                if (typeof lon === "number" && lon.toString().split(".")[1]?.length > 6) {
                  throw new Error("ኮርድኔት ትክክለኛነት ከ6 አስርዮሽ ቦታዎች መብለጥ አዯችልም።");
                }
              }
              if (value.type === "Polygon") {
                if (!Array.isArray(value.coordinates) || !value.coordinates.every((ring) => Array.isArray(ring))) {
                  throw new Error("Polygon መጋጠሚያ ትክክል አዯደለም።");
                }
                const [outerRing] = value.coordinates;
                if (outerRing.length < 4 || JSON.stringify(outerRing[0]) !== JSON.stringify(outerRing[outerRing.length - 1])) {
                  throw new Error("Polygon ውጫዊ ቀለበት መዘጋት አለበት።");
                }
                for (const [lon, lat] of outerRing) {
                  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                    throw new Error("Polygon ኮርድኔት የተሳሳተ ነው።");
                  }
                  if (typeof lon === "number" && lon.toString().split(".")[1]?.length > 6) {
                    throw new Error("Polygon ኮርድኔት ትክክለኛነት ከ6 አስርዮሽ ቦታዎች መብለጥ አዯችልም።");
                  }
                }
              }
            },
          },
        },
        registration_date: {
          type: DataTypes.DATE,
          allowNull: false,
          validate: {
            isDate: { msg: "ትክክለኛ ቀን ያስገቡ።" },
            notFutureDate(value) {
              const today = new Date();
              if (new Date(value) > today) {
                throw new Error("የምዝገባ ቀን ወደፊት መሆን አዯችልም።");
              }
            },
          },
        },
      },
      {
        tableName: "land_records",
        timestamps: true,
        paranoid: true,
        freezeTableName: true,
        indexes: [
          { unique: true, fields: ["parcel_number", "administrative_unit_id"] },
          { fields: ["administrative_unit_id"] },
          { fields: ["application_id"] },
          { fields: ["user_id"] },
          { fields: ["land_use"] },
          { fields: ["ownership_type"] },
          { fields: ["registration_date"] },
          { fields: ["block_number"] },
        ],
        hooks: {
          beforeCreate: async (landRecord, options) => {
            // Validate administrative_unit_id
            const adminUnit = await db.models.AdministrativeUnit.findByPk(landRecord.administrative_unit_id, {
              transaction: options.transaction,
            });
            if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");

            // Validate land_level against max_land_levels
            if (landRecord.land_level > adminUnit.max_land_levels) {
              throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አዯችልም።");
            }

            // Validate application_id
            const application = await db.models.Application.findByPk(landRecord.application_id, {
              transaction: options.transaction,
            });
            if (!application) throw new Error("ትክክለኛ መተግበሪያ ይምረጡ።");
            if (application.administrative_unit_id !== landRecord.administrative_unit_id) {
              throw new Error("የመሬት መዝገብ አስተዳደራዊ ክፍል ከመተግበሪያው ጋር መዛመድ አለበት።");
            }
            if (application.user_id !== landRecord.user_id) {
              throw new Error("የመሬት መዝገብ ተጠቃሚ ከመተግበሪያው ተጠቃሚ ጋር መዛመድ አለበት።");
            }

            // Validate user_id (primary owner)
            const user = await db.models.User.findByPk(landRecord.user_id, { transaction: options.transaction });
            if (!user || user.primary_owner_id !== null) {
              throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
            }

            // Validate block_number uniqueness within administrative_unit_id
            if (landRecord.block_number) {
              const existingBlock = await db.models.LandRecord.findOne({
                where: {
                  block_number: landRecord.block_number,
                  administrative_unit_id: landRecord.administrative_unit_id,
                  deleted_at: { [Op.eq]: null },
                },
                transaction: options.transaction,
              });
              if (existingBlock) throw new Error("ዯህ የቦታ ቁጥር በዯህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
            }

            // Validate parcel_number uniqueness within administrative_unit_id
            const existingParcel = await db.models.LandRecord.findOne({
              where: {
                parcel_number: landRecord.parcel_number,
                administrative_unit_id: landRecord.administrative_unit_id,
                deleted_at: { [Op.eq]: null },
              },
              transaction: options.transaction,
            });
            if (existingParcel) throw new Error("ዯህ የመሬት ቁጥር በዯህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
          },
          beforeUpdate: async (landRecord, options) => {
            // Validate administrative_unit_id on update
            if (landRecord.changed("administrative_unit_id") || landRecord.changed("land_level")) {
              const adminUnit = await db.models.AdministrativeUnit.findByPk(landRecord.administrative_unit_id, {
                transaction: options.transaction,
              });
              if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
              if (landRecord.land_level > adminUnit.max_land_levels) {
                throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አዯችልም።");
              }
            }

            // Validate application_id alignment
            if (
              landRecord.changed("application_id") ||
              landRecord.changed("administrative_unit_id") ||
              landRecord.changed("user_id")
            ) {
              const application = await db.models.Application.findByPk(landRecord.application_id, {
                transaction: options.transaction,
              });
              if (!application) throw new Error("ትክክለኛ መተግበሪያ ይምረጡ።");
              if (application.administrative_unit_id !== landRecord.administrative_unit_id) {
                throw new Error("የመሬት መዝገብ አስተዳደራዊ ክፍል ከመተግበሪያው ጋር መዛመዖ አለበቤ።");
              }
              if (application.user_id !== landRecord.user_id) {
                throw new Error("የመሬቤ መዝግቤ ቤጠቃሚ ከመቤግበሪያ ቤጠቃጤ ጋር መዛመዖ አለቤቤ።");
              }
            }

            // Validate block_number uniqueness on update
            if (landRecord.changed("block_number") || landRecord.changed("administrative_unit_id")) {
              if (landRecord.block_number) {
                const existingBlock = await db.models.LandRecord.findOne({
                  where: {
                    block_number: landRecord.block_number,
                    administrative_unit_id: landRecord.administrative_unit_id,
                    id: { [Op.ne]: landRecord.id },
                    deleted_at: { [Op.eq]: null },
                  },
                  transaction: options.transaction,
                });
                if (existingBlock) throw new Error("ዖህ የቦቤ ቁጤር ቤዖህ አስቤደደራዊ ክፍል ውስጤ ተመዝግቧል።");
              }
            }

            // Validate parcel_number uniqueness on update
            if (landRecord.changed("parcel_number") || landRecord.changed("administrative_unit_id")) {
              const existingParcel = await db.models.LandRecord.findOne({
                where: {
                  parcel_number: landRecord.parcel_number,
                  administrative_unit_id: landRecord.administrative_unit_id,
                  id: { [Op.ne]: landRecord.id },
                  deleted_at: { [Op.eq]: null },
                },
                transaction: options.transaction,
              });
              if (existingParcel) throw new Error("ዖህ የመሬቤ ቁጤር ቤዖህ አስቤደደራዖ ክፍል ውስጤ ተመዖግቤዖል።");
            }
          },
        },
        validate: {
          async validLandLevel() {
            const adminUnit = await db.models.AdministrativeUnit.findByPk(this.administrative_unit_id);
            if (adminUnit && this.land_level > adminUnit.max_land_levels) {
              throw new Error("የመሬቤ ደረግቤ ከአስቤደደራዖ ክፍሖ ከፍቤኛ ደረግቤ መቤልጤ አዖችልም።");
            }
          },
          atLeastOneNeighbor() {
            if (
              !this.north_neighbor &&
              !this.east_neighbor &&
              !this.south_neighbor &&
              !this.west_neighbor
            ) {
              throw new Error("ቢያንስ አንደ ጎረቤቤ መግለጤ አለቤ።");
            }
          },
        },
      }
    );

    return LandRecord;
  },
};