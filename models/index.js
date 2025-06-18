const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");
const User = require("./User")(db, DataTypes);
const Role = require("./Role")(db, DataTypes);
const RefreshToken = require("./RefreshToken")(db, DataTypes);
const AdministrativeUnit = require("./AdministrativeUnit")(db, DataTypes);
const Region = require("./Region")(db, DataTypes);
const LandOwner = require("./LandOwner")(db, DataTypes);
const LandRecord = require("./LandRecord")(db, DataTypes);
const Document = require("./Document")(db, DataTypes);
const LandPayment = require("./LandPayment")(db, DataTypes);
const CoOwners = require("./CoOwners")(db, DataTypes);
const Application = require("./Application")(db, DataTypes);

// Define models
const models = {
  User,
  Role,
  RefreshToken,
  AdministrativeUnit,
  Region,
  LandOwner,
  LandRecord,
  Document,
  LandPayment,
  CoOwners,
  Application
};

// Define associations
// User associations
models.User.belongsTo(models.Role, { foreignKey: "role_id", as: "role" });
models.Role.hasMany(models.User, { foreignKey: "role_id", as: "users" });
models.User.hasOne(models.LandOwner, { foreignKey: "user_id", as: "landOwner" });
models.User.hasMany(models.RefreshToken, { foreignKey: "userId", as: "refreshTokens" });
models.RefreshToken.belongsTo(models.User, { foreignKey: "userId", as: "user" });

// LandOwner associations
models.LandOwner.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
models.LandOwner.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.LandOwner.hasMany(models.CoOwners, { foreignKey: "land_owner_id", as: "coOwners" });
models.LandOwner.hasMany(models.Application, { foreignKey: "land_owner_id", as: "applications" });
models.LandOwner.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.LandOwner.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// CoOwners associations
models.CoOwners.belongsTo(models.LandOwner, { foreignKey: "land_owner_id", as: "landOwner" });
models.CoOwners.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.CoOwners.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// Region and AdministrativeUnit associations
models.Region.hasMany(models.AdministrativeUnit, { foreignKey: "region_id", as: "administrativeUnits" });
models.AdministrativeUnit.belongsTo(models.Region, { foreignKey: "region_id", as: "region" });
models.AdministrativeUnit.belongsTo(models.AdministrativeUnit, { foreignKey: "parent_id", as: "parent" });
models.AdministrativeUnit.hasMany(models.AdministrativeUnit, { foreignKey: "parent_id", as: "children" });

// LandRecord associations
models.LandRecord.belongsTo(models.LandOwner, { foreignKey: "owner_id", as: "owner" });
models.LandRecord.belongsTo(models.User, { foreignKey: "registered_by", as: "registrar" });
models.LandRecord.belongsTo(models.User, { foreignKey: "approved_by", as: "approver" });
models.LandRecord.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.LandRecord.hasMany(models.Document, { foreignKey: "land_record_id", as: "documents" });
models.LandRecord.hasMany(models.LandPayment, { foreignKey: "land_record_id", as: "payments" });

// Document associations
models.Document.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.Document.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.Document.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });

// LandPayment associations
models.LandPayment.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.LandPayment.belongsTo(models.User, { foreignKey: "recorded_by", as: "recorder" });

// Application associations
models.Application.belongsTo(models.LandOwner, { foreignKey: "land_owner_id", as: "owner" });
models.Application.belongsTo(models.User, { foreignKey: "created_by", as: "creator" });
models.Application.belongsTo(models.User, { foreignKey: "updated_by", as: "updater" });
models.Application.belongsTo(models.AdministrativeUnit, { foreignKey: "administrative_unit_id", as: "administrativeUnit" });
models.Application.belongsTo(models.LandRecord, { foreignKey: "land_record_id", as: "landRecord" });
models.Application.belongsTo(models.Document, { foreignKey: "document_id", as: "document" });
models.Application.belongsTo(models.LandPayment, { foreignKey: "land_payment_id", as: "landPayment" });

// Export Sequelize instance and models
module.exports = {
  sequelize: db,
  Sequelize,
  ...models,
};