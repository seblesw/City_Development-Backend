const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

module.exports = (db, DataTypes) => {
  const User = db.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      first_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "ስም ባዶ መሆን አይችልም።" },
          len: { args: [2, 50], msg: "ስም ከ2 እስከ 50 ቁምፊዎች መሆን አለበት።" },
        },
      },
      last_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የአባት ስም ባዶ መሆን አይችልም።" },
          len: { args: [2, 50], msg: "የአባት ስም ከ2 እስከ 50 ቁምፊዎች መሆን አለበት።" },
        },
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: { msg: "ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።" },
        validate: {
          isEmail: { msg: "ትክክለኛ ኢሜይል ያስገቡ።" },
        },
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: { msg: "ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።" },
        validate: {
          is: {
            args: [/^\+251[79]\d{8}$/],
            msg: "ትክክለኛ ስልክ ቁጥር ያስገቡ (+2517... ወይም +2519...)።",
          },
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "roles", key: "id" },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" },
      },
      oversight_office_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "oversight_offices", key: "id" },
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: { msg: "ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።" },
        validate: {
          notEmpty: { msg: "ብሔራዊ መታወቂያ ቁጥር ባዶ መሆን አይችልም።" },
          len: {
            args: [5, 50],
            msg: "ብሔራዊ መታወቂያ ቁጥር ከ5 እስከ 50 ቁምፊዎች መሆን አለበት።",
          },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "ብሔራዊ መታወቂያ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መሆን አለበት።",
          },
        },
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["ወንድ", "ሴት", "ሌላ"]],
            msg: "ጾታ ከተፈቀዱት እሴቶች (ወንድ, ሴት, ሌላ) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      relationship_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [["የትዳር ጓደኛ", "ልጅ", "ወላጅ", "ወንድም", "እህት", "ሌላ"]],
            msg: "የግንኙነት አይነት ከተፈቀዱት እሴቶች (የትዳር ጓደኛ, ልጅ, ወላጅ, ወንድም/እህት, ሌላ) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      marital_status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["ነጠላ", "ባለትዳር", "ቤተሰብ", "የጋራ ባለቤትነት"]],
            msg: "የጋብቻ ሁኔታ ከተፈቀዱት እሴቶች (ነጠላ, ባለትዳር, ቤተሰብ, የጋራ ባለቤትነት) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      primary_owner_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_login: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      action_log: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
        validate: {
          isValidLog(value) {
            if (!Array.isArray(value)) {
              throw new Error("የተግባር መዝገብ ዝርዝር መሆን አለበት።");
            }
            for (const entry of value) {
              if (!entry.action || typeof entry.action !== "string") {
                throw new Error("የተግባ�r መዝገብ ተግባር ትክክለኛ መሆን አለበት።");
              }
              if (!entry.changed_at || isNaN(new Date(entry.changed_at))) {
                throw new Error("የተግባር መዝገብ የተቀየረበት ቀን ትክክለኛ መሆን አለበት።");
              }
              if (!entry.changed_by) {
                throw new Error("የተግባር መዝገብ ተቀያሪ መግለጥ አለበት።");
              }
            }
          },
        },
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        validate: {
          isDate: { msg: "የማጥፊያ ቀን ትክክለኛ መሆን አለበት።" },
        },
        field: "deleted_at",
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "users",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        {
          fields: ["email"],
          unique: true,
          where: { email: { [Op.ne]: null } },
        },
        {
          fields: ["phone_number"],
          unique: true,
          where: { phone_number: { [Op.ne]: null } },
        },
        { fields: ["national_id"], unique: true },
        { fields: ["role_id"], where: { role_id: { [Op.ne]: null } } },
        { fields: ["administrative_unit_id"] },
        {
          fields: ["oversight_office_id"],
          where: { oversight_office_id: { [Op.ne]: null } },
        },
        {
          fields: ["primary_owner_id"],
          where: { primary_owner_id: { [Op.ne]: null } },
        },
        { fields: ["is_active"] },
        { fields: ["created_at"] },
        { fields: ["deleted_at"], where: { deleted_at: { [Op.ne]: null } } },
      ],
      hooks: {
        beforeCreate: async (user, options) => {
          // Validate administrative_unit_id
          const adminUnit = await db.models.AdministrativeUnit.findByPk(
            user.administrative_unit_id,
            {
              transaction: options.transaction,
            }
          );
          if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");

          // Validate role_id
          if (user.role_id) {
            const role = await db.models.Role.findByPk(user.role_id, {
              transaction: options.transaction,
            });
            if (!role || !["መዝጋቢ", "ማናጀር"].includes(role.name)) {
              throw new Error("ትክክለኛ ሚና ይምረጡ (መዝጋቢ ወይም ማናጀር)።");
            }
          }
          // Validate email or phone_number for primary users
          if (!user.primary_owner_id && !user.email && !user.phone_number) {
            throw new Error(
              "ኢሜይል ወይም ስልክ ቁጥር ከነዚህ ውስጥ አንዱ መግባት አለበት ለዋና ተጠቃሚ።"
            );
          }
          // Validate marital_status and primary_owner_id
          if (user.primary_owner_id && user.marital_status === "ነጠላ") {
            throw new Error("ነጠላ ተጠቃሚዎች የጋራ ባለቤት መኖር አይችሉም።");
          }
          // Validate relationship_type for co-owners
          if (user.primary_owner_id && !user.relationship_type) {
            throw new Error("የጋራ ባለቤቶች የግንኙነት አይነት መግለጥ አለባቸው።");
          }
          // Validate primary_owner_id
          if (user.primary_owner_id) {
            const primaryOwner = await User.findByPk(user.primary_owner_id, {
              transaction: options.transaction,
            });
            if (!primaryOwner || primaryOwner.primary_owner_id !== null) {
              throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
            }
            if (primaryOwner.marital_status === "ነጠላ") {
              throw new Error("ዋና ባለቤት ነጠላ ስለሆነ የጋራ ባለቤት መጨመር አይችልም።");
            }
          }
          // Validate password rules
          if (!user.primary_owner_id && !user.password) {
            user.password = await bcrypt.hash("12345678", 10);
          }
          if (user.primary_owner_id && user.password) {
            throw new Error("የጋራ ባለቤቶች የይለፍ ቃል መኖር አይችልም።");
          }

          // Initialize action_log
          user.action_log = [
            {
              action: "CREATED",
              changed_by: user.id || user.primary_owner_id || null,
              changed_at: user.created_at || new Date(),
            },
          ];
        },
        beforeUpdate: async (user, options) => {
          // Validate administrative_unit_id
          if (user.changed("administrative_unit_id")) {
            const adminUnit = await db.models.AdministrativeUnit.findByPk(
              user.administrative_unit_id,
              {
                transaction: options.transaction,
              }
            );
            if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
          }

          // Validate role_id
          if (user.changed("role_id") && user.role_id) {
            const role = await db.models.Role.findByPk(user.role_id, {
              transaction: options.transaction,
            });
            if (!role || !["መመዝገቢ", "አስተዳደር"].includes(role.name)) {
              throw new Error("ትክክለኛ ሚና ይምረጡ (መመዝገቢ ወይም አስተዳደር)።");
            }
          }

          // Validate email or phone_number for primary users
          if (
            (user.changed("email") || user.changed("phone_number")) &&
            !user.primary_owner_id
          ) {
            if (!user.email && !user.phone_number) {
              throw new Error(
                "ኢሜይል ወይም ስልክ ቁጥር ከነዚህ ውስጥ አንዱ መግባት አለበት ለዋና ተጠቃሚ።"
              );
            }
          }

          // Validate marital_status and primary_owner_id
          if (
            user.changed("marital_status") ||
            user.changed("primary_owner_id")
          ) {
            if (user.primary_owner_id && user.marital_status === "ነጠላ") {
              throw new Error("ነጠላ ተጠቃሚዎች የጋራ ባለቤት መኖር አይችሉም።");
            }
            if (user.primary_owner_id && !user.relationship_type) {
              throw new Error("የጋራ ባለቤቶች የግንኙነት አይነት መግለጥ አለባቸው።");
            }
          }

          // Validate primary_owner_id
          if (user.changed("primary_owner_id") && user.primary_owner_id) {
            const primaryOwner = await User.findByPk(user.primary_owner_id, {
              transaction: options.transaction,
            });
            if (!primaryOwner || primaryOwner.primary_owner_id !== null) {
              throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
            }
            if (primaryOwner.marital_status === "ነጠላ") {
              throw new Error("ዋና ባለቤት ነጠላ ስለሆነ የጋራ ባለቤት መጨመር አዯችልም።");
            }
          }

          // Validate password rules
          if (user.changed("password") && user.password) {
            if (user.primary_owner_id) {
              throw new Error("የጋራ ባለቤቶች የይለፍ ቃል መኖር አዯችልም።");
            }
            user.password = await bcrypt.hash(user.password, 10);
          }
        },

        beforeDestroy: async (user, options) => {
          // Validate deletion role
          const deleter = await db.models.User.findByPk(options.changed_by, {
            include: [{ model: db.models.Role, as: "role" }],
            transaction: options.transaction,
          });
          if (!deleter || !["አስተዳደር"].includes(deleter.role?.name)) {
            throw new Error("ተጠቃሚ መሰረዝ የሚችሉት አስተዳደር ብቻ ናቸው።");
          }

          // Log deletion in action_log
          user.action_log = [
            ...(user.action_log || []),
            {
              action: "DELETED",
              changed_by: options.changed_by,
              changed_at: new Date(),
            },
          ];
          await user.save({ transaction: options.transaction });
        },
      },
    }
  );

  User.prototype.validatePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
  };

  return User;
};
