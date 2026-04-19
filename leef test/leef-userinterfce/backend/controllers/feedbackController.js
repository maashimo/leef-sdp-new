const { pool } = require("../config/db");
const { notify } = require("../utils/notifUtils");

// POST /api/feedback — Customer submits feedback for a completed order
exports.submitFeedback = async (req, res) => {
    try {
        const { userId, productId, sellerId, orderId, productRating, sellerRating, comment } = req.body;

        if (!userId || !productId || !orderId || !productRating || !sellerRating) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // 1. Check if feedback already submitted for this order
        const [existing] = await pool.execute(
            "SELECT COUNT(*) as cnt FROM feedback WHERE order_id = ? AND user_id = ?",
            [orderId, userId]
        );
        if (existing[0].cnt > 0) {
            return res.status(409).json({ message: "Feedback already submitted for this order" });
        }

        // 2. NEW: Check if order is within 1 month (30 days)
        const [orderRows] = await pool.execute(
            "SELECT created_at, updated_at, status FROM orders WHERE id = ?",
            [orderId]
        );
        if (orderRows.length === 0) {
            return res.status(404).json({ message: "Order not found" });
        }

        const completionDate = new Date(orderRows[0].updated_at || orderRows[0].created_at);
        const now = new Date();
        const diffDays = (now - completionDate) / (1000 * 60 * 60 * 24);

        if (diffDays > 30) {
            return res.status(403).json({ message: "Feedback can only be added within 1 month of the order." });
        }

        // Insert feedback — use only columns guaranteed to exist
        const imageUrl = req.file ? `/uploads/feedback/${req.file.filename}` : null;
        try {
            await pool.execute(
                `INSERT INTO feedback (product_id, user_id, order_id, seller_id, rating, seller_rating, comment, is_visible, image_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [productId, userId, orderId, sellerId || null, productRating, sellerRating, comment || null, imageUrl]
            );
        } catch (insertErr) {
            // Fallback if new columns don't exist yet (before server restart/migration)
            if (insertErr.code === 'ER_BAD_FIELD_ERROR') {
                await pool.execute(
                    `INSERT INTO feedback (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)`,
                    [productId, userId, productRating, comment || null]
                );
            } else throw insertErr;
        }

        // Notify Seller
        try {
            const [pRow] = await pool.execute("SELECT name FROM products WHERE id = ?", [productId]);
            const pName = pRow.length > 0 ? pRow[0].name : "your product";
            await notify(sellerId, "New Feedback! ⭐", `A customer left a ${productRating}-star review for '${pName}'.`, "feedback");
        } catch (nErr) { console.error("Notification failed:", nErr.message); }

        // Coins are NOT auto-awarded — customer can choose to claim them
        const coinsAvailable = imageUrl ? 15 : 10;

        res.status(201).json({ message: "Feedback submitted successfully", coinsAvailable });
    } catch (err) {
        console.error("Error submitting feedback:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/feedback/customer/:userId — Get all feedback submitted by a customer
exports.getCustomerFeedback = async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.execute(`
            SELECT f.*, p.name as product_name, p.image_url
            FROM feedback f
            JOIN products p ON f.product_id = p.id
            WHERE f.user_id = ?
            ORDER BY f.created_at DESC
        `, [userId]);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching customer feedback:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/feedback/product/:productId — Get all visible feedback for a product
exports.getProductFeedback = async (req, res) => {
    try {
        const { productId } = req.params;
        const [rows] = await pool.execute(`
            SELECT f.rating, f.seller_rating, f.comment, f.image_url, f.created_at, c.name as customer_name
            FROM feedback f
            JOIN customers c ON f.user_id = c.customer_id
            WHERE f.product_id = ? AND f.is_visible = 1
            ORDER BY f.created_at DESC
        `, [productId]);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching product feedback:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/feedback/admin — Admin: get all feedback with customer & product names
exports.getAllFeedbackAdmin = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT f.*, p.name as product_name, c.name as customer_name, c.email as customer_email,
                   o.total_price as order_final_amount,
                   o.quantity * p.price as order_original_amount
            FROM feedback f
            JOIN products p ON f.product_id = p.id
            JOIN customers c ON f.user_id = c.customer_id
            LEFT JOIN orders o ON f.order_id = o.id
            ORDER BY f.created_at DESC
        `);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching all feedback:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/feedback/seller/:sellerId — Seller: get all feedback for their products
exports.getSellerFeedback = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const [rows] = await pool.execute(`
            SELECT f.*, p.name as product_name, p.image_url as product_image, 
                   c.name as customer_name, c.email as customer_email,
                   o.total_price as order_final_amount,
                   o.quantity * p.price as order_original_amount
            FROM feedback f
            LEFT JOIN products p ON f.product_id = p.id
            LEFT JOIN customers c ON f.user_id = c.customer_id
            LEFT JOIN orders o ON f.order_id = o.id
            WHERE p.seller_id = ? OR f.seller_id = ?
            ORDER BY f.created_at DESC
        `, [sellerId, sellerId]);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching seller feedback:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// DELETE /api/feedback/:id — Admin: remove inappropriate feedback
exports.deleteFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute("DELETE FROM feedback WHERE id = ?", [id]);
        res.status(200).json({ message: "Feedback deleted successfully" });
    } catch (err) {
        console.error("Error deleting feedback:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/feedback/order/:orderId — Check if feedback was submitted for a specific order
exports.getOrderFeedback = async (req, res) => {
    try {
        const { orderId } = req.params;
        const [rows] = await pool.execute(
            "SELECT COUNT(*) as cnt FROM feedback WHERE order_id = ?",
            [orderId]
        );
        res.status(200).json({ submitted: rows[0].cnt > 0 });
    } catch (err) {
        // If order_id column doesn't exist yet, just return not submitted
        res.status(200).json({ submitted: false });
    }
};
