const LAND_LEVELS = { 1: 5, 2: 5, 3: 5, 4: 4, 5: 3, 6: 2 };
const UNIT_TYPE_MAPPING = {
  1: ['Regiopolitan'],
  2: ['Zone City'],
  3: ['Woreda city'],
  4: ['Meri'],
  5: ['Newus'],
  6: ['Tadagi']
};

module.exports = (db, DataTypes) => {
  const AdministrativeUnit = db.define(
    'AdministrativeUnit',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          validType() {
            if (!UNIT_TYPE_MAPPING[this.unit_level].includes(this.type)) {
              throw new Error(`Invalid type ${this.type} for unit_level ${this.unit_level}.`);
            }
          }
        }
      },
      unit_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 6 }
      },
      parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'administrative_units', key: 'id' },
        validate: {
          async validParentId(value) {
            if (value && this.unit_level !== 1) {
              const parent = await db.models.AdministrativeUnit.findByPk(value);
              if (!parent) {
                throw new Error('Invalid parent_id: Parent unit does not exist.');
              }
              if (parent.unit_level >= this.unit_level) {
                throw new Error('Parent unit must have a higher level.');
              }
            } else if (!value && this.unit_level !== 1) {
              throw new Error('Parent ID is required for non-top-level units.');
            }
          }
        }
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      max_land_levels: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: function() {
          return LAND_LEVELS[this.unit_level] || 1;
        },
        validate: {
          isValidLevel(value) {
            if (value !== LAND_LEVELS[this.unit_level]) {
              throw new Error(`Invalid max_land_levels for unit_level ${this.unit_level}. Expected ${LAND_LEVELS[this.unit_level]}.`);
            }
          }
        }
      }
    },
    {
      tableName: 'administrative_units',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['code'] },
        { fields: ['parent_id'] },
        { fields: ['unit_level'] }
      ]
    }
  );

  return AdministrativeUnit;
};