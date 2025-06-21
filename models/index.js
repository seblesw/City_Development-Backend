const { Sequelize,DataTypes } = require("sequelize");
const db = require("../config/database");

// Load models in dependency order
const Role = require("./Role")(db, DataTypes);
const Region = require("./Region")(db, DataTypes);
const AdministrativeUnit = require("./AdministrativeUnit")(db, DataTypes);
const User = require("./User")(db, DataTypes);
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
  LandRecord,
  Application,
  LandPayment,
  Document
};

// Define Associations

// Role associations
Role.hasMany(User, { foreignKey: "role_id", as: "users" });
Role.belongsTo(User, { foreignKey: "created_by", as: "creator" }); 
Role.belongsTo(User, { foreignKey: "updated_by", as: "updater" }); 

// User associations
User.belongsTo(Role, { foreignKey: "role_id", as: "role" });
User.belongsTo(AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
User.belongsTo(User, { foreignKey: "primary_owner_id", as: "primaryOwner" });
User.hasMany(User, { foreignKey: "primary_owner_id", as: "coOwners" });
User.hasMany(Application, { foreignKey: "user_id", as: "ownedApplications" });
User.hasMany(Application, { foreignKey: "created_by", as: "createdApplications" });
User.hasMany(Application, { foreignKey: "updated_by", as: "updatedApplications" });
User.hasMany(Application, { foreignKey: "approved_by", as: "approvedApplications" });
User.hasMany(Application, { foreignKey: "deleted_by", as: "deletedApplications" });
User.hasMany(LandRecord, { foreignKey: "user_id", as: "ownedLandRecords" });
User.hasMany(LandPayment, { foreignKey: "created_by", as: "createdPayments" });
User.hasMany(LandPayment, { foreignKey: "updated_by", as: "updatedPayments" }); 

// Region associations
Region.hasMany(AdministrativeUnit, { foreignKey: "region_id", as: "administrativeUnits" });
Region.belongsTo(User, { foreignKey: "created_by", as: "creator" });
Region.belongsTo(User, { foreignKey: "updated_by", as: "updater" }); 

// AdministrativeUnit associations
AdministrativeUnit.belongsTo(Region, { foreignKey: "region_id", as: "region" });
AdministrativeUnit.belongsTo(AdministrativeUnit, { foreignKey: "parent_id", as: "parent" });
AdministrativeUnit.hasMany(AdministrativeUnit, { foreignKey: "parent_id", as: "children" });
AdministrativeUnit.hasMany(User, { foreignKey: "administrative_unit_id", as: "users" });
AdministrativeUnit.hasMany(Application, { foreignKey: "administrative_unit_id", as: "applications" });
AdministrativeUnit.hasMany(LandRecord, { foreignKey: "administrative_unit_id", as: "landRecords" });
AdministrativeUnit.belongsTo(User, { foreignKey: "created_by", as: "creator" }); 
AdministrativeUnit.belongsTo(User, { foreignKey: "updated_by", as: "updater" }); 

// LandRecord associations
LandRecord.belongsTo(User, { foreignKey: "user_id", as: "owner" });
LandRecord.belongsTo(AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
LandRecord.belongsTo(Application, { foreignKey: "application_id", as: "application" });
LandRecord.hasOne(Application, { foreignKey: "land_record_id", as: "relatedApplication" });

// Application associations
Application.belongsTo(User, { foreignKey: "user_id", as: "owner" });
Application.belongsTo(User, { foreignKey: "created_by", as: "creator" });
Application.belongsTo(User, { foreignKey: "updated_by", as: "updater" });
Application.belongsTo(User, { foreignKey: "approved_by", as: "approver" });
Application.belongsTo(User, { foreignKey: "deleted_by", as: "deleter" });
Application.belongsTo(AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
Application.belongsTo(LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
Application.hasMany(Document, { foreignKey: "application_id", as: "documents" });
Application.hasMany(LandPayment, { foreignKey: "application_id", as: "payments" });

// LandPayment associations
LandPayment.belongsTo(LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
LandPayment.belongsTo(Application, { foreignKey: "application_id", as: "application" });
LandPayment.belongsTo(User, { foreignKey: "created_by", as: "creator" }); 
LandPayment.belongsTo(User, { foreignKey: "updated_by", as: "updater" }); 

// Document associations
Document.belongsTo(Application, { foreignKey: "application_id", as: "application" });

// Export Sequelize instance and models
module.exports = {
  sequelize: db,
  Sequelize,
  ...models
};