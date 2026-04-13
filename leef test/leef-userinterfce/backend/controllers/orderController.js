const { pool } = require("../config/db");
const { notify } = require("../utils/notifUtils");

const parsePrice = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val);

    // Try to parse structured format: "300 per 500 g"
    const match = str.match(/(\d+(?:\.\d+)?)\s*(?:per|\/|Rs\.?)\s*(\d+)?\s*([a-zA-Z]+)/i);
    if (match) {
        let price = parseFloat(match[1]);
        let amount = parseFloat(match[2]) || 1;
        let unit = match[3].toLowerCase();

        // Convert to price per 1 of the unit type (kg or unit)
        if (unit.startsWith('g')) { // grams
            return (price / amount) * 1000; // price per kg
        }
        return (price / amount);
    }

    // Fallback to extraction
    const fallback = str.match(/[\d.]+/);
    return fallback ? parseFloat(fallback[0]) : 0;
};

// Create a new order request (distributor approval needed)
exports.createOrderRequest = async (req, res) => {
    try {
        const { userId, productId, sellerId, locations, totalQty } = req.body;

        if (!userId || !productId || !locations || locations.length === 0) {
            return res.status(400).json({ message: "Invalid request data" });
        }

        // Store locations as JSON
        const locationsJson = JSON.stringify(locations);

        // Fetch current product price using robust parser (sale_details takes priority)
        const [pRows] = await pool.execute("SELECT price, final_price, sale_details FROM products WHERE id = ?", [productId]);
        if (pRows.length === 0) return res.status(404).json({ message: "Product not found" });

        const unitPrice = parsePrice(pRows[0].sale_details || pRows[0].final_price || pRows[0].price || 0);
        const totalPrice = unitPrice * parseFloat(totalQty || 0);

        await pool.execute(
            `INSERT INTO order_requests (user_id, product_id, seller_id, locations, total_qty, unit_price, total_price, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [userId, productId, sellerId, locationsJson, totalQty, unitPrice, totalPrice]
        );

        // Notify Seller immediately when request is placed
        try {
            const [pRow] = await pool.execute("SELECT name FROM products WHERE id = ?", [productId]);
            const pName = pRow.length > 0 ? pRow[0].name : "your product";
            await notify(sellerId, "New Order Request! 📦", `A customer has requested ${totalQty} units of '${pName}'. Awaiting distributor approval.`, "order");
        } catch (nErr) { console.error("Notification failed:", nErr.message); }

        res.status(201).json({ message: "Order request sent for approval" });
    } catch (err) {
        console.error("Error creating order request:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get pending requests (for admin/distributor)
exports.getPendingRequests = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 'request' as source, r.id, r.user_id, r.product_id, r.seller_id, r.total_qty as quantity, 
                   r.status, r.created_at, p.name as product_name, p.image_url, p.stock as available_qty, 
                   p.price as seller_price,
                   COALESCE(p.sale_details, p.final_price, p.price) as unit_price, 
                   c.name as customer_name, c.email as customer_email, r.locations
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            JOIN customers c ON r.user_id = c.customer_id
            WHERE r.status = 'pending'
            
            UNION ALL
            
            SELECT 'direct' as source, o.id, o.user_id, o.product_id, o.seller_id, o.quantity, 
                   o.status, o.created_at, p.name as product_name, p.image_url, p.stock as available_qty, 
                   p.price as seller_price,
                   o.unit_price as unit_price, 
                   c.name as customer_name, c.email as customer_email, NULL as locations
            FROM orders o
            JOIN products p ON o.product_id = p.id
            JOIN customers c ON o.user_id = c.customer_id
            WHERE o.status = 'pending' AND o.request_id IS NULL
            
            ORDER BY created_at DESC
        `);

        // Parse JSON locations for frontend convenience if needed, or let frontend parse
        const results = rows.map(r => ({
            ...r,
            locations: typeof r.locations === 'string' ? JSON.parse(r.locations) : r.locations
        }));

        res.status(200).json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};
// Get all requests (for admin/distributor view)
exports.getAllRequests = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 'request' as source, r.id, r.user_id, r.product_id, r.seller_id, r.total_qty as quantity, 
                   r.status, r.created_at, p.name as product_name, p.image_url, p.stock as available_qty, 
                   p.price as seller_price,
                   COALESCE(p.sale_details, p.final_price, p.price) as unit_price, 
                   c.name as customer_name, c.email as customer_email, r.locations
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            JOIN customers c ON r.user_id = c.customer_id
            
            UNION ALL
            
            SELECT 'direct' as source, o.id, o.user_id, o.product_id, o.seller_id, o.quantity, 
                   o.status, o.created_at, p.name as product_name, p.image_url, p.stock as available_qty, 
                   p.price as seller_price,
                   o.unit_price as unit_price, 
                   c.name as customer_name, c.email as customer_email, NULL as locations
            FROM orders o
            JOIN products p ON o.product_id = p.id
            JOIN customers c ON o.user_id = c.customer_id
            WHERE o.request_id IS NULL
            
            ORDER BY created_at DESC
        `);

        // Parse JSON locations for frontend convenience
        const results = rows.map(r => ({
            ...r,
            locations: typeof r.locations === 'string' ? JSON.parse(r.locations) : r.locations
        }));

        res.status(200).json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

// Accept an order request
exports.acceptOrderRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        const [rows] = await pool.execute("SELECT * FROM order_requests WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Order request not found" });
        const request = rows[0];

        await pool.execute(
            `UPDATE order_requests SET status = 'approved', admin_note = ? WHERE id = ?`,
            [adminNote || null, id]
        );


        // For legacy records or backup, ensure prices are not NULL
        const unitPrice = parseFloat(request.unit_price || 0);
        const totalPrice = parseFloat(request.total_price || 0);

        // Also Insert into orders (Finalized Order Entry)
        await pool.execute(
            `INSERT INTO orders (user_id, product_id, seller_id, order_type, request_id, quantity, unit_price, total_price, status, payment_status)
             VALUES (?, ?, ?, 'request', ?, ?, ?, ?, 'pending', 'pending')`,
            [request.user_id, request.product_id, request.seller_id, id, request.total_qty, unitPrice, totalPrice]
        );

        // Deduct Stock
        await decrementStock(request.product_id, request.total_qty);

        // Notify Seller
        await notify(request.seller_id, "New Order! 📦", `You have a new order (Request ID #${id}) for ${request.total_qty} units.`, "order");

        res.status(200).json({ message: "Order accepted and moved to items" });
    } catch (err) {
        console.error("Error accepting order:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Reject an order request
exports.rejectOrderRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        await pool.execute(
            `UPDATE order_requests SET status = 'rejected', rejection_reason = ? WHERE id = ?`,
            [reason || 'No reason provided', id]
        );

        res.status(200).json({ message: "Order rejected successfully" });
    } catch (err) {
        console.error("Error rejecting order:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Update order locations (Admin removal)
exports.updateOrderLocations = async (req, res) => {
    try {
        const { id } = req.params;
        const { locationIndex } = req.body;

        const [rows] = await pool.execute("SELECT * FROM order_requests WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Order request not found" });
        const request = rows[0];

        let locations = typeof request.locations === 'string' ? JSON.parse(request.locations) : request.locations;
        if (!Array.isArray(locations) || locationIndex < 0 || locationIndex >= locations.length) {
            return res.status(400).json({ message: "Invalid location index" });
        }

        const removedLocation = locations[locationIndex].location;
        locations.splice(locationIndex, 1);

        // If no locations left, maybe we should reject it or just leave it empty? 
        // User wants "remove a place", so if they remove all, it's an empty order.

        const newTotalQty = locations.reduce((sum, l) => sum + (parseFloat(l.qty) || 0), 0);

        // Recalculate total_price robustly
        // Use the saved unit_price or fetch from product if missing (legacy)
        let unitPrice = parseFloat(request.unit_price || 0);
        if (unitPrice === 0) {
            const [pRow] = await pool.execute("SELECT price, final_price FROM products WHERE id = ?", [request.product_id]);
            if (pRow.length > 0) unitPrice = parsePrice(pRow[0].final_price || pRow[0].price || 0);
        }
        const newTotalPrice = unitPrice * newTotalQty;

        await pool.execute(
            `UPDATE order_requests SET locations = ?, total_qty = ?, total_price = ?, unit_price = ? WHERE id = ?`,
            [JSON.stringify(locations), newTotalQty, newTotalPrice, unitPrice, id]
        );

        // Notify Customer
        try {
            const [pRow] = await pool.execute("SELECT name FROM products WHERE id = ?", [request.product_id]);
            const pName = pRow.length > 0 ? pRow[0].name : "your product";
            await notify(request.user_id, "Order Update! 🚚", `Location '${removedLocation}' was removed from your order request for '${pName}' (#REQ-${id}). New total quantity: ${newTotalQty}.`, "order");
        } catch (nErr) { console.error("Notification failed:", nErr.message); }

        res.status(200).json({ message: "Location removed successfully", locations, newTotalQty, newTotalPrice });
    } catch (err) {
        console.error("Error updating order locations:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get requests for a specific customer
exports.getCustomerRequests = async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.execute(`
            SELECT r.*, p.name as product_name, p.image_url, p.price, s.shop_name
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            LEFT JOIN sellers s ON r.seller_id = s.seller_id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC
        `, [userId]);

        const results = rows.map(r => ({
            ...r,
            locations: typeof r.locations === 'string' ? JSON.parse(r.locations) : r.locations
        }));

        res.status(200).json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get report for seller (Orders + Feedbacks) based on date
exports.getSellerReport = async (req, res) => {
    try {
        const { sellerId, date } = req.query;
        if (!sellerId || !date) {
            return res.status(400).json({ message: "sellerId and date are required" });
        }

        // Normalizing date to YYYY-MM-DD
        const sqlDate = date.replace(/\//g, '-');

        // Fetch Orders for this seller on the given date
        const [orders] = await pool.execute(`
            SELECT r.id, r.total_qty, r.status, p.name as product_name, c.name as customer_name
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            JOIN customers c ON r.user_id = c.customer_id
            WHERE r.seller_id = ? AND DATE(r.created_at) = ?
        `, [sellerId, sqlDate]);

        // Fetch Feedbacks for products owned by this seller on the given date
        const [feedbacks] = await pool.execute(`
            SELECT f.rating, f.comment, p.name as product_name, c.name as customer_name
            FROM feedback f
            JOIN products p ON f.product_id = p.id
            JOIN customers c ON f.user_id = c.customer_id
            WHERE p.seller_id = ? AND DATE(f.created_at) = ?
        `, [sellerId, sqlDate]);

        res.status(200).json({ orders, feedbacks });
    } catch (err) {
        console.error("Error generating seller report:", err);
        res.status(500).json({ message: "Server error" });
    }
};


// Helper to decrement stock from products table
const decrementStock = async (productId, qty) => {
    try {
        const [products] = await pool.execute("SELECT stock FROM products WHERE id = ?", [productId]);
        if (products.length === 0) return;

        const rawStock = products[0].stock;
        if (!rawStock) return;

        // Extract number and suffix (regex to split "100kg" into 100 and "kg")
        const numPart = String(rawStock).match(/^[0-9.]+/);
        const suffixPart = String(rawStock).replace(/^[0-9.]+/, '');

        if (numPart) {
            const currentNum = parseFloat(numPart[0]);
            const newNum = Math.max(0, currentNum - qty);
            const newStockStr = `${newNum}${suffixPart}`;
            await pool.execute("UPDATE products SET stock = ? WHERE id = ?", [newStockStr, productId]);

            // Notify Seller if out of stock
            if (newNum === 0 && currentNum > 0) {
                try {
                    const [pRow] = await pool.execute("SELECT seller_id, name FROM products WHERE id = ?", [productId]);
                    if (pRow.length > 0) {
                        await notify(pRow[0].seller_id, "Out of Stock 🚨", `Your product '${pRow[0].name}' is now out of stock!`, "inventory");
                    }
                } catch (nErr) { console.error("OOS Notification error:", nErr.message); }
            }
        }
    } catch (err) {
        console.error("Error decrementing stock:", err);
    }
};

// Create a direct order (Marketplace)
exports.createDirectOrder = async (req, res) => {
    try {
        const { userId, productId, sellerId: rawSellerId, quantity, unitPrice, totalPrice, paymentMethod, status, paymentStatus, district, address, locations } = req.body;

        // Resolve seller_id from the product if not provided or zero
        let sellerId = parseInt(rawSellerId) || 0;
        if (!sellerId && productId) {
            const [pRows] = await pool.execute("SELECT seller_id FROM products WHERE id = ?", [productId]);
            if (pRows.length > 0) sellerId = pRows[0].seller_id;
        }

        const [result] = await pool.execute(
            `INSERT INTO orders (user_id, product_id, seller_id, quantity, unit_price, total_price, status, payment_status, payment_method, district, delivery_address, locations)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, productId, sellerId, quantity,
                parsePrice(unitPrice),
                parsePrice(totalPrice),
                status || 'pending',
                paymentStatus || 'pending',
                paymentMethod || 'cod',
                district || null,
                address || null,
                locations ? (typeof locations === 'string' ? locations : JSON.stringify(locations)) : null
            ]
        );

        res.status(201).json({ message: "Direct order created", orderId: result.insertId });

        // Notify Seller
        try {
            const [pRow] = await pool.execute("SELECT name FROM products WHERE id = ?", [productId]);
            const pName = pRow.length > 0 ? pRow[0].name : "your product";
            await notify(sellerId, "New Order! 📦", `A customer placed a direct order for ${quantity} units of '${pName}'.`, "order");
        } catch (nErr) { console.error("Notification failed:", nErr.message); }

        // Note: Stock was already deducted when the item was added to the cart
    } catch (err) {
        console.error("Error creating direct order:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Update Payment Status in orders
exports.updatePaymentStatus = async (req, res) => {
    try {
        const { id } = req.params; // This is the request_id
        const { paymentStatus, status, userId } = req.body;

        if (!id || !userId) {
            return res.status(400).json({ error: "request_id (params) and userId (body) are required" });
        }

        const [result] = await pool.execute(
            `UPDATE orders SET payment_status = ?, status = ? WHERE request_id = ? AND user_id = ?`,
            [paymentStatus || 'pending', status || 'pending', id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "No matching order found for this user/request." });
        }

        res.status(200).json({ message: "Payment status updated successfully", affected: result.affectedRows });
    } catch (err) {
        console.error("Error updating payment status:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get all orders (for admin overview ledger)
exports.getAdminAllOrders = async (req, res) => {
    try {
        const { date } = req.query; // YYYY-MM-DD
        let params = [];
        let dateFilter = "";
        if (date) {
            dateFilter = " WHERE DATE(i.created_at) = ?";
            params = [date, date]; // for both parts of UNION
        }

        let query = `
            SELECT 'finalized' as type, i.id, i.user_id, i.product_id, i.quantity, i.unit_price, i.total_price, 
                   i.status, i.payment_status, i.payment_method, i.created_at,
                   p.price as seller_price, p.name as product_name, p.image_url, 
                   c.name as customer_name, c.email as customer_email, c.address as customer_address, c.town as customer_town, c.phone as customer_phone, c.phone2 as customer_phone2,
                   COALESCE(s.shop_name, 'Unknown Shop') as shop_name, COALESCE(s.name, 'Unknown') as seller_name, s.shop_town, s.shop_address, s.phone as seller_phone, s.phone2 as seller_phone2,
                   COALESCE(i.locations, r.locations) as locations, i.district, i.delivery_address
            FROM orders i
            JOIN products p ON i.product_id = p.id
            JOIN customers c ON i.user_id = c.customer_id
            LEFT JOIN sellers s ON i.seller_id = s.seller_id
            LEFT JOIN order_requests r ON i.request_id = r.id
            ${dateFilter}

            UNION ALL

            SELECT 'request' as type, i.id, i.user_id, i.product_id, i.total_qty as quantity, i.unit_price, i.total_price, 
                   i.status, 'pending' as payment_status, 'request' as payment_method, i.created_at,
                   p.price as seller_price, p.name as product_name, p.image_url, 
                   c.name as customer_name, c.email as customer_email, c.address as customer_address, c.town as customer_town, c.phone as customer_phone, c.phone2 as customer_phone2,
                   COALESCE(s.shop_name, 'Unknown Shop') as shop_name, COALESCE(s.name, 'Unknown') as seller_name, s.shop_town, s.shop_address, s.phone as seller_phone, s.phone2 as seller_phone2,
                   i.locations, NULL as district, NULL as delivery_address
            FROM order_requests i
            JOIN products p ON i.product_id = p.id
            JOIN customers c ON i.user_id = c.customer_id
            LEFT JOIN sellers s ON i.seller_id = s.seller_id
            WHERE i.status = 'pending' ${date ? ' AND DATE(i.created_at) = ?' : ''}
            ORDER BY created_at DESC
        `;

        const [rows] = await pool.execute(query, params);

        // Fetch user locations to populate the multi-location details
        const [uLocs] = await pool.execute(`SELECT user_id, short_name, district, location_details FROM user_locations`);
        const userLocMap = {};
        uLocs.forEach(ul => {
            if (!userLocMap[ul.user_id]) userLocMap[ul.user_id] = {};
            userLocMap[ul.user_id][ul.short_name] = ul;
        });

        // Helper to parse price string like "300 per 1 kg" into a number
        function parsePrice(str) {
            if (!str) return 0;
            const match = str.match(/(\d+(?:\.\d+)?)/);
            return match ? parseFloat(match[0]) : 0;
        }

        const results = rows.map(o => {
            const sellerBase = parsePrice(o.seller_price);
            const totalSellerCost = sellerBase * (parseFloat(o.quantity) || 0);
            const profit = (parseFloat(o.total_price) || 0) - totalSellerCost;

            // Enrich multi-locations with details from user_locations
            let enrichedLocations = o.locations;
            try {
                if (typeof enrichedLocations === 'string') {
                    enrichedLocations = JSON.parse(enrichedLocations);
                }
                if (Array.isArray(enrichedLocations)) {
                    enrichedLocations = enrichedLocations.map(loc => {
                        const userPlaces = userLocMap[o.user_id];
                        if (userPlaces && userPlaces[loc.location]) {
                            return {
                                ...loc,
                                district: userPlaces[loc.location].district,
                                location: userPlaces[loc.location].location_details
                            };
                        }
                        return loc;
                    });
                }
            } catch (e) {
                // Ignore parse errors, leave it as is
                enrichedLocations = o.locations;
            }

            return {
                ...o,
                locations: enrichedLocations,
                admin_profit: profit.toFixed(2),
                image_url: o.image_url ? (o.image_url.startsWith('http') ? o.image_url : `http://localhost:5000/${o.image_url}`) : 'images/default.png'
            };
        });

        res.status(200).json(results);
    } catch (err) {
        console.error("Error fetching admin all orders:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get all orders created today (for admin overview)
exports.getAdminTodayOrders = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT i.id, i.user_id, i.product_id, i.quantity, i.unit_price, i.total_price, 
                   i.status, i.payment_status, i.payment_method, i.created_at,
                   p.price as seller_price,
                   p.name as product_name, p.image_url, 
                   c.name as customer_name, c.email as customer_email,
                   COALESCE(s.shop_name, 'Unknown Shop') as shop_name, COALESCE(s.name, 'Unknown') as seller_name
            FROM orders i
            JOIN products p ON i.product_id = p.id
            JOIN customers c ON i.user_id = c.customer_id
            LEFT JOIN sellers s ON i.seller_id = s.seller_id
            WHERE DATE(i.created_at) = CURDATE()
            ORDER BY i.created_at DESC
        `);

        // Parse images
        const results = rows.map(o => ({
            ...o,
            image_url: o.image_url ? (o.image_url.startsWith('http') ? o.image_url : `http://localhost:5000/${o.image_url}`) : 'images/default.png'
        }));

        res.status(200).json(results);
    } catch (err) {
        console.error("Error fetching admin today orders:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get consolidated recent orders for dashboard
exports.getConsolidatedOrders = async (req, res) => {
    try {
        const { userId } = req.params;

        // 1. Get Pending Requests (those NOT yet in orders)
        const [pending] = await pool.execute(`
            SELECT 'request' as source, r.id, r.user_id, r.product_id, r.seller_id, r.total_qty as quantity, 
                   r.unit_price as price, r.total_price, r.status, 'pending' as payment_status, 
                   p.name as product_name, p.image_url, p.sale_details, s.shop_name, r.created_at, r.admin_note, r.rejection_reason, r.locations
            FROM order_requests r
            JOIN products p ON r.product_id = p.id
            LEFT JOIN sellers s ON r.seller_id = s.seller_id
            WHERE r.user_id = ?
        `, [userId]);

        // 2. Get Finalized Order Items
        const [finalized] = await pool.execute(`
            SELECT 'item' as source, i.id, i.user_id, i.product_id, i.seller_id, i.quantity, 
                   i.unit_price as price, i.total_price, i.status, i.payment_status, 
                   p.name as product_name, p.image_url, p.sale_details, s.shop_name, i.created_at, r.admin_note, NULL as rejection_reason, r.locations
            FROM orders i
            JOIN products p ON i.product_id = p.id
            LEFT JOIN sellers s ON i.seller_id = s.seller_id
            LEFT JOIN order_requests r ON i.request_id = r.id
            WHERE i.user_id = ?
        `, [userId]);

        // Combine and sort
        const combined = [...pending, ...finalized].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Parse images
        const results = combined.map(o => ({
            ...o,
            image_url: o.image_url ? (o.image_url.startsWith('http') ? o.image_url : `http://localhost:5000/${o.image_url}`) : 'images/default.png'
        }));

        res.status(200).json(results);
    } catch (err) {
        console.error("Error fetching consolidated orders:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get orders for a specific seller
exports.getSellerOrders = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const [rows] = await pool.execute(`
            SELECT i.id, i.user_id, i.product_id, i.seller_id, i.quantity, i.status, i.payment_status, i.created_at,
                   p.name as product_name, p.image_url, p.price as seller_unit_price,
                   c.name as customer_name, c.email as customer_email
            FROM orders i
            JOIN products p ON i.product_id = p.id
            JOIN customers c ON i.user_id = c.customer_id
            WHERE i.seller_id = ? OR p.seller_id = ?
            ORDER BY i.created_at DESC
        `, [sellerId, sellerId]);

        // Parse images
        const results = rows.map(o => ({
            ...o,
            image_url: o.image_url ? (o.image_url.startsWith('http') ? o.image_url : `http://localhost:5000/${o.image_url}`) : 'images/default.png'
        }));

        res.status(200).json(results);
    } catch (err) {
        console.error("Error fetching seller orders:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get product quantity aggregation for a specific date (Seller Prep View)
exports.getSellerPrepSummary = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const { date } = req.query; // Expects YYYY-MM-DD

        if (!date) return res.status(400).json({ message: "Date parameter is required" });

        const [rows] = await pool.execute(`
            SELECT p.id, p.name as product_name, p.image_url, p.price as price_string,
                   SUM(o.quantity) as total_qty, SUM(o.total_price) as total_amount
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE (o.seller_id = ? OR (o.seller_id = 0 AND p.seller_id = ?)) 
            AND DATE(o.created_at) = ? AND o.status != 'cancelled'
            GROUP BY p.id, p.name, p.image_url, p.price
        `, [sellerId, sellerId, date]);

        const results = rows.map(o => ({
            ...o,
            image_url: o.image_url ? (o.image_url.startsWith('http') ? o.image_url : `http://localhost:5000/${o.image_url}`) : 'images/default.png'
        }));

        res.status(200).json(results);
    } catch (err) {
        console.error("Error fetching seller prep summary:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get product quantity aggregation for all sellers (Admin View)
exports.getAdminAllPrepSummary = async (req, res) => {
    try {
        const { date } = req.query; // Expects YYYY-MM-DD
        if (!date) return res.status(400).json({ message: "Date parameter is required" });

        const [rows] = await pool.execute(`
            SELECT s.seller_id, COALESCE(s.name, 'Unknown') as seller_name, COALESCE(s.shop_name, 'Unknown Shop') as shop_name, p.id as product_id, p.name as product_name, p.image_url, p.price as price_string,
                   SUM(o.quantity) as total_qty, SUM(o.total_price) as total_amount, MAX(o.created_at) as latest_order
            FROM orders o
            JOIN products p ON o.product_id = p.id
            LEFT JOIN sellers s ON o.seller_id = s.seller_id
            WHERE DATE(o.created_at) = ? AND o.status != 'cancelled'
            GROUP BY s.seller_id, s.name, s.shop_name, p.id, p.name, p.image_url, p.price
            ORDER BY latest_order DESC
        `, [date]);

        const results = rows.map(o => ({
            ...o,
            image_url: o.image_url ? (o.image_url.startsWith('http') ? o.image_url : `http://localhost:5000/${o.image_url}`) : 'images/default.png'
        }));

        res.status(200).json(results);
    } catch (err) {
        console.error("Error fetching admin all prep summary:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get shops with active orders for a given date (Admin Prep - Shop List View)
exports.getAdminPrepShops = async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ message: "Date parameter is required" });

        const [rows] = await pool.execute(`
            SELECT COALESCE(s.seller_id, 0) as seller_id, COALESCE(s.name, 'Unknown') as seller_name, COALESCE(s.shop_name, 'Unknown Shop') as shop_name, s.profile_pic,
                   COUNT(DISTINCT p.id) as total_products,
                   COUNT(o.id) as total_orders,
                   SUM(o.total_price) as total_amount,
                   MAX(o.created_at) as latest_order
            FROM orders o
            JOIN products p ON o.product_id = p.id
            LEFT JOIN sellers s ON o.seller_id = s.seller_id
            WHERE DATE(o.created_at) = ? AND o.status != 'cancelled'
            GROUP BY s.seller_id, s.name, s.shop_name, s.profile_pic
            ORDER BY latest_order DESC
        `, [date]);

        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching admin prep shops:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Update order status (Seller Dashboard)
exports.updateStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!status) return res.status(400).json({ message: "Status is required" });

        await pool.execute(
            `UPDATE orders SET status = ? WHERE id = ?`,
            [status, orderId]
        );

        res.status(200).json({ message: "Status updated" });
    } catch (err) {
        console.error("Error updating status:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get transactions for a specific product (Admin only)
exports.getProductTransactions = async (req, res) => {
    try {
        const { productId } = req.params;
        const [rows] = await pool.execute(`
            SELECT i.id, i.user_id, i.quantity, i.unit_price, i.total_price, 
                   i.status, i.payment_status, i.payment_method, i.created_at,
                   c.name as customer_name, c.email as customer_email
            FROM orders i
            JOIN customers c ON i.user_id = c.customer_id
            WHERE i.product_id = ?
            ORDER BY i.created_at DESC
        `, [productId]);

        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching product transactions:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get most sold and top rated products for a seller (+ global stats)
exports.getSellerProductStats = async (req, res) => {
    try {
        const { sellerId } = req.params;

        // 1. Seller's Most Sold Product
        const [mostSoldRows] = await pool.execute(`
            SELECT p.id, p.name as product_name, p.image_url, SUM(o.quantity) as total_sold
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.seller_id = ? AND o.status != 'cancelled'
            GROUP BY p.id, p.name, p.image_url
            ORDER BY total_sold DESC
            LIMIT 1
        `, [sellerId]);

        // 2. Seller's Top Rated Product
        const [topRatedRows] = await pool.execute(`
            SELECT p.id, p.name as product_name, p.image_url, AVG(f.rating) as avg_rating, COUNT(f.id) as review_count
            FROM feedback f
            JOIN products p ON f.product_id = p.id
            WHERE p.seller_id = ?
            GROUP BY p.id, p.name, p.image_url
            HAVING review_count > 0
            ORDER BY avg_rating DESC, review_count DESC
            LIMIT 1
        `, [sellerId]);

        // 3. GLOBAL Most Sold Product
        const [globalMostSoldRows] = await pool.execute(`
            SELECT p.id, p.name as product_name, p.image_url, SUM(o.quantity) as total_sold,
                   s.name as seller_name, s.shop_name
            FROM orders o
            JOIN products p ON o.product_id = p.id
            JOIN sellers s ON p.seller_id = s.seller_id
            WHERE o.status != 'cancelled'
            GROUP BY p.id, p.name, p.image_url, s.name, s.shop_name
            ORDER BY total_sold DESC
            LIMIT 1
        `);

        // 4. GLOBAL Top Rated Product
        const [globalTopRatedRows] = await pool.execute(`
            SELECT p.id, p.name as product_name, p.image_url, AVG(f.rating) as avg_rating, COUNT(f.id) as review_count,
                   s.name as seller_name, s.shop_name
            FROM feedback f
            JOIN products p ON f.product_id = p.id
            JOIN sellers s ON p.seller_id = s.seller_id
            GROUP BY p.id, p.name, p.image_url, s.name, s.shop_name
            HAVING review_count > 0
            ORDER BY avg_rating DESC, review_count DESC
            LIMIT 1
        `);

        res.status(200).json({
            mostSold: mostSoldRows[0] || null,
            topRated: topRatedRows[0] || null,
            globalMostSold: globalMostSoldRows[0] || null,
            globalTopRated: globalTopRatedRows[0] || null
        });
    } catch (err) {
        console.error("Error fetching seller product stats:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Admin Dashboard Stats (Top sellers, Top customers, Most sold, Best reviewed)
exports.getAdminStats = async (req, res) => {
    try {
        // 1. Top Sellers (by revenue)
        const [topSellers] = await pool.execute(`
            SELECT s.seller_id, s.name as seller_name, s.shop_name, SUM(o.total_price) as total_revenue
            FROM orders o
            JOIN sellers s ON o.seller_id = s.seller_id
            WHERE o.status != 'cancelled'
            GROUP BY s.seller_id, s.name, s.shop_name
            ORDER BY total_revenue DESC
            LIMIT 5
        `);

        // 2. Top Customers (by spending)
        const [topCustomers] = await pool.execute(`
            SELECT c.customer_id, c.name as customer_name, SUM(o.total_price) as total_spent
            FROM orders o
            JOIN customers c ON o.user_id = c.customer_id
            WHERE o.status != 'cancelled'
            GROUP BY c.customer_id, c.name
            ORDER BY total_spent DESC
            LIMIT 5
        `);

        // 3. Most Sold Product (by total quantity)
        const [mostSoldProducts] = await pool.execute(`
            SELECT p.id, p.name as product_name, p.image_url, SUM(o.quantity) as total_qty, COALESCE(s.shop_name, 'Unknown Shop') as shop_name
            FROM orders o
            JOIN products p ON o.product_id = p.id
            LEFT JOIN sellers s ON o.seller_id = s.seller_id
            WHERE o.status != 'cancelled'
            GROUP BY p.id, p.name, p.image_url, s.shop_name
            ORDER BY total_qty DESC
            LIMIT 5
        `);

        // 4. Best Reviewed Product (by avg rating)
        const [bestReviewedProducts] = await pool.execute(`
            SELECT p.id, p.name as product_name, p.image_url, AVG(f.rating) as avg_rating, COUNT(f.id) as review_count, s.shop_name
            FROM feedback f
            JOIN products p ON f.product_id = p.id
            JOIN sellers s ON p.seller_id = s.seller_id
            GROUP BY p.id, p.name, p.image_url, s.shop_name
            HAVING review_count > 0
            ORDER BY avg_rating DESC, review_count DESC
            LIMIT 5
        `);

        res.status(200).json({
            topSellers,
            topCustomers,
            mostSoldProducts,
            bestReviewedProducts
        });
    } catch (err) {
        console.error("Error fetching admin stats:", err);
        res.status(500).json({ message: "Server error" });
    }
};
// Get seller revenue grouped by month (for Admin Analysis)
exports.getSellerRevenueByMonth = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const [rows] = await pool.execute(
            `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(total_price) as revenue 
             FROM orders 
             WHERE seller_id = ? AND status != 'cancelled' 
             GROUP BY month 
             ORDER BY month ASC`,
            [sellerId]
        );

        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching seller revenue stats:", err);
        res.status(500).json({ message: "Server error" });
    }
};
