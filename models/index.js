const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");

// Load models in dependency order
const Role = require("./Role")(db, DataTypes);
const Region = require("./Region")(db, DataTypes);
const AdministrativeUnit = require("./AdministrativeUnit")(db, DataTypes);
const User = require("./User")(db, DataTypes);
const LandOwner = require("./LandOwner")(db, DataTypes);
const CoOwner = require("./CoOwner")(db, DataTypes); // Corrected from CoOwners
const LandRecord = require("./LandRecord")(db, DataTypes);
const Application = require("./Application")(db, DataTypes);
const LandPayment = require("./LandPayment")(db, DataTypes);
const Document = require("./Document")(db, DataTypes);

// Define models
const models = {
  Role,
  Region,
  AdministrativeUnit,
  User,
  LandOwner,
  CoOwner,
  LandRecord,
  Application,
  LandPayment,
  Document
};

// Define associations

// Role associations
models.Role.hasMany(models.User, { foreignKey: "role_id", as: "users" });
models.Role.belongsTo(models.User, { foreignKey: "created_by", as: "roleCreator" });
models.Role.belongsTo(models.User, { foreignKey: "updated_by", as: "roleUpdater" });

// User associations
models.User.belongsTo(models.Role, { foreignKey: "role_id", as: "role" });
models.User.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.User.hasOne(models.LandOwner, { foreignKey: "user_id", as: "landOwner" });
models.User.hasMany(models.Role, { foreignKey: "created_by", as: "createdRoles" });
models.User.hasMany(models.Role, { foreignKey: "updated_by", as: "updatedRoles" });
models.User.hasMany(models.Region, { foreignKey: "created_by", as: "createdRegions" });
models.User.hasMany(models.Region, { foreignKey: "updated_by", as: "updatedRegions" });
models.User.hasMany(models.AdministrativeUnit, { foreignKey: "created_by", as: "createdUnits" });
models.User.hasMany(models.AdministrativeUnit, { foreignKey: "updated_by", as: "updatedUnits" });
models.User.hasMany(models.LandOwner, { foreignKey: "created_by", as: "createdLandOwners" });
models.User.hasMany(models.LandOwner, { foreignKey: "updated_by", as: "updatedLandOwners" });
models.User.hasMany(models.CoOwner, { foreignKey: "created_by", as: "createdCoOwners" });
models.User.hasMany(models.CoOwner, { foreignKey: "updated_by", as: "updatedCoOwners" });
models.User.hasMany(models.LandRecord, { foreignKey: "registered_by", as: "registeredLandRecords" });
models.User.hasMany(models.LandRecord, { foreignKey: "approved_by", as: "approvedLandRecords" });
models.User.hasMany(models.Application, { foreignKey: "created_by", as: "createdApplications" });
models.User.hasMany(models.Application, { foreignKey: "updated_by", as: "updatedApplications" });
models.User.hasMany(models.LandPayment, { foreignKey: "created_by", as: "createdPayments" });
models.User.hasMany(models.LandPayment, { foreignKey: "updated_by", as: "updatedPayments" });
models.User.hasMany(models.Document, { foreignKey: "created_by", as: "createdDocuments" });
models.User.hasMany(models.Document, { foreignKey: "updated_by", as: "updatedDocuments" });

// Region associations
models.Region.hasMany(models.AdministrativeUnit, { foreignKey: "region_id", as: "administrativeUnits" });
models.Region.belongsTo(models.User, { foreignKey: "created_by", as: "regionCreator" });
models.Region.belongsTo(models.User, { foreignKey: "updated_by", as: "regionUpdater" });

// AdministrativeUnit associations
models.AdministrativeUnit.belongsTo(models.Region, { foreignKey: "region_id", as: "region" });
models.AdministrativeUnit.belongsTo(models.AdministrativeUnit, { foreignKey: "parent_id", as: "parent" });
models.AdministrativeUnit.hasMany(models.AdministrativeUnit, { foreignKey: "parent_id", as: "children" });
models.AdministrativeUnit.hasMany(models.User, { foreignKey: "administrative_unit_id", as: "users" });
models.AdministrativeUnit.hasMany(models.LandOwner, { foreignKey: "administrative_unit_id", as: "landOwners" });
models.AdministrativeUnit.hasMany(models.Application, { foreignKey: "administrative_unit_id", as: "applications" });
models.AdministrativeUnit.hasMany(models.LandRecord, { foreignKey: "administrative_unit_id", as: "landRecords" });
models.AdministrativeUnit.belongsTo(models.User, { foreignKey: "created_by", as: "unitCreator" });
models.AdministrativeUnit.belongsTo(models.User, { foreignKey: "updated_by", as: "unitUpdater" });

// LandOwner associations
models.LandOwner.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
models.LandOwner.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.LandOwner.hasMany(models.CoOwner, { foreignKey: "land_owner_id", as: "coOwners" });
models.LandOwner.hasMany(models.LandRecord, { foreignKey: "owner_id", as: "landRecords" });
models.LandOwner.hasMany(models.Application, { foreignKey: "land_owner_id", as: "applications" });
models.LandOwner.belongsTo(models.User, { foreignKey: "created_by", as: "landOwnerCreator" });
models.LandOwner.belongsTo(models.User, { foreignKey: "updated_by", as: "landOwnerUpdater" });

// CoOwner associations
models.CoOwner.belongsTo(models.LandOwner, { foreignKey: "land_owner_id", as: "landOwner" });
models.CoOwner.belongsTo(models.User, { foreignKey: "created_by", as: "coOwnerCreator" });
models.CoOwner.belongsTo(models.User, { foreignKey: "updated_by", as: "coOwnerUpdater" });

// LandRecord associations
models.LandRecord.belongsTo(models.LandOwner, { foreignKey: "owner_id", as: "owner" });
models.LandRecord.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.LandRecord.belongsTo(models.Application, { foreignKey: "application_id", as: "application" });
models.LandRecord.belongsTo(models.User, { foreignKey: "registered_by", as: "registrar" });
models.LandRecord.belongsTo(models.User, { foreignKey: "approved_by", as: "approver" });
models.LandRecord.hasMany(models.Document, { foreignKey: "land_record_id", as: "documents" });
models.LandRecord.hasMany(models.LandPayment, { foreignKey: "land_record_id", as: "payments" });
models.LandRecord.hasOne(models.Application, { foreignKey: "land_record_id", as: "relatedApplication" });

// Application associations
models.Application.belongsTo(models.LandOwner, { foreignKey: "land_owner_id", as: "owner" });
models.Application.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrative	unit" });
models.Application.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.Application.hasMany(models.Document, { foreignKey: "application_id", as: "documents" });
models.Application.hasMany(models.LandPayment, { foreignKey: "application_id", as: "payments" });
models.Application.belongsTo(models.User, { foreignKey: "created_by", as: "applicationCreator" });
models.Application.belongsTo(models.User, { foreignKey: "updated_by", as: "applicationUpdater" });

// LandPayment associations
models.LandPayment.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.LandPayment.belongsTo(models.Application, { foreignKey: "application_id", as: "application" });
models.LandPayment.belongsTo(models.User, { foreignKey: "created_by", as: "paymentCreator" });
models.LandPayment.belongsTo(models.User, { foreignKey: "updated_by", as: "paymentUpdater" });

// Document associations
models.Document.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.Document.belongsTo(models.Application, { foreignKey: "application_id", as: "application" });
models.Document.belongsTo(models.User, { foreignKey: "created_by", as: "documentCreator" });
models.Document.belongsTo(models.User, { foreignKey: "updated_by", as: "documentUpdater" });

// Export Sequelize instance and models
module.exports = {
  sequelize: db,
  Sequelize,
  ...models
};