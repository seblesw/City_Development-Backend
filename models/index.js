const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");
// ሞዴሎችን በተከታታይ ቅደም ተከተል መጫን (Load models in dependency order)
const Role = require("./Role")(db, DataTypes);
const Region = require("./Region")(db, DataTypes);
const Zone = require("./Zone")(db, DataTypes);
const Woreda = require("./Woreda")(db, DataTypes);
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
  AdministrativeUnit,
  User,
  LandRecord,
  Application,
  LandPayment,
  Document,
};

// ግንኙነቶችን መግለጽ (Define associations)

// Role associations
models.Role.hasMany(models.User, {
  foreignKey: "role_id",
  as: "users",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// User associations
models.User.belongsTo(models.User, {
  as: "primaryOwner",
  foreignKey: "primary_owner_id",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.User.hasMany(models.User, {
  as: "coOwners",
  foreignKey: "primary_owner_id",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.User.belongsTo(models.Role, {
  foreignKey: "role_id",
  as: "role",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.User.belongsTo(models.AdministrativeUnit, {
  foreignKey: "administrative_unit_id",
  as: "administrativeUnit",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.User.hasMany(models.Application, {
  as: "applications",
  foreignKey: "user_id",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.User.hasMany(models.LandRecord, {
  as: "landRecords",
  foreignKey: "user_id",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.User.hasMany(models.Application, {
  as: "createdApplications",
  foreignKey: "created_by",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.User.hasMany(models.Application, {
  as: "updatedApplications",
  foreignKey: "updated_by",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.User.hasMany(models.Application, {
  as: "approvedApplications",
  foreignKey: "approved_by",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.User.hasMany(models.Application, {
  as: "deletedApplications",
  foreignKey: "deleted_by",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

// Region associations
models.Region.hasMany(models.Zone, {
  foreignKey: "region_id",
  as: "zones",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// Zone associations
models.Zone.belongsTo(models.Region, {
  foreignKey: "region_id",
  as: "region",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
models.Zone.hasMany(models.Woreda, {
  foreignKey: "zone_id",
  as: "woredas",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// Woreda associations
models.Woreda.belongsTo(models.Zone, {
  foreignKey: "zone_id",
  as: "zone",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
models.Woreda.hasMany(models.AdministrativeUnit, {
  foreignKey: "woreda_id",
  as: "administrativeUnits",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// AdministrativeUnit associations
models.AdministrativeUnit.belongsTo(models.Woreda, {
  foreignKey: "woreda_id",
  as: "woreda",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
models.AdministrativeUnit.belongsTo(models.AdministrativeUnit, {
  foreignKey: "parent_id",
  as: "parent",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.AdministrativeUnit.hasMany(models.AdministrativeUnit, {
  foreignKey: "parent_id",
  as: "children",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.AdministrativeUnit.hasMany(models.User, {
  foreignKey: "administrative_unit_id",
  as: "users",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.AdministrativeUnit.hasMany(models.Application, {
  foreignKey: "administrative_unit_id",
  as: "applications",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.AdministrativeUnit.hasMany(models.LandRecord, {
  foreignKey: "administrative_unit_id",
  as: "landRecords",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

// LandRecord associations
models.LandRecord.belongsTo(models.User, {
  foreignKey: "user_id",
  as: "owner",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.LandRecord.belongsTo(models.AdministrativeUnit, {
  foreignKey: "administrative_unit_id",
  as: "administrativeUnit",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.LandRecord.belongsTo(models.Application, {
  foreignKey: "application_id",
  as: "application",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

// Application associations
models.Application.belongsTo(models.User, {
  foreignKey: "user_id",
  as: "owner",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.Application.belongsTo(models.User, {
  foreignKey: "created_by",
  as: "creator",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.Application.belongsTo(models.User, {
  foreignKey: "updated_by",
  as: "updater",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.Application.belongsTo(models.User, {
  foreignKey: "approved_by",
  as: "approver",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.Application.belongsTo(models.User, {
  foreignKey: "deleted_by",
  as: "deleter",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.Application.belongsTo(models.AdministrativeUnit, {
  foreignKey: "administrative_unit_id",
  as: "administrativeUnit",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
models.Application.hasOne(models.LandRecord, {
  foreignKey: "application_id",
  as: "landRecord",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
models.Application.hasMany(models.Document, {
  foreignKey: "application_id",
  as: "documents",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
models.Application.hasMany(models.LandPayment, {
  foreignKey: "application_id",
  as: "payments",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
models.Application.hasMany(models.Application, {
  foreignKey: "related_application_id",
  as: "relatedApplications",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

// LandPayment associations
models.LandPayment.belongsTo(models.Application, {
  foreignKey: "application_id",
  as: "application",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// Document associations
models.Document.belongsTo(models.Application, {
  foreignKey: "application_id",
  as: "application",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// ሞዴሎችን ከግንኙነቶች ጋር ማዋቀር (Initialize model-specific associations)
Object.values(models).forEach((model) => {
  if (typeof model.associate === "function") {
    model.associate(models);
  }
});

// የሴኪውል እና ሞዴሎችን መላክ (Export Sequelize instance and models)
module.exports = {
  sequelize: db,
  Sequelize,
  ...models,
};
