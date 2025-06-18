const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");

// Load models in dependency order
const Role = require("./Role")(db, DataTypes);
const User = require("./User")(db, DataTypes);
const RefreshToken = require("./RefreshToken")(db, DataTypes);
const Region = require("./Region")(db, DataTypes);
const AdministrativeUnit = require("./AdministrativeUnit")(db, DataTypes);
const LandOwner = require("./LandOwner")(db, DataTypes);
const CoOwners = require("./CoOwners")(db, DataTypes);
const LandRecord = require("./LandRecord")(db, DataTypes);
const Document = require("./Document")(db, DataTypes);
const LandPayment = require("./LandPayment")(db, DataTypes);
const Application = require("./Application")(db, DataTypes);

// Define models
const models = {
  Role,
  User,
  RefreshToken,
  Region,
  AdministrativeUnit,
  LandOwner,
  CoOwners,
  LandRecord,
  Document,
  LandPayment,
  Application
};

// Define associations
// Role associations
models.Role.hasMany(models.User, { foreignKey: "role_id", as: "users" });
models.Role.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.Role.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// User associations
models.User.belongsTo(models.Role, { foreignKey: "role_id", as: "role" });
models.User.hasOne(models.LandOwner, { foreignKey: "user_id", as: "landOwner" });
models.User.hasMany(models.RefreshToken, { foreignKey: "user_id", as: "refreshTokens" });
models.User.hasMany(models.Role, { foreignKey: "created_by", as: "createdRoles" });
models.User.hasMany(models.Role, { foreignKey: "updated_by", as: "updatedRoles" });
models.User.hasMany(models.Region, { foreignKey: "created_by", as: "createdRegions" });
models.User.hasMany(models.Region, { foreignKey: "updated_by", as: "updatedRegions" });
models.User.hasMany(models.AdministrativeUnit, { foreignKey: "created_by", as: "createdUnits" });
models.User.hasMany(models.AdministrativeUnit, { foreignKey: "updated_by", as: "updatedUnits" });
models.User.hasMany(models.LandOwner, { foreignKey: "user_id", as: "landOwners" });
models.User.hasMany(models.LandOwner, { foreignKey: "created_by", as: "createdLandOwners" });
models.User.hasMany(models.LandOwner, { foreignKey: "updated_by", as: "updatedLandOwners" });
models.User.hasMany(models.CoOwners, { foreignKey: "created_by", as: "createdCoOwners" });
models.User.hasMany(models.CoOwners, { foreignKey: "updated_by", as: "updatedCoOwners" });
models.User.hasMany(models.LandRecord, { foreignKey: "registered_by", as: "registeredLandRecords" });
models.User.hasMany(models.LandRecord, { foreignKey: "approved_by", as: "approvedLandRecords" });
models.User.hasMany(models.Document, { foreignKey: "created_by", as: "createdDocuments" });
models.User.hasMany(models.Document, { foreignKey: "updated_by", as: "updatedDocuments" });
models.User.hasMany(models.LandPayment, { foreignKey: "recorded_by", as: "recordedPayments" });
models.User.hasMany(models.LandPayment, { foreignKey: "created_by", as: "createdPayments" });
models.User.hasMany(models.LandPayment, { foreignKey: "updated_by", as: "updatedPayments" });
models.User.hasMany(models.Application, { foreignKey: "created_by", as: "createdApplications" });
models.User.hasMany(models.Application, { foreignKey: "updated_by", as: "updatedApplications" });

// Region associations
models.Region.hasMany(models.AdministrativeUnit, { foreignKey: "region_id", as: "administrativeUnits" });
models.Region.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.Region.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// AdministrativeUnit associations
models.AdministrativeUnit.belongsTo(models.Region, { foreignKey: "region_id", as: "region" });
models.AdministrativeUnit.belongsTo(models.AdministrativeUnit, { foreignKey: "parent_id", as: "parent" });
models.AdministrativeUnit.hasMany(models.AdministrativeUnit, { foreignKey: "parent_id", as: "children" });
models.AdministrativeUnit.hasMany(models.LandOwner, { foreignKey: "administrative_unit_id", as: "landOwners" });
models.AdministrativeUnit.hasMany(models.LandRecord, { foreignKey: "administrative_unit_id", as: "landRecords" });
models.AdministrativeUnit.hasMany(models.Application, { foreignKey: "administrative_unit_id", as: "applications" });
models.AdministrativeUnit.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.AdministrativeUnit.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// LandOwner associations
models.LandOwner.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
models.LandOwner.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.LandOwner.hasMany(models.CoOwners, { foreignKey: "land_owner_id", as: "coOwners" });
models.LandOwner.hasMany(models.LandRecord, { foreignKey: "owner_id", as: "landRecords" });
models.LandOwner.hasMany(models.Application, { foreignKey: "land_owner_id", as: "applications" });
models.LandOwner.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.LandOwner.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// CoOwners associations
models.CoOwners.belongsTo(models.LandOwner, { foreignKey: "land_owner_id", as: "landOwner" });
models.CoOwners.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.CoOwners.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// LandRecord associations
models.LandRecord.belongsTo(models.LandOwner, { foreignKey: "owner_id", as: "owner" });
models.LandRecord.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.LandRecord.belongsTo(models.User, { foreignKey: "registered_by", as: "registrar" });
models.LandRecord.belongsTo(models.User, { foreignKey: "approved_by", as: "approver" });
models.LandRecord.hasMany(models.Document, { foreignKey: "land_record_id", as: "documents" });
models.LandRecord.hasMany(models.LandPayment, { foreignKey: "land_record_id", as: "payments" });
models.LandRecord.hasMany(models.Application, { foreignKey: "land_record_id", as: "applications" });

// Document associations
models.Document.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.Document.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.Document.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });
models.Document.hasMany(models.Application, { foreignKey: "document_id", as: "applications" });

// LandPayment associations
models.LandPayment.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.LandPayment.belongsTo(models.User, { foreignKey: "recorded_by", as: "recorder" });
models.LandPayment.belongsTo(models.User, { foreignKey: "created_by", as: "paymentCreator" });
models.LandPayment.belongsTo(models.User, { foreignKey: "updated_by", as: "paymentUpdater" });
models.LandPayment.hasMany(models.Application, { foreignKey: "land_payment_id", as: "applications" });

// Application associations
models.Application.belongsTo(models.LandOwner, { foreignKey: "land_owner_id", as: "owner" });
models.Application.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.Application.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.Application.belongsTo(models.Document, { foreignKey: "document_id", as: "document" });
models.Application.belongsTo(models.LandPayment, { foreignKey: "land_payment_id", as: "landPayment" });
models.Application.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.Application.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// RefreshToken associations
models.RefreshToken.belongsTo(models.User, { foreignKey: "user_id", as: "user" });

// Export Sequelize instance and models
module.exports = {
  sequelize: db,
  Sequelize,
  ...models
};