const { pool } = require("../config/db");

/**
 * Common utility to create a notification for a user (or admin if userId is null)
 * @param {number|null} userId - The recipient's user/seller ID
 * @param {string} title - Short title for the notification
 * @param {string} message - Detailed message
 * @param {string} type - Type of notification (order, inventory, refund, feedback, info)
 */
async function notify(userId, title, message, type = 'info') {
    try {
        await pool.execute(
            "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
            [userId, title, message, type]
        );
        console.log(`[NOTIFY] Created ${type} notification for User ${userId || 'Admin'}`);
    } catch (err) {
        console.error("[NOTIFY] Error creating notification:", err.message);
    }
}

module.exports = { notify };
