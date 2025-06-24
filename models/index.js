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
const Application = require("./Application")(db, DataTypes);
const LandPayment = require("./LandPayment")(db, DataTypes);
const Document = require("./Document")(db, DataTypes);

// ሞዴሎች ዝርዝር (Models object)
const models = {
  Role,
  Region,
  Zone,
  Woreda,
  OversightOffice,
  AdministrativeUnit,
  User,
  LandRecord,
  Application,
  LandPayment,
  Document,
};

// ግንኙነቶችን መግለጽ (Define associations)

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
User.hasMany(Application, {
  as: "applications",
  foreignKey: "user_id",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(LandRecord, {
  as: "landRecords",
  foreignKey: "user_id",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(Application, {
  as: "createdApplications",
  foreignKey: "created_by",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
User.hasMany(Application, {
  as: "updatedApplications",
  foreignKey: "updated_by",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.hasMany(Application, {
  as: "approvedApplications",
  foreignKey: "approved_by",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.hasMany(Application, {
  as: "deletedApplications",
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
AdministrativeUnit.hasMany(User, {
  foreignKey: "administrative_unit_id",
  as: "users",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
AdministrativeUnit.hasMany(Application, {
  foreignKey: "administrative_unit_id",
  as: "applications",
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
LandRecord.belongsTo(AdministrativeUnit, {
  foreignKey: "administrative_unit_id",
  as: "administrativeUnit",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
LandRecord.belongsTo(Application, {
  foreignKey: "application_id",
  as: "application",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

// Application associations
Application.belongsTo(User, {
  foreignKey: "user_id",
  as: "owner",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Application.belongsTo(User, {
  foreignKey: "created_by",
  as: "creator",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Application.belongsTo(User, {
  foreignKey: "updated_by",
  as: "updater",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
Application.belongsTo(User, {
  foreignKey: "approved_by",
  as: "approver",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
Application.belongsTo(User, {
  foreignKey: "deleted_by",
  as: "deleter",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
Application.belongsTo(AdministrativeUnit, {
  foreignKey: "administrative_unit_id",
  as: "administrativeUnit",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Application.hasOne(LandRecord, {
  foreignKey: "application_id",
  as: "landRecord",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
Application.hasMany(Document, {
  foreignKey: "application_id",
  as: "documents",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Application.hasMany(LandPayment, {
  foreignKey: "application_id",
  as: "payments",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Application.hasMany(Application, {
  foreignKey: "related_application_id",
  as: "relatedApplications",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

// LandPayment associations
LandPayment.belongsTo(Application, {
  foreignKey: "application_id",
  as: "application",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// Document associations
Document.belongsTo(Application, {
  foreignKey: "application_id",
  as: "application",
  onDelete: "CASCADE",
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
  Application,
  LandPayment,
  Document,
};