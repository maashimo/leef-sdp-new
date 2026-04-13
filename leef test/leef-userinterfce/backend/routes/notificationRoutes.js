const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Get notifications for a user/seller
router.get('/:userId', notificationController.getNotifications);

// Mark a specific notification as read
router.patch('/:id/read', notificationController.markAsRead);

// Mark all notifications for a user as read
router.patch('/read-all/:userId', notificationController.markAllAsRead);

module.exports = router;
