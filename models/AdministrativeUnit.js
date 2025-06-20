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
      region_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'regions', key: 'id' }
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          len: {
            args: [2, 100],
            msg: 'የአስተዳደር ክፍል ስም ከ2 እስከ 100 ቁምፊዎች መሆን አለበት።'
          }
        }
      },
      name_translations: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
      },
      is_jurisdiction: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [['ሪጂኦፖሊታን', 'መካከለኛ ከተማ', 'አነስተኛ ከተማ', 'መሪ ማዘጋጃ ከተማ', 'ንዑስ ማዘጋጃ ከተማ', 'ታዳጊ ከተማ', 'ሪጂዮን', 'ዞን', 'ወረዳ']],
            msg: 'የአስተዳደር ክፍል አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      unit_level: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: {
            args: 1,
            msg: 'የክፍል ደረጃ ከ1 በታች መሆን አዯችልም።'
          },
          max: {
            args: 6,
            msg: 'የክፍል ደረጃ ከ6 በላይ መሆን አዯችልም።'
          }
        }
      },
      parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'administrative_units', key: 'id' }
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          len: {
            args: [1, 50],
            msg: 'የክፍል ኮድ ከ1 እስከ 50 ቁምፊዎች መሆን አለበት።'
          }
        }
      },
      max_land_levels: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: {
            args: 1,
            msg: 'ከፍተኛ የመሬት ደረጃዎች ከ1 በታች መሆን አዯችልም።'
          }
        },
        set(value) {
          if (!this.is_jurisdiction && !value && this.unit_level) {
            const levels = { 1: 5, 2: 5, 3: 5, 4: 4, 5: 3, 6: 2 };
            this.setDataValue('max_land_levels', levels[this.unit_level] || null);
          } else {
            this.setDataValue('max_land_levels', value);
          }
        }
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      },
    },
    {
      tableName: 'administrative_units',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ['code'] },
        { unique: true, fields: ['name', 'parent_id'], where: { parent_id: { [db.Sequelize.Op.ne]: null } } },
        { fields: ['region_id'] },
        { fields: ['parent_id'] },
        { fields: ['unit_level'] },
        { fields: ['is_jurisdiction'] },
        { fields: ['type'] }
      ],
      hooks: {
        beforeCreate: async (unit) => {
          const region = await db.models.Region.findByPk(unit.region_id);
          if (!region) throw new Error('ትክክለኛ ክልል መግለፅ አለበት።');
          const parent = unit.parent_id ? await db.models.AdministrativeUnit.findByPk(unit.parent_id) : null;
          if (parent && parent.region_id !== unit.region_id) {
            throw new Error('የወላጅ አስተዳደራዊ ክፍል ከተመሳሳይ ክልል መሆን አለበት።');
          }
          const regionCode = region.code || '';
          const parentCode = parent ? parent.code + '-' : '';
          unit.code = `${regionCode}-${parentCode}${unit.name.toUpperCase().replace(/\s/g, '').slice(0, 10)}`;
        },
        beforeSave: async (unit) => {
          let currentId = unit.parent_id;
          const visited = new Set();
          while (currentId) {
            if (visited.has(currentId)) throw new Error('የወላጅ ማጣቀሻ ክብ ዑደት ተገኝቷል።');
            visited.add(currentId);
            const parent = await db.models.AdministrativeUnit.findByPk(currentId);
            currentId = parent?.parent_id;
          }
        }
      },
      validate: {
        validAttributes() {
          if (this.is_jurisdiction) {
            if (this.type || this.unit_level || this.max_land_levels) {
              throw new Error('ዳይሬክቶሬቶች አይነት፣ ደረጃ ወይም ከፍተኛ የመሬት ደረጃ ሊኖራቸው አዯችልም።');
            }
          } else {
            if (!this.type || !this.unit_level || !this.max_land_levels) {
              throw new Error('ማዘጋጃ ቤቶች አይነት፣ ደረጃ እና ከፍተኛ የመሬት ደረጃ መግለፅ አለባቸው።');
            }
          }
        },
        async validRegion() {
          const region = await db.models.Region.findByPk(this.region_id);
          if (!region) {
            throw new Error('ትክክለኛ ክልል መግለፅ አለበት።');
          }
        }
      }
    }
  );

  return AdministrativeUnit;
};