const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");

// ሞዴሎችን በተከታታይ ቅደም ተከተል መጫን (Load models in dependency order)
const Role = require("./Role")(db, DataTypes);
const Region = require("./Region")(db, DataTypes);
const Zone = require("./Zone")(db, DataTypes);
const Woreda = require("./Woreda")(db, DataTypes);
const OversightOffice = require("./OversightOffice")(db, DataTypes);
const AdministrativeUnit = require("./AdministrativeUnit")(db, DataTypes);
const User = require("./User")(db, DataTypes);
const LandRecord = require("./LandRecord")(db, DataTypes);
const LandPayment = require("./LandPayment")(db, DataTypes);
const Document = require("./Document")(db, DataTypes);
// Role associations
Role.hasMany(User, {
  foreignKey: "role_id",
  as: "users",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// User associations
User.belongsTo(User, {
  as: "primaryOwner",
  foreignKey: "primary_owner_id",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.hasMany(User, {
  as: "coOwners",
  foreignKey: "primary_owner_id",
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
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(LandRecord, {
  as: "landRecords",
  foreignKey: "user_id",
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
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.hasMany(LandRecord, {
  as: "approvedLandRecords",
  foreignKey: "approved_by",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.hasMany(LandRecord, {
  as: "deletedLandRecords",
  foreignKey: "deleted_by",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

// Region associations
Region.hasMany(Zone, {
  foreignKey: "region_id",
  as: "zones",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Region.hasMany(AdministrativeUnit, {
  foreignKey: "region_id",
  as: "administrativeUnits",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Region.hasMany(OversightOffice, {
  foreignKey: "region_id",
  as: "oversightOffices",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// Zone associations
Zone.belongsTo(Region, {
  foreignKey: "region_id",
  as: "region",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Zone.hasMany(Woreda, {
  foreignKey: "zone_id",
  as: "woredas",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Zone.hasMany(AdministrativeUnit, {
  foreignKey: "zone_id",
  as: "administrativeUnits",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// Woreda associations
Woreda.belongsTo(Zone, {
  foreignKey: "zone_id",
  as: "zone",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Woreda.hasMany(AdministrativeUnit, {
  foreignKey: "woreda_id",
  as: "administrativeUnits",
  onDelete: "CASCADE",
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
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
AdministrativeUnit.belongsTo(Zone, {
  foreignKey: "zone_id",
  as: "zone",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
AdministrativeUnit.belongsTo(Region, {
  foreignKey: "region_id",
  as: "region",
  onDelete: "CASCADE",
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
LandRecord.belongsTo(User, {
  foreignKey: "user_id",
  as: "owner",
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

// የሴኪውል እና ሞዴሎችን መላክ (Export Sequelize instance and models)
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
  Document,
};