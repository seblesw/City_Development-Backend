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
const Zone =require("./Zone")(db, DataTypes);
const Woreda = require("./Woreda")(db, DataTypes);

// Define models
const models = {
  Role,
  Region,
  AdministrativeUnit,
  User,
  LandRecord,
  Application,
  LandPayment,
  Document,
  Zone,
  Woreda,
};

// Define Associations

// Role associations
models.Role.hasMany(models.User, { foreignKey: "role_id", as: "users" });

// User associations
models.User.belongsTo(models.User, { as: "primaryOwner", foreignKey: "primary_owner_id" });
models.User.hasMany(models.User, { as: "coOwners", foreignKey: "primary_owner_id" });
models.User.belongsTo(models.Role, { foreignKey: "role_id", as: "role" });
models.User.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.User.hasMany(models.Application, { as: "applications", foreignKey: "user_id" });
models.User.hasMany(models.LandRecord, { as: "landRecords", foreignKey: "user_id" });
models.User.hasMany(models.Application, { as: "createdApplications", foreignKey: "created_by" });
models.User.hasMany(models.Application, { as: "updatedApplications", foreignKey: "updated_by" });
models.User.hasMany(models.Application, { as: "approvedApplications", foreignKey: "approved_by" });
models.User.hasMany(models.Application, { as: "deletedApplications", foreignKey: "deleted_by" });

// Region associations
models.Region.hasMany(models.AdministrativeUnit, { foreignKey: "region_id", as: "administrativeUnits" });

// AdministrativeUnit associations
models.AdministrativeUnit.belongsTo(models.Region, { foreignKey: "region_id", as: "region" });
models.AdministrativeUnit.belongsTo(models.AdministrativeUnit, { foreignKey: "parent_id", as: "parent" });
models.AdministrativeUnit.hasMany(models.AdministrativeUnit, { foreignKey: "parent_id", as: "children" });
models.AdministrativeUnit.hasMany(models.User, { foreignKey: "administrative_unit_id", as: "users" });
models.AdministrativeUnit.hasMany(models.Application, { foreignKey: "administrative_unit_id", as: "applications" });
models.AdministrativeUnit.hasMany(models.LandRecord, { foreignKey: "administrative_unit_id", as: "landRecords" });

// LandRecord associations
models.LandRecord.belongsTo(models.User, { foreignKey: "user_id", as: "owner" });
models.LandRecord.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.LandRecord.belongsTo(models.Application, { foreignKey: "application_id", as: "application" });

// Application associations
models.Application.belongsTo(models.User, { foreignKey: "user_id", as: "owner" });
models.Application.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.Application.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });
models.Application.belongsTo(models.User, { foreignKey: "approved_by", as: "approver" });
models.Application.belongsTo(models.User, { foreignKey: "deleted_by", as: "deleter" });
models.Application.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.Application.hasOne(models.LandRecord, { foreignKey: "application_id", as: "landRecord" });
models.Application.hasMany(models.Document, { foreignKey: "application_id", as: "documents" });
models.Application.hasMany(models.LandPayment, { foreignKey: "application_id", as: "payments" });
models.Application.hasMany(models.User, { as: "coOwners", foreignKey: "primary_owner_id", sourceKey: "user_id" });

// LandPayment associations
models.LandPayment.belongsTo(models.Application, { foreignKey: "application_id", as: "application" });

// Document associations
models.Document.belongsTo(models.Application, { foreignKey: "application_id", as: "application" });

// Initialize associations for models that define them
Object.values(models).forEach((model) => {
  if (typeof model.associate === "function") {
    model.associate(models);
  }
});

// Export Sequelize instance and models
module.exports = {
  sequelize: db,
  Sequelize,
  ...models
};