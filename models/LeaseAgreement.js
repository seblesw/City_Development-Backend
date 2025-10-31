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
        allowNull: false,
        references: { model: "administrative_units", key: "id" },
      },
      leas_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "lease_users", key: "id" },
      },
      leased_area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: { args: [0.1], msg: "የተከራየ ስፋት ከ0.1 ካሬ ሜትር በታች መሆን አይችልም።" },
        },
      },
      lease_end_date: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: { msg: "የኪራይ መጨረሻ ቀን ትክክለኛ ቀን መሆን አለበት።" },
          notNull: { msg: "የኪራይ መጨረሻ ቀን መግለጽ አለበት።" },
          isAfterStartDate(value) {
            if (new Date(value) <= new Date(this.lease_start_date)) {
              throw new Error("የኪራይ መጨረሻ ቀን ከመጀመሪያ ቀን በኋላ መሆን አለበት።");
            }
          },
        },
      },
      lease_start_date: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: { msg: "የኪራይ መጀመሪያ ቀን ትክክለኛ ቀን መሆን አለበት።" },
        },
      },
      lease_terms: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      lease_year: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      lease_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      page_number: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: LEASE_STATUSES.ACTIVE,
        validate: {
          isIn: {
            args: [Object.values(LEASE_STATUSES)],
            msg: `የኪራይ ሁኔታ ከተፈቀዱቷ (${Object.values(LEASE_STATUSES).join(
              ", "
            )}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      payment_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "land_payments", key: "id" },
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
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
        { fields: ["payment_id"] },
        { fields: ["status"] },
      ],
    }
  );

  return {
    LeaseAgreement,
    LEASE_STATUSES,
  };
};
