// models/ActionLog.js
module.exports = (db, DataTypes) => {
  const ActionLog = db.define(
    'ActionLog',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'land_records',
          key: 'id',
        },
      },
      performed_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      action_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      additional_data: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: 'action_logs',
      timestamps: true,
      underscored: true,
    }
  );

  return ActionLog;
};
