// models/index.js
const { Sequelize, DataTypes } = require("sequelize");
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

// User associations
User.belongsTo(models.User, { as: "primaryOwner", foreignKey: "primary_owner_id" });
User.hasMany(models.User, { as: "coOwners", foreignKey: "primary_owner_id" });
User.belongsTo(models.Role, { foreignKey: "role_id" });
User.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id" });
User.hasMany(models.Application, { as: "applications", foreignKey: "user_id" });
User.hasMany(models.LandRecord, { as: "landRecords", foreignKey: "user_id" });

// Region associations
Region.hasMany(AdministrativeUnit, { foreignKey: "region_id", as: "administrativeUnits" });

// AdministrativeUnit associations
AdministrativeUnit.belongsTo(Region, { foreignKey: "region_id", as: "region" });
AdministrativeUnit.belongsTo(AdministrativeUnit, { foreignKey: "parent_id", as: "parent" });
AdministrativeUnit.hasMany(AdministrativeUnit, { foreignKey: "parent_id", as: "children" });
AdministrativeUnit.hasMany(User, { foreignKey: "administrative_unit_id", as: "users" });
AdministrativeUnit.hasMany(Application, { foreignKey: "administrative_unit_id", as: "applications" });
AdministrativeUnit.hasMany(LandRecord, { foreignKey: "administrative_unit_id", as: "landRecords" });

// LandRecord associations
LandRecord.belongsTo(User, { foreignKey: "user_id", as: "owner" });
LandRecord.belongsTo(AdministrativeUnit, { foreignKey: "administrative_unit_id" });
LandRecord.belongsTo(Application, { foreignKey: "application_id", as: "application" });

// Application associations
Application.belongsTo(User, { foreignKey: "user_id", as: "owner" });
Application.belongsTo(User, { foreignKey: "created_by", as: "creator" });
Application.belongsTo(User, { foreignKey: "updated_by", as: "updater" });
Application.belongsTo(User, { foreignKey: "approved_by", as: "approver" });
Application.belongsTo(User, { foreignKey: "deleted_by", as: "deleter" });
Application.belongsTo(AdministrativeUnit, { foreignKey: "administrative_unit_id" });
Application.hasOne(LandRecord, { foreignKey: "application_id", as: "landRecord" });
Application.hasMany(Document, { foreignKey: "application_id", as: "documents" });
Application.hasMany(LandPayment, { foreignKey: "application_id", as: "payments" });
Application.hasMany(User, { as: "coOwners", foreignKey: "primary_owner_id", sourceKey: "user_id" });

// LandPayment associations
LandPayment.belongsTo(Application, { foreignKey: "application_id", as: "application" });

// Document associations
Document.belongsTo(Application, { foreignKey: "application_id", as: "application" });

// Export Sequelize instance and models
module.exports = {
  sequelize: db,
  Sequelize,
  ...models
};