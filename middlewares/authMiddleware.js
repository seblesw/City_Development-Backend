// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const { User, Role } = require('../models');

const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      const error = new Error('Not authorized, no token provided');
      error.status = 401;
      throw error;
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request object
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'email', 'first_name', 'last_name', 'role_id', 'is_active'],
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
    });

    if (!user || !user.is_active) {
      const error = new Error('Not authorized, user not found or inactive');
      error.status = 401;
      throw error;
    }

    req.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      roleId: user.role_id,
      roleName: user.role.name,
    };

    next();
  } catch (error) {
    res.status(error.status || 401).json({
      success: false,
      message: error.message || 'Not authorized',
    });
  }
};

// Middleware for role-based access control
const restrictTo = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.roleName)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied, insufficient permissions',
      });
    }
    next();
  };
};

module.exports = { protect, restrictTo };