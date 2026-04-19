const { pool } = require("../config/db");
const { notify } = require("../utils/notifUtils");

// POST /api/refunds — Customer submits a refund request
exports.submitRefund = async (req, res) => {
    try {
        const { userId, orderId, productId, reason, description, source } = req.body;

        if (!userId || !orderId || !reason) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // 0. NEW: Check if product is on sale (Refunds NOT allowed for sale items)
        const [pRow] = await pool.execute("SELECT sale_details FROM products WHERE id = ?", [productId]);
        if (pRow.length > 0 && pRow[0].sale_details && pRow[0].sale_details.trim() !== "") {
            return res.status(403).json({ message: "Refunds are not accepted for items purchased on sale." });
        }

        // 1. Check if refund already submitted for this order
        const [existing] = await pool.execute(
            "SELECT id FROM refunds WHERE order_id = ? AND user_id = ?",
            [orderId, userId]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: "A refund request has already been submitted for this order" });
        }

        // 2. NEW: Check if order is within 1 week (7 days)
        let orderRows = [];
        if (source === 'request') {
            [orderRows] = await pool.execute(
                "SELECT created_at, updated_at, status FROM order_requests WHERE id = ? AND user_id = ?",
                [orderId, userId]
            );
        } else if (source === 'item') {
            [orderRows] = await pool.execute(
                "SELECT created_at, updated_at, status FROM orders WHERE id = ? AND user_id = ?",
                [orderId, userId]
            );
        } else {
            // Fallback for security and backward compatibility
            [orderRows] = await pool.execute(
                "SELECT created_at, updated_at, status FROM orders WHERE (id = ? OR request_id = ?) AND user_id = ? ORDER BY created_at DESC",
                [orderId, orderId, userId]
            );
            if (orderRows.length === 0) {
                [orderRows] = await pool.execute(
                    "SELECT created_at, updated_at, status FROM order_requests WHERE id = ? AND user_id = ?",
                    [orderId, userId]
                );
            }
        }

        if (orderRows.length === 0) {
            return res.status(404).json({ message: "Order not found" });
        }

        const completionDate = new Date(orderRows[0].updated_at || orderRows[0].created_at);
        const now = new Date();
        const diffDays = (now - completionDate) / (1000 * 60 * 60 * 24);

        if (diffDays > 7) {
            return res.status(403).json({ message: "Refunds can only be requested within 1 week of the order." });
        }

        const imageUrls = req.files && req.files.length > 0
            ? req.files.map(f => `/uploads/refunds/${f.filename}`).join(',')
            : null;

        await pool.execute(
            `INSERT INTO refunds (user_id, order_id, product_id, reason, description, image_urls, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [userId, orderId, productId || null, reason, description || null, imageUrls]
        );

        // Notify Seller
        try {
            const [oRow] = await pool.execute("SELECT seller_id FROM orders WHERE id = ?", [orderId]);
            if (oRow.length > 0) {
                await notify(oRow[0].seller_id, "Refund Requested 💸", `A customer has requested a refund for Order #${orderId}.`, "refund");
            }
        } catch (nErr) { console.error("Notification failed:", nErr.message); }

        res.status(201).json({ message: "Refund request submitted successfully" });
    } catch (err) {
        console.error("Error submitting refund:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/refunds/customer/:userId — Get all refund requests for a customer
exports.getCustomerRefunds = async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.execute(`
            SELECT r.*, p.name as product_name, p.image_url
            FROM refunds r
            LEFT JOIN products p ON r.product_id = p.id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC
        `, [userId]);

        // Visibility Rules:
        // 1. Hide admin_note from customer if responsible_party is 'seller'
        // 2. Hide refund_amount while still pending or with seller (customer should not see amount until seller approves)
        const visibleRows = rows.map(r => {
            const hidden = {};
            if (r.responsible_party === 'seller') {
                hidden.admin_note = undefined;
            }
            // Don't show the refund amount until seller has approved it
            if (r.status === 'pending' || r.status === 'waiting_seller') {
                hidden.refund_amount = undefined;
            }
            // Always hide internal payment status from customer
            hidden.payment_status = undefined;
            return { ...r, ...hidden };
        });

        res.status(200).json(visibleRows);
    } catch (err) {
        console.error("Error fetching customer refunds:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/refunds/admin — Admin: get all refund requests
exports.getAllRefundsAdmin = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT r.*, 
                   COALESCE(p.name, 'Unknown Product') as product_name, 
                   p.image_url as image_url,
                   p.price as seller_original_price,
                   COALESCE(p.seller_id, o.seller_id) as seller_id, 
                   COALESCE(s.shop_name, 'Unknown Shop') as shop_name,
                   COALESCE(o.unit_price, p.final_price, p.price) as admin_final_price,
                   o.total_qty,
                   c.name as customer_name, 
                   c.email as customer_email,
                   c.phone as customer_phone,
                   c.phone2 as customer_phone2,
                   c.town as customer_town,
                   c.address as customer_address
            FROM refunds r
            LEFT JOIN products p ON r.product_id = p.id
            LEFT JOIN order_requests o ON r.order_id = o.id
            LEFT JOIN sellers s ON s.seller_id = COALESCE(p.seller_id, o.seller_id)
            JOIN customers c ON r.user_id = c.customer_id
            ORDER BY r.created_at DESC
        `);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching all refunds:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/refunds/:id/send-to-seller — Admin: Send request to seller
exports.sendToSeller = async (req, res) => {
    try {
        const { id } = req.params;
        const { sellerId, adminNote } = req.body;

        await pool.execute(
            "UPDATE refunds SET status = 'waiting_seller', responsible_party = 'seller', responsible_seller_id = ?, updated_at = NOW() WHERE id = ?",
            [sellerId, id]
        );

        if (adminNote) {
            await pool.execute(
                "INSERT INTO refund_messages (refund_id, sender_role, message) VALUES (?, 'admin', ?)",
                [id, adminNote]
            );
        }

        await notify(sellerId, "Refund Action Required 💸", `Admin has sent a refund request (ID #${id}) for your review.`, "refund");

        res.status(200).json({ message: "Refund request sent to seller", status: 'waiting_seller' });
    } catch (err) {
        console.error("Error in sendToSeller:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/refunds/:id/admin-note — Admin: update note for seller
exports.adminUpdateNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        await pool.execute(
            "INSERT INTO refund_messages (refund_id, sender_role, message) VALUES (?, 'admin', ?)",
            [id, adminNote]
        );

        res.status(200).json({ message: "Message sent to seller" });
    } catch (err) {
        console.error("Error in adminUpdateNote:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/refunds/:id/final-decision — Admin: Final approval/rejection after seller response
exports.finalAdminDecision = async (req, res) => {
    try {
        console.log("FINAL DECISION HIT");
        console.log("Params:", req.params);
        console.log("Body:", req.body);

        const { id } = req.params;
        const { decision, adminNote, refundAmount } = req.body;

        if (!['approved', 'rejected'].includes(decision)) {
            return res.status(400).json({ message: "Invalid decision" });
        }

        const [currentRefundRow] = await pool.execute("SELECT status FROM refunds WHERE id = ?", [id]);
        if (currentRefundRow.length === 0) return res.status(404).json({ message: "Refund not found" });

        if (decision === 'rejected' && currentRefundRow[0].status === 'seller_approved') {
            return res.status(403).json({ message: "Admin cannot reject a refund that the seller has already approved." });
        }

        await pool.execute(
            "UPDATE refunds SET status = ?, admin_note = ?, refund_amount = ?, updated_at = NOW() WHERE id = ?",
            [decision, adminNote || null, refundAmount || 0, id]
        );

        const [refund] = await pool.execute(
            "SELECT user_id, refund_amount FROM refunds WHERE id = ?",
            [id]
        );

        if (refund.length > 0) {
            const msg = decision === 'approved'
                ? `Your refund request (ID #${id}) has been approved for LKR ${refund[0].refund_amount}.`
                : `Your refund request (ID #${id}) has been rejected.`;

            await notify(
                refund[0].user_id,
                decision === 'approved' ? "Refund Approved! ✅" : "Refund Rejected ❌",
                msg,
                "refund"
            );
        }

        res.status(200).json({ message: `Refund ${decision} successfully`, status: decision });
    } catch (err) {
        console.error("Error in finalAdminDecision:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/refunds/:id/approve — Admin: direct approve (for delivery issues)
exports.approveRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote, responsibleParty, refundAmount } = req.body;

        console.log(`Approving refund ${id} as delivery issue:`, { adminNote, refundAmount });

        await pool.execute(
            "UPDATE refunds SET status = 'approved', admin_note = ?, responsible_party = ?, refund_amount = ?, updated_at = NOW() WHERE id = ?",
            [adminNote || null, responsibleParty || 'delivery', refundAmount || 0, id]
        );

        // Notify client
        const [r] = await pool.execute("SELECT user_id FROM refunds WHERE id = ?", [id]);
        if (r.length > 0) {
            await notify(r[0].user_id, "Refund Approved! ✅", `Your refund request (ID #${id}) has been approved for LKR ${refundAmount}.`, "refund");
        }

        res.status(200).json({ message: "Refund approved", status: 'approved' });
    } catch (err) {
        console.error("Error in admin approveRefund:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/refunds/:id/seller-approve — Seller: approve a refund attributed to them
// USER REQUEST: Only AFTER seller approves, notify the client.
// If the amount is partial (less than original), ask customer consent first.
// PUT /api/refunds/:id/seller-respond — Seller: approve or reject
exports.sellerApproveRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { sellerId, decision, note } = req.body; // decision: 'seller_approved' or 'seller_rejected'

        if (!['seller_approved', 'seller_rejected'].includes(decision)) {
            return res.status(400).json({ message: "Invalid decision" });
        }

        await pool.execute(
            "UPDATE refunds SET status = ?, seller_note = ?, updated_at = NOW() WHERE id = ?",
            [decision, note || null, id]
        );

        if (note) {
            await pool.execute(
                "INSERT INTO refund_messages (refund_id, sender_role, message) VALUES (?, 'seller', ?)",
                [id, note]
            );
        }

        // Notify Admin (using systematic notification if available, else just log)
        try {
            await pool.execute("INSERT INTO notifications (message, type) VALUES (?, 'info')", [`Seller has ${decision.replace('_', ' ')} refund #${id}`, 'info']);
        } catch (nErr) { }

        res.status(200).json({ message: `Refund ${decision.replace('_', ' ')} by seller`, status: decision });
    } catch (err) {
        console.error("Error in sellerApproveRefund:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/refunds/:id/seller-note — Seller: update note for admin
exports.sellerUpdateNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { sellerId, note } = req.body;

        // Insert into multi-message table instead of updating a single field
        await pool.execute(
            "INSERT INTO refund_messages (refund_id, sender_role, message) VALUES (?, 'seller', ?)",
            [id, note]
        );

        // Also update seller_note in refunds for quick lookup/legacy
        await pool.execute(
            "UPDATE refunds SET seller_note = ?, updated_at = NOW() WHERE id = ?",
            [note, id]
        );

        res.status(200).json({ message: "Message sent to admin" });
    } catch (err) {
        console.error("Error in sellerUpdateNote:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/refunds/:id/reject — Admin: reject a refund with a reason
exports.rejectRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        await pool.execute(
            "UPDATE refunds SET status = 'rejected', admin_note = ?, updated_at = NOW() WHERE id = ?",
            [adminNote || 'No reason provided', id]
        );

        res.status(200).json({ message: "Refund rejected" });
    } catch (err) {
        console.error("Error rejecting refund:", err);
        res.status(500).json({ message: "Server error" });
    }
};
// PUT /api/refunds/:id/pay — Admin: mark a refund as paid
exports.markRefundAsPaid = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute(
            "UPDATE refunds SET payment_status = 'paid', updated_at = NOW() WHERE id = ?",
            [id]
        );
        res.status(200).json({ message: "Refund marked as paid" });
    } catch (err) {
        console.error("Error marking refund as paid:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/refunds/seller/:sellerId — Get refund deductions for a seller
exports.getSellerRefunds = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const [rows] = await pool.execute(`
            SELECT r.*, p.name as product_name, p.image_url, 
                   p.price as seller_original_price,
                   c.name as customer_name,
                   c.username as customer_username,
                   c.email as customer_email,
                   c.phone as customer_phone,
                   o.total_qty
            FROM refunds r
            JOIN products p ON r.product_id = p.id
            LEFT JOIN order_requests o ON r.order_id = o.id
            JOIN customers c ON r.user_id = c.customer_id
            WHERE r.responsible_seller_id = ? 
              AND r.status IN ('approved', 'waiting_seller', 'seller_approved', 'seller_rejected') 
            ORDER BY r.updated_at DESC
        `, [sellerId]);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching seller refunds:", err);
        res.status(500).json({ message: "Server error" });
    }
};
// GET /api/refunds/:id/messages — Get message history for a refund
exports.getRefundMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.execute(
            "SELECT * FROM refund_messages WHERE refund_id = ? ORDER BY created_at ASC",
            [id]
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching refund messages:", err);
        res.status(500).json({ message: "Server error" });
    }
};
// PUT /api/refunds/:id/customer-accept — Customer: Accept partial refund offer
exports.customerAcceptPartial = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch current refund to see where it goes next
        const [rows] = await pool.execute("SELECT * FROM refunds WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Refund not found" });
        const refund = rows[0];

        if (refund.status !== 'pending_customer_consent') {
            return res.status(400).json({ message: "Refund is not in a state awaiting consent" });
        }

        // After consent, move to 'approved' (if delivery) or 'waiting_seller' (if seller)
        const nextStatus = refund.responsible_party === 'seller' ? 'waiting_seller' : 'approved';

        await pool.execute(
            "UPDATE refunds SET status = ?, updated_at = NOW() WHERE id = ?",
            [nextStatus, id]
        );

        if (nextStatus === 'waiting_seller') {
            await pool.execute(
                "INSERT INTO refund_messages (refund_id, sender_role, message) VALUES (?, 'admin', ?)",
                [id, `[SYSTEM] Customer has formally accepted the partial refund offer of LKR ${refund.refund_amount}. Please proceed.`]
            );
        }

        res.status(200).json({ message: "Refund offer accepted", nextStatus });
    } catch (err) {
        console.error("Error accepting partial refund:", err);
        res.status(500).json({ message: "Server error" });
    }
};

