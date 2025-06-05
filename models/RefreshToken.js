// models/RefreshToken.js
module.exports = (db, DataTypes) => {
    const RefreshToken = db.define(
        'RefreshToken',
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            token: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                validate: {
                    notEmpty: true,
                },
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
            expiresAt: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            isRevoked: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },

        },
        {
            tableName: 'refresh_tokens',
            timestamps: true,

        }
    );

    return RefreshToken;
};