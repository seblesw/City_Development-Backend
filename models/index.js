const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");
// Load models in dependency order to ensure foreign key references are resolved
const Role = require("./Role")(db, DataTypes);
const Region = require("./Region")(db, DataTypes);
const Zone = require("./Zone")(db, DataTypes);
const Woreda = require("./Woreda")(db, DataTypes);
const OversightOffice = require("./OversightOffice")(db, DataTypes);
const AdministrativeUnit = require("./AdministrativeUnit")(db, DataTypes);
const User = require("./User")(db, DataTypes);
const {
  LandRecord,
  RECORD_STATUSES,
  NOTIFICATION_STATUSES,
  PRIORITIES,
  LAND_USE_TYPES,
  OWNERSHIP_TYPES,
  LEASE_OWNERSHIP_TYPE,
  ZONING_TYPES,
} = require("./LandRecord")(db, DataTypes);
const LandOwner = require("./LandOwner")(db, DataTypes);
const PaymentSchedule = require("./PaymentSchedule")(db, DataTypes);
const { LandPayment, PAYMENT_STATUSES, PAYMENT_TYPES } =
  require("./LandPayment")(db, DataTypes);
const { Document, DOCUMENT_TYPES } = require("./Document")(db, DataTypes);

// Role associations
Role.hasMany(User, {
  foreignKey: "role_id",
  as: "users",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// User associations
User.belongsTo(User, {
  foreignKey: "updated_by",
  as: "updater",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.belongsTo(User, {
  foreignKey: "created_by",
  as: "creator",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.belongsTo(User, {
  foreignKey: "deleted_by",
  as: "deleter",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.belongsTo(Role, {
  foreignKey: "role_id",
  as: "role",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.belongsTo(AdministrativeUnit, {
  foreignKey: "administrative_unit_id",
  as: "administrativeUnit",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.belongsTo(OversightOffice, {
  foreignKey: "oversight_office_id",
  as: "oversightOffice",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.belongsToMany(LandRecord, {
  through: LandOwner,
  foreignKey: "user_id",
  as: "ownedLandRecords",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(LandRecord, {
  as: "createdLandRecords",
  foreignKey: "created_by",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(LandRecord, {
  as: "updatedLandRecords",
  foreignKey: "updated_by",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(LandRecord, {
  as: "approvedLandRecords",
  foreignKey: "approved_by",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(LandRecord, {
  as: "deletedLandRecords",
  foreignKey: "deleted_by",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(Document, {
  foreignKey: "uploaded_by",
  as: "uploadedDocuments",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(Document, {
  foreignKey: "inactived_by",
  as: "inactivedDocuments",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(LandPayment, {
  as: "payerPayments",
  foreignKey: "payer_id",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// Region associations
Region.hasMany(Zone, {
  foreignKey: "region_id",
  as: "zones",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Region.hasMany(AdministrativeUnit, {
  foreignKey: "region_id",
  as: "administrativeUnits",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Region.hasMany(OversightOffice, {
  foreignKey: "region_id",
  as: "oversightOffices",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// Zone associations
Zone.belongsTo(Region, {
  foreignKey: "region_id",
  as: "region",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Zone.hasMany(Woreda, {
  foreignKey: "zone_id",
  as: "woredas",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Zone.hasMany(AdministrativeUnit, {
  foreignKey: "zone_id",
  as: "administrativeUnits",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Zone.hasMany(OversightOffice, {
  foreignKey: "zone_id",
  as: "oversightOffices",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// Woreda associations
Woreda.belongsTo(Zone, {
  foreignKey: "zone_id",
  as: "zone",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Woreda.hasMany(AdministrativeUnit, {
  foreignKey: "woreda_id",
  as: "administrativeUnits",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Woreda.hasMany(OversightOffice, {
  foreignKey: "woreda_id",
  as: "oversightOffices",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// OversightOffice associations
OversightOffice.hasMany(AdministrativeUnit, {
  foreignKey: "oversight_office_id",
  as: "administrativeUnits",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
OversightOffice.hasMany(User, {
  foreignKey: "oversight_office_id",
  as: "users",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
OversightOffice.belongsTo(Region, {
  foreignKey: "region_id",
  as: "region",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
OversightOffice.belongsTo(Zone, {
  foreignKey: "zone_id",
  as: "zone",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
OversightOffice.belongsTo(Woreda, {
  foreignKey: "woreda_id",
  as: "woreda",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// AdministrativeUnit associations
AdministrativeUnit.belongsTo(OversightOffice, {
  foreignKey: "oversight_office_id",
  as: "oversightOffice",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
AdministrativeUnit.belongsTo(Woreda, {
  foreignKey: "woreda_id",
  as: "woreda",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
AdministrativeUnit.belongsTo(Zone, {
  foreignKey: "zone_id",
  as: "zone",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
AdministrativeUnit.belongsTo(Region, {
  foreignKey: "region_id",
  as: "region",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
AdministrativeUnit.hasMany(User, {
  foreignKey: "administrative_unit_id",
  as: "users",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
AdministrativeUnit.hasMany(LandRecord, {
  foreignKey: "administrative_unit_id",
  as: "landRecords",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// LandRecord associations
LandRecord.belongsToMany(User, {
  through: LandOwner,
  foreignKey: "land_record_id",
  as: "owners",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
LandRecord.belongsTo(User, {
  foreignKey: "created_by",
  as: "creator",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
LandRecord.belongsTo(User, {
  foreignKey: "updated_by",
  as: "updater",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
LandRecord.belongsTo(User, {
  foreignKey: "approved_by",
  as: "approver",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
LandRecord.belongsTo(User, {
  foreignKey: "deleted_by",
  as: "deleter",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
LandRecord.belongsTo(AdministrativeUnit, {
  foreignKey: "administrative_unit_id",
  as: "administrativeUnit",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
LandRecord.hasMany(Document, {
  foreignKey: "land_record_id",
  as: "documents",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
LandRecord.hasMany(LandPayment, {
  foreignKey: "land_record_id",
  as: "payments",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// LandPayment associations
LandPayment.belongsTo(LandRecord, {
  foreignKey: "land_record_id",
  as: "landRecord",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
LandPayment.belongsTo(User, {
  foreignKey: "payer_id",
  as: "payer",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
LandPayment.hasMany(PaymentSchedule, {
  foreignKey: "land_payment_id",
  as: "paymentSchedules",
});

// Document associations
Document.belongsTo(LandRecord, {
  foreignKey: "land_record_id",
  as: "landRecord",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Document.belongsTo(User, {
  foreignKey: "uploaded_by",
  as: "uploader",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Document.belongsTo(User, {
  foreignKey: "inactived_by",
  as: "inactivator",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
PaymentSchedule.belongsTo(LandPayment, {
  foreignKey: "land_payment_id",
  as: "landPayment",
});
PaymentSchedule.hasMany(PaymentSchedule, {
  as: "Penalties",
  foreignKey: "related_schedule_id",
  as: "originalSchedule",
});
// Export Sequelize instance, models, and constants
module.exports = {
  sequelize: db,
  Sequelize,
  Role,
  Region,
  Zone,
  Woreda,
  OversightOffice,
  AdministrativeUnit,
  User,
  LandRecord,
  LandPayment,
  PaymentSchedule,
  LandOwner,
  Document,
  DOCUMENT_TYPES,
  RECORD_STATUSES,
  NOTIFICATION_STATUSES,
  PRIORITIES,
  LAND_USE_TYPES,
  OWNERSHIP_TYPES,
  LEASE_OWNERSHIP_TYPE,
  ZONING_TYPES,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
};
