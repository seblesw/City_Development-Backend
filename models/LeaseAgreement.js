const { DataTypes } = require('sequelize');

const LEASE_STATUSES = {
  ACTIVE: "ዝግጁ",
  TERMINATED: "ተቋርጧል",
  EXPIRED: "ጊዜው አልፏል",
};

module.exports = (db, DataTypes) => {
  const LeaseAgreement = db.define(
    "LeaseAgreement",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "land_records", key: "id" },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "administrative_units", key: "id" },
      },
      lessee_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      lessee_institution_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      leased_area: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: { args: [0.1], msg: "የተከራየ ስፋት ከ0.1 ካሬ ሜትር በታች መሆን አይችልም።" },
        },
      },
      lease_start_date: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: { msg: "የኪራይ መጀመሪያ ቀን ትክክለኛ ቀን መሆን አለበት።" },
        },
      },
      lease_end_date: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: { msg: "የኪራይ መጨረሻ ቀን ትክክለኛ ቀን መሆን አለበት።" },
          isAfterStartDate(value) {
            if (new Date(value) <= new Date(this.lease_start_date)) {
              throw new Error("የኪራይ መጨረሻ ቀን ከመጀመሪያ ቀን በኋላ መሆን አለበት።");
            }
          },
        },
      },
      lease_terms: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      annual_lease_amount: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: { args: [0], msg: "ዓመታዊ የኪራይ መጠን ከ0 በታች መሆን አይችልም።" },
        },
      },
      initial_lease_amount:{
        type:DataTypes.FLOAT,
        allowNull:true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: LEASE_STATUSES.DRAFT,
        validate: {
          isIn: {
            args: [Object.values(LEASE_STATUSES)],
            msg: `የኪራይ ሁኔታ ከተፈቀዱቷ (${Object.values(LEASE_STATUSES).join(", ")}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      lease_action_log: {
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
                throw new Error("የተግባር መዝገብ ተግባር ትክክለኛ መሆን አለበት።");
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
    },
    {
      tableName: "lease_agreements",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["land_record_id"] },
        { fields: ["administrative_unit_id"] },
        { fields: ["lessee_id"] },
        { fields: ["status"] },
      ],
    }
  );

  return {
    LeaseAgreement,
    LEASE_STATUSES,
  };
};