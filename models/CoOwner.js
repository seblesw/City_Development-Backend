module.exports = (db, DataTypes) => {
  const CoOwner = db.define(
    "CoOwner",
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
        references: { model: "users", key: "id" }
      },
      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "ሙሉ ስም ባዶ መሆን አዯችልም።" },
          len: { args: [2, 100], msg: "ሙሉ ስም ከ2 እስከ 100 ቁምፊዎች መሆን አለበት።" }
        }
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "ብሔራዊ መታወቂያ ቁጥር ባዶ መሆን አዯችልም።" },
          len: { args: [5, 50], msg: "ብሔራዊ መታወቂያ ቁጥር ከ5 እስከ 50 ቁምፊዎች መሆን አለበት።" },
          is: { args: /^[A-Za-z0-9-]+$/, msg: "ብሔራዊ መታወቂያ ቁጥር ፊ�0ል፣ ቁጥር ወይም ሰረዝ ብቻ መሆን አለበት።" }
        }
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "ስልክ ቁጥር ባዶ መሆን አዯችልም።" },
          is: { args: [/^\+251[79]\d{8}$/], msg: "ትክክለኛ ስልክ ቁጥር ያስገቡ (+2519... ወይም +2517...)።" }
        }
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["ሴት", "ወንድ", "ሌላ"]],
            msg: "ጾታ ከተፈቀዱት እሴቶች (ሴት፣ ወንድ፣ �ሌላ) ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      address_kebele: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የኬቤሌ አድራሻ ከ100 ቁምፊዎች መብለጥ አዯችልም።" }
        }
      },
      relationship_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [["የትዳር ጓደኛ", "ልጅ", "ወላጅ", "ወንድም/እህት", "ሌላ"]],
            msg: "የግንኙነት አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" }
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" }
      }
    },
    {
      tableName: "co_owners",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["user_id"] },
        { fields: ["national_id"] },
        { unique: true, fields: ["user_id", "national_id"] }
      ],
      hooks: {
        beforeCreate: async (coOwner, options) => {
          const user = await db.models.User.findByPk(coOwner.user_id, {
            transaction: options.transaction
          });
          if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
          if (coOwner.address_kebele && user.administrative_unit_id) {
            const adminUnit = await db.models.AdministrativeUnit.findByPk(user.administrative_unit_id, {
              transaction: options.transaction
            });
            if (!adminUnit) throw new Error("አስተዳደራዊ ክፍል አልተገኘም።");
            // Placeholder for kebele validation; customize based on your kebele hierarchy
            // Example: Check if address_kebele matches adminUnit's naming convention
          }
        },
        beforeUpdate: async (coOwner, options) => {
          if (coOwner.changed("user_id")) {
            const user = await db.models.User.findByPk(coOwner.user_id, {
              transaction: options.transaction
            });
            if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
            if (coOwner.address_kebele && user.administrative_unit_id) {
              const adminUnit = await db.models.AdministrativeUnit.findByPk(user.administrative_unit_id, {
                transaction: options.transaction
              });
              if (!adminUnit) throw new Error("አስተዳደራዊ ክፍል አልተገኘም።");
            }
          }
        }
      }
    }
  );

  return CoOwner;
};