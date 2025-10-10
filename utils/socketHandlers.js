const jwt = require('jsonwebtoken');
const { User } = require('../models');

module.exports = (io) => {
  const connectedUsers = new Map();

  // Enhanced connection logger
  const logConnections = () => {
    // console.log('=== Active Connections ===');
    connectedUsers.forEach((socketData, userId) => {
      // console.log(`User ${userId}: Socket ${socketData.socketId} | Last Active: ${socketData.lastActive}`);
    });
    // console.log(`Total connections: ${connectedUsers.size}`);
  };

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        // console.log('Connection attempt without token');
        return next(new Error('Authentication error'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'role', 'administrative_unit_id', 'email']
      });
      
      if (!user) {
        // console.log(`User ${decoded.id} not found in database`);
        return next(new Error('User not found'));
      }
      
      socket.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        adminUnit: user.administrative_unit_id
      };
      
      // console.log(`Socket ${socket.id} authenticated for user ${user.id} (${user.email})`);
      next();
    } catch (err) {
      // console.error('Authentication error:', err.message);
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // console.log(`\nNew connection: ${socket.id}`);
    // console.log(`Headers:`, socket.handshake.headers);
    // console.log(`Auth:`, socket.handshake.auth);

    // Authentication handler
    socket.on('authenticate', async () => {
      if (!socket.user?.id) {
        console.warn(`Socket ${socket.id} attempted auth without user data`);
        return;
      }

      const rooms = [
        `user_${socket.user.id}`,
        `admin_unit_${socket.user.adminUnit}`,
        `role_${socket.user.role}`
      ];
      
      await socket.join(rooms);
      
      connectedUsers.set(socket.user.id, {
        socketId: socket.id,
        email: socket.user.email,
        lastActive: new Date(),
        rooms: rooms
      });

      // console.log(`User ${socket.user.id} (${socket.user.email}) joined rooms:`, rooms);
      logConnections();

      socket.emit('authentication_success', {
        userId: socket.user.id,
        socketId: socket.id,
        timestamp: new Date()
      });
    });

    // Heartbeat for tracking active connections
    socket.on('heartbeat', () => {
      if (socket.user?.id && connectedUsers.has(socket.user.id)) {
        connectedUsers.get(socket.user.id).lastActive = new Date();
      }
    });

    // Disconnection handler
    socket.on('disconnect', (reason) => {
      if (socket.user?.id) {
        // console.log(`\nUser ${socket.user.id} disconnected (Reason: ${reason})`);
        connectedUsers.delete(socket.user.id);
        logConnections();
      }
    });

    // Error handler
    socket.on('error', (err) => {
      // console.error(`Socket ${socket.id} error:`, err);
    });
  });

  // Enhanced notification with logging
  io.notifyUser = async (userId, event, data) => {
    try {
      // console.log(`\nAttempting to notify user ${userId} of ${event}`);
      
      const user = await User.findByPk(userId, {
        attributes: ['id', 'email', 'last_login']
      });

      if (!user) {
        // console.error(`User ${userId} not found in database`);
        return false;
      }

      const connection = connectedUsers.get(userId);
      
      if (connection) {
        // console.log(`User ${userId} is connected via socket ${connection.socketId}`);
        // console.log(`Last active: ${connection.lastActive}`);
        
        io.to(`user_${userId}`).emit(event, {
          ...data,
          _meta: {
            deliveredAt: new Date(),
            toSocket: connection.socketId
          }
        });
        
        // console.log(`Notification sent successfully to user ${userId}`);
        return true;
      } else {
        console.warn(`User ${userId} is not currently connected`);
        // console.log(`Last login was at: ${user.last_login}`);
        return false;
      }
    } catch (error) {
      // console.error(`Notification error for user ${userId}:`, error);
      return false;
    }
  };
};