// models/ActionLog.js
module.exports = (db, DataTypes) => {
  const ActionLog = db.define('ActionLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    // Which land record this action belongs to
    land_record_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'land_records',
        key: 'id'
      }
    },

    // Who performed the action
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true, // null if system-generated
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Type of action (e.g., STATUS_CHANGED, RECORD_CREATED, DOCUMENT_ADDED)
    action_type: {
      type: DataTypes.STRING,
      allowNull: false
    },

    // Optional message / description of action
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Any additional structured data (previous_status, notes, plot_number, etc.)
    additional_data: {
      type: DataTypes.JSONB,
      allowNull: true
    }

  }, {
    tableName: 'action_logs',
    timestamps: true,
    underscored: true
  });


  return ActionLog;
};
