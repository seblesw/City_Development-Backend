module.exports = (db, DataTypes) => {
  const AdministrativeUnit = db.define(
    'AdministrativeUnit',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [
            ['Region', 'Zone', 'woreda', 'Regiopolitan', 'Kifle Ketema', 'Zone City', 'Woreda city', 'Meri', 'Newus', 'Tadagi']
          ],
        },
      },
      unit_level: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 0,
          max: 6,
        },
        // Set the unit level based on the type if it's not a city administration
        set(value) {
          if (!value && this.type) {
            switch (this.type) {
              case 'Regiopolitan':
              case 'Zone City':
              case 'Woreda city':
                this.setDataValue('unit_level', 1);
                break;
              case 'Meri':
                this.setDataValue('unit_level', 4);
                break;
              case 'Newus':
                this.setDataValue('unit_level', 5);
                break;
              case 'Tadagi':
                this.setDataValue('unit_level', 6);
                break;
              // For city administrations or other units without a unit level, keep it null
              default:
                this.setDataValue('unit_level', null);
            }
          } else {
            this.setDataValue('unit_level', value);
          }
        },
      },
      parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'administrative_units',
          key: 'id',
        },
        validate: {
          // that Ensure the parent unit is of a higher level unless it's a top-level unit
          notEmpty: (value, attr, next) => {
            if (value && this.unit_level !== null) {
              next();
            } else if (!value && this.unit_level === null) {
              next();
            } else {
              next(new Error('Parent ID is required for non-top-level units or must be null for top-level units.'));
            }
          },
        },
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Attribute to store the number of land levels based on the administrative unit level
      land_level_capacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 0,
        },
        // Set the default land levels based on the unit level if it's not a city administration
        set(value) {
          if (!value && this.unit_level !== null) {
            switch (this.unit_level) {
              case 1:
                this.setDataValue('land_level_capacity', 5);
                break;
              case 4:
                this.setDataValue('land_level_capacity', 4);
                break;
              case 5:
                this.setDataValue('land_level_capacity', 3);
                break;
              case 6:
                this.setDataValue('land_level_capacity', 2);
                break;
              // For city administrations or other units without land levels, keep it null
              default:
                this.setDataValue('land_level_capacity', null);
            }
          } else {
            this.setDataValue('land_level_capacity', value);
          }
        },
      },
    },
    {
      tableName: 'administrative_units',
      timestamps: true,
      indexes: [
        { fields: ['parent_id'] },
      ],
    }
  );

  return AdministrativeUnit;
};