const { pool } = require("../config/db");

// GET /api/notifications/:userId
exports.getNotifications = async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.execute(
            "SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50",
            [userId]
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ message: "Server error fetching notifications" });
    }
};

// PATCH /api/notifications/:id/read
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
        res.status(200).json({ message: "Notification marked as read" });
    } catch (err) {
        console.error("Error marking notification as read:", err);
        res.status(500).json({ message: "Server error updating notification" });
    }
};

// PATCH /api/notifications/read-all/:userId
exports.markAllAsRead = async (req, res) => {
    try {
        const { userId } = req.params;
        await pool.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [userId]);
        res.status(200).json({ message: "All notifications marked as read" });
    } catch (err) {
        console.error("Error marking all as read:", err);
        res.status(500).json({ message: "Server error updating notifications" });
    }
};
