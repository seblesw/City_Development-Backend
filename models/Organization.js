const ORGANIZATION_TYPES = {
  PRIVATE: "በግል",
  PLC: "ፒኤልሲ",
  SHARED: "ሽርክና",
};

const EIA_DOCUMENT = {
  APPROVED: "ያፀደቀ",
  UNAPROVED: "ያላፀደቀ",
};

module.exports = (db, DataTypes) => {
  const Organization = db.define(
    "Organization",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      organization_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(ORGANIZATION_TYPES)],
            msg: "የድርጅቱ አይነት ከተፈቀዱት ውስጥ መሆን አለበት።",
          },
        },
      },
      eia_document: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(EIA_DOCUMENT)],
            msg: "የEIA ሰነድ ከተፈቀዱት ውስጥ መሆን አለበት።",
          },
        },
      },
      permit_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      permit_issue_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "organizations",
      timestamps: true,
      paranoid: true,
    }
  );
  return {Organization, ORGANIZATION_TYPES, EIA_DOCUMENT};
};
