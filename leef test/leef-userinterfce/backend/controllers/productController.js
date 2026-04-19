const { pool } = require("../config/db");
const { notify } = require("../utils/notifUtils");

// Add a new product (Seller)
exports.addProduct = async (req, res) => {
    try {
        const { name, category, price, stock, note, seller_id } = req.body;
        const images = req.files || [];
        const mainImageUrl = images.length > 0 ? 'uploads/' + images[0].filename : null;

        if (!name || !category || !price || !stock || !seller_id) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const [result] = await pool.execute(
            `INSERT INTO products 
       (seller_id, name, category, price, stock, description, image_url, is_approved) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [seller_id, name, category, price, stock, note || "", mainImageUrl]
        );

        const productId = result.insertId;

        // Insert additional images into product_images
        if (images.length > 0) {
            for (let i = 0; i < images.length; i++) {
                await pool.execute(
                    `INSERT INTO product_images (product_id, image_url, display_order) VALUES (?, ?, ?)`,
                    [productId, 'uploads/' + images[i].filename, i]
                );
            }
        }

        res.status(201).json({
            message: "Product added successfully",
            productId: productId
        });

    } catch (err) {
        console.error("Error adding product:", err);
        res.status(500).json({ message: "Server error: " + err.message });
    }
};

// Request Product Update (Instant for stock-only changes)
exports.requestUpdate = async (req, res) => {
    try {
        let { productId, sellerId, name, category, price, stock, note, description } = req.body;

        // Ensure IDs are numbers
        productId = parseInt(productId);
        sellerId = parseInt(sellerId);

        if (!productId || isNaN(productId)) return res.status(400).json({ message: "Invalid Product ID" });
        if (!sellerId || isNaN(sellerId)) return res.status(400).json({ message: "Invalid Seller ID" });

        // 1. Fetch current product details to check what changed
        const [current] = await pool.execute("SELECT * FROM products WHERE id = ?", [productId]);
        if (current.length === 0) return res.status(404).json({ message: "Product not found" });
        const product = current[0];

        // 2. Determine if ONLY stock changed
        // Use more strict string conversion to avoid false positives (e.g. comparing null to "")
        const newName = (name || "").toString().trim();
        const newCat = (category || "").toString().trim();
        const newPrice = (price || "").toString().trim();
        const newDesc = (description || "").toString().trim();
        const newStock = (stock || "").toString().trim();

        // Normalize current values from the DB
        const currName = (product.name || "").toString().trim();
        const currCat = (product.category || "").toString().trim();
        const currPrice = (product.price || "").toString().trim();
        const currDesc = (product.description || "").toString().trim();
        const currStock = (product.stock || "").toString().trim();

        const nameChanged = (newName !== currName);
        const categoryChanged = (newCat !== currCat);
        const priceChanged = (newPrice !== currPrice);
        const descChanged = (newDesc !== currDesc);
        const stockChanged = (newStock !== currStock);

        // USER REQUEST: Check if stock contains ANY letters (except 'kg' or 'g')
        // Regex to allow digits, spaces, and 'kg' or 'g' (case-insensitive)
        const isNumericStock = /^\s*\d+\s*(kg|g)?\s*$/i.test(newStock);

        // We only bypass approval if ONLY stock changed, and NOTHING else changed
        const onlyStockChanged = stockChanged && !nameChanged && !categoryChanged && !priceChanged && !descChanged;
        const nothingChanged = !stockChanged && !nameChanged && !categoryChanged && !priceChanged && !descChanged;

        if (nothingChanged) {
            return res.status(200).json({ message: "No significant changes detected.", instant: true });
        }

        if (onlyStockChanged) {
            // New logic: If the stock is NOT numeric, we hide the product (is_approved = 0)
            // If it IS numeric, we show it (is_approved = 1)
            let isApproved = isNumericStock ? 1 : 0;
            let statusLog = isNumericStock ? "Active (Valid Stock)" : "Hidden (Invalid Stock - Has Letters)";

            // Instant update for stock and status
            await pool.execute(
                `UPDATE products SET stock = ?, is_approved = ? WHERE id = ? AND seller_id = ?`,
                [newStock, isApproved, productId, sellerId]
            );

            // Notify admin (wrapped in try-catch as it's secondary)
            try {
                let logMsg = `Seller updated stock for '${product.name}' to ${newStock}. Status: ${statusLog}`;
                // Truncate to 255 if needed
                if (logMsg.length > 255) logMsg = logMsg.substring(0, 250) + "...";
                await pool.execute("INSERT INTO notifications (message, type) VALUES (?, 'info')", [logMsg]);
            } catch (notifErr) {
                console.error("Non-critical: Notification failed:", notifErr.message);
            }

            // CLEAR OLD PENDING UPDATES (to remove 'Update Pending' status)
            await pool.execute("DELETE FROM product_updates WHERE product_id = ?", [productId]);

            const userMsg = isNumericStock
                ? "Stock is valid. Product is now visible in the catalog!"
                : "Dont add letters, only numbers or kg/g. Product removed from catalog temporarily.";

            return res.status(200).json({
                message: userMsg,
                instant: true,
                is_approved: isApproved
            });
        }

        // 3. If other fields changed, proceed with approval request
        // Clear any old pending updates to avoid multiple requests
        await pool.execute("DELETE FROM product_updates WHERE product_id = ?", [productId]);

        await pool.execute(
            `INSERT INTO product_updates 
            (product_id, seller_id, name, category, price, stock, description) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [productId, sellerId, newName, newCat, newPrice, newStock, newDesc]
        );

        res.status(200).json({
            message: "Update sent for approval! Changes to name/price/category require admin approval.",
            instant: false
        });
    } catch (err) {
        console.error("Error requesting update:", err);
        res.status(500).json({ message: "Server error: " + err.message });
    }
};

// Get pending products (New + Updates)
exports.getPendingProducts = async (req, res) => {
    try {
        // Fetch new products
        const [newProducts] = await pool.execute(
            `SELECT p.id as product_id, p.*, s.name AS seller_name, s.shop_name, s.seller_id, 'New' as type 
       FROM products p
       JOIN sellers s ON p.seller_id = s.seller_id
       WHERE p.is_approved = 0
       ORDER BY p.created_at DESC`
        );

        // Fetch updates
        const [updates] = await pool.execute(
            `SELECT u.id as request_id, u.product_id, u.name, u.category, u.price, u.stock, u.description, 
             s.name AS seller_name, s.shop_name, s.seller_id, 'Update' as type
             FROM product_updates u
             JOIN sellers s ON u.seller_id = s.seller_id
             ORDER BY u.created_at DESC`
        );

        res.status(200).json([...newProducts, ...updates]);
    } catch (err) {
        console.error("Error fetching pending products:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Approve product (Mark as catalogued/done)
exports.approveProduct = async (req, res) => {
    try {
        const { id, type, finalPrice, coinsPercent, saleDetails, isAds } = req.body;
        const images = req.files || [];
        const mainImageUrl = images.length > 0 ? 'uploads/' + images[0].filename : null;

        if (type === 'New' || !type) {
            const pid = id || req.body.productId;
            const { name, stock, description } = req.body;

            // Fetch existing product data so we don't wipe out fields on partial inline saves
            const [ex] = await pool.execute("SELECT name, stock, final_price, image_url, coins_percent, sale_details, is_ads, description FROM products WHERE id = ?", [pid || null]);
            if (ex.length === 0) return res.status(404).json({ message: "Product not found" });
            const p = ex[0];

            const updName = name !== undefined ? name : p.name;
            const updStock = stock !== undefined ? stock : p.stock;
            const updPrice = finalPrice !== undefined ? finalPrice : p.final_price;
            const updImg = mainImageUrl !== null ? mainImageUrl : p.image_url;
            const updCoins = coinsPercent !== undefined ? coinsPercent : p.coins_percent;
            const updSale = saleDetails !== undefined ? saleDetails : p.sale_details;
            const updAds = isAds !== undefined ? (isAds ? 1 : 0) : p.is_ads;
            const updDesc = description !== undefined ? description : p.description;

            // Update product with precise details
            await pool.execute(
                `UPDATE products SET 
                 name = ?, stock = ?, final_price = ?, image_url = ?, 
                 coins_percent = ?, sale_details = ?, is_ads = ?, 
                 description = ?, is_approved = 1 
                 WHERE id = ?`,
                [updName, updStock, updPrice, updImg, updCoins, updSale, updAds, updDesc, pid || null]
            );

            // Add new images to gallery
            const [existingImgs] = await pool.execute("SELECT MAX(display_order) as maxOrder FROM product_images WHERE product_id = ?", [pid || null]);
            let nextOrder = (existingImgs[0].maxOrder || 0) + 1;

            for (const file of images) {
                await pool.execute(
                    `INSERT INTO product_images (product_id, image_url, display_order) VALUES (?, ?, ?)`,
                    [pid || null, 'uploads/' + file.filename, nextOrder++]
                );
            }

            // Notify Seller
            const [pRow] = await pool.execute("SELECT seller_id, name FROM products WHERE id = ?", [pid]);
            if (pRow.length > 0) {
                await notify(pRow[0].seller_id, "Product Approved! ✅", `Your new product '${pRow[0].name}' has been approved and is now live!`, "inventory");
            }

        } else if (type === 'Update') {
            const [rows] = await pool.execute("SELECT * FROM product_updates WHERE id = ?", [id || null]);
            if (rows.length === 0) return res.status(404).json({ message: "Update request not found" });
            const update = rows[0];

            await pool.execute(
                `UPDATE products SET 
                 name = COALESCE(?, name), 
                 category = COALESCE(?, category), 
                 price = COALESCE(?, price), 
                 stock = COALESCE(?, stock), 
                 description = COALESCE(?, description), 
                 final_price = ?, 
                 coins_percent = ?, 
                 sale_details = ?, 
                 is_ads = ? 
                 WHERE id = ?`,
                [
                    update.name || null,
                    update.category || null,
                    update.price || null,
                    update.stock || null,
                    update.description || null,
                    finalPrice || null,
                    coinsPercent || 0,
                    saleDetails || null,
                    isAds ? 1 : 0,
                    update.product_id
                ]
            );

            // Add NEW images provided during approval.
            for (const file of images) {
                await pool.execute(
                    `INSERT INTO product_images (product_id, image_url) VALUES (?, ?)`,
                    [update.product_id, 'uploads/' + file.filename]
                );
            }

            await pool.execute("DELETE FROM product_updates WHERE id = ?", [id || null]);

            await notify(update.seller_id, "Update Approved! 📈", `Your update for '${update.name}' has been approved.`, "inventory");
        }

        res.status(200).json({ message: "Approved successfully" });
    } catch (err) {
        console.error("Error approving product:", err);
        res.status(500).json({ message: "Server error approving product" });
    }
};

// Reject product (Hard Delete)
exports.rejectProduct = async (req, res) => {
    try {
        const { id, type } = req.body;
        const pid = id || req.body.productId;

        if (type === 'New' || !type) {
            const [pRow] = await pool.execute("SELECT seller_id, name FROM products WHERE id = ?", [pid]);
            if (pRow.length > 0) {
                await notify(pRow[0].seller_id, "Product Rejected ❌", `Your product '${pRow[0].name}' was rejected and removed.`, "inventory");
            }
            // Hard delete from products table
            await pool.execute("DELETE FROM products WHERE id = ?", [pid]);
        } else if (type === 'Update') {
            const [uRow] = await pool.execute("SELECT seller_id, name FROM product_updates WHERE id = ?", [id]);
            if (uRow.length > 0) {
                await notify(uRow[0].seller_id, "Update Rejected ❌", `Your update for '${uRow[0].name}' was rejected.`, "inventory");
            }
            // Delete request
            await pool.execute("DELETE FROM product_updates WHERE id = ?", [id]);
        }

        res.status(200).json({ message: "Rejected and deleted successfully" });
    } catch (err) {
        console.error("Error rejecting product:", err);
        res.status(500).json({ message: "Server error rejecting product" });
    }
};

// Get products for a specific seller
exports.getSellerProducts = async (req, res) => {
    try {
        const { sellerId } = req.params;
        if (!sellerId) return res.status(400).json({ message: "Seller ID required" });

        const [rows] = await pool.execute(
            `SELECT p.id, p.seller_id, p.name, p.category, p.price, p.stock, p.description, p.image_url, p.is_approved, p.created_at, p.sale_details, p.is_ads, p.coins_percent,
             CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END as has_pending_update
             FROM products p
             LEFT JOIN product_updates u ON p.id = u.product_id
             WHERE p.seller_id = ? 
             ORDER BY p.created_at DESC`,
            [sellerId]
        );

        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching seller products:", err);
        res.status(500).json({ message: "Server error fetching products" });
    }
};

// Get all approved products for marketplace (Customers)
exports.getMarketplaceProducts = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT p.id, p.seller_id, p.name, p.category, p.price as seller_price, COALESCE(p.final_price, p.price) as price, 
                    p.stock, p.description, p.image_url, p.coins_percent, p.sale_details, p.is_ads, p.created_at, 
                    s.name as seller_name, s.shop_name,
                    COALESCE(SUM(o.quantity), 0) as sold_amount,
                    (SELECT GROUP_CONCAT(image_url) FROM product_images WHERE product_id = p.id) as gallery
             FROM products p
             JOIN sellers s ON p.seller_id = s.seller_id
             LEFT JOIN orders o ON p.id = o.product_id
             WHERE p.is_approved = 1
             GROUP BY p.id, p.seller_id, p.name, p.category, p.price, p.final_price, p.stock, p.description, p.image_url, p.coins_percent, p.sale_details, p.is_ads, p.created_at, s.name, s.shop_name
             ORDER BY p.created_at DESC`
        );

        // Fetch all images for each product and sort them
        for (let r of rows) {
            try {
                const [imgs] = await pool.execute("SELECT image_url FROM product_images WHERE product_id = ? ORDER BY display_order ASC", [r.id]);
                r.images = imgs.map(i => i.image_url);
            } catch (pErr) {
                const [imgs] = await pool.execute("SELECT image_url FROM product_images WHERE product_id = ?", [r.id]);
                r.images = imgs.map(i => i.image_url);
            }

        }
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching marketplace products:", err);
        res.status(500).json({ message: "Server error fetching products" });
    }
};

// Seller delete product
exports.deleteProductBySeller = async (req, res) => {
    try {
        const { id } = req.params;
        const { sellerId } = req.body;

        const [rows] = await pool.execute("SELECT name, seller_id FROM products WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Product not found" });

        const product = rows[0];
        if (parseInt(product.seller_id) !== parseInt(sellerId)) {
            return res.status(403).json({ message: "Unauthorized: You do not own this product" });
        }

        await pool.execute("DELETE FROM products WHERE id = ?", [id]);

        const msg = `Seller (ID: ${sellerId}) removed product '${product.name}' (ID: ${id})`;
        await pool.execute("INSERT INTO notifications (message, type) VALUES (?, 'warning')", [msg]);

        res.status(200).json({ message: "Product deleted and admin notified" });
    } catch (err) {
        console.error("Error deleting product:", err);
        res.status(500).json({ message: "Server error deleting product" });
    }
};

// Get admin notifications
exports.getNotifications = async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20");
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ message: "Server error fetching notifications" });
    }
};

// Get Single Product Details (Public)
exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.execute(
            `SELECT p.id, p.seller_id, p.name, COALESCE(p.final_price, p.price) as price, p.stock, p.description, p.image_url, p.sale_details, p.coins_percent,
             s.name as seller_name, s.shop_name, s.shop_town, s.shop_address, s.shop_details, s.profile_pic, s.certificate_url 
             FROM products p
             LEFT JOIN sellers s ON p.seller_id = s.seller_id
             WHERE p.id = ?`,
            [id]
        );

        if (rows.length === 0) return res.status(404).json({ message: "Product not found" });

        const product = rows[0];
        // Fetch all images sorted by display_order
        try {
            const [imgs] = await pool.execute("SELECT image_url FROM product_images WHERE product_id = ? ORDER BY display_order ASC", [id]);
            product.images = imgs.map(i => i.image_url);
        } catch (imgErr) {
            const [imgs] = await pool.execute("SELECT image_url FROM product_images WHERE product_id = ?", [id]);
            product.images = imgs.map(i => i.image_url);
        }


        // Fetch seller certificates
        const [certs] = await pool.execute("SELECT * FROM seller_certificates WHERE seller_id = ?", [product.seller_id]);
        product.certificates = certs;

        // Fetch actual sold amount
        const [orders] = await pool.execute("SELECT SUM(quantity) as total_sold FROM orders WHERE product_id = ?", [id]);
        product.sold_amount = orders[0].total_sold || 0;

        // Fetch overall shop rating (based on Product Quality from FEEDBACK)
        const [shopRatings] = await pool.execute(
            `SELECT AVG(rating) as avg_rating, COUNT(*) as review_count 
             FROM feedback 
             WHERE seller_id = ? AND is_visible = 1`,
            [product.seller_id]
        );
        product.shop_rating = shopRatings[0].avg_rating || 0;
        product.shop_review_count = shopRatings[0].review_count || 0;

        res.status(200).json(product);
    } catch (err) {
        console.error("Error fetching product details:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Chatbot Search (Public)
exports.searchProductsForChatbot = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ message: "Search keyword is required" });

        const keyword = `%${q}%`;
        const [rows] = await pool.execute(
            `SELECT p.id, p.name, p.category, COALESCE(p.final_price, p.price) as price, CAST(p.stock AS SIGNED) as stock, p.description, p.image_url, 
             s.name as seller_name, s.shop_name, s.shop_town, s.certificate_url 
             FROM products p
             JOIN sellers s ON p.seller_id = s.seller_id
             WHERE p.is_approved = 1 AND CAST(p.stock AS SIGNED) > 0 AND (p.name LIKE ? OR p.category LIKE ? OR p.description LIKE ?)
             ORDER BY p.created_at DESC`,
            [keyword, keyword, keyword]
        );

        res.status(200).json(rows);
    } catch (err) {
        console.error("Error searching products for chatbot:", err);
        res.status(500).json({ message: "Server error searching products" });
    }
};

// Get Public Seller Products (For Discovery)
exports.getSellerPublicProducts = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const { exclude } = req.query;

        let sql = `SELECT p.id, p.name, COALESCE(p.final_price, p.price) as price, p.stock, p.image_url, p.sale_details
                   FROM products p
                   WHERE p.seller_id = ? AND p.is_approved = 1`;
        const params = [sellerId];

        if (exclude) {
            sql += " AND p.id != ?";
            params.push(exclude);
        }

        sql += " ORDER BY p.created_at DESC LIMIT 3";

        const [rows] = await pool.execute(sql, params);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching seller public products:", err);
        res.status(500).json({ message: "Server error fetching products" });
    }
};

// Reserve stock (when item is added to cart)
exports.reserveStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { qty } = req.body;
        if (!qty || qty <= 0) return res.status(400).json({ message: "Invalid quantity" });

        const [products] = await pool.execute("SELECT stock FROM products WHERE id = ?", [id]);
        if (products.length === 0) return res.status(404).json({ message: "Product not found" });

        const rawStock = products[0].stock;
        if (!rawStock) return res.status(400).json({ message: "Stock is zero" });

        // Extract number and suffix (regex to split "100kg" into 100 and "kg")
        const numPart = String(rawStock).match(/^[0-9.]+/);
        const suffixPart = String(rawStock).replace(/^[0-9.]+/, '');

        if (numPart) {
            const currentNum = parseFloat(numPart[0]);
            if (currentNum < qty) {
                return res.status(400).json({ message: "Not enough stock available", available: currentNum });
            }
            const newNum = currentNum - qty;
            const newStockStr = `${newNum}${suffixPart}`;
            await pool.execute("UPDATE products SET stock = ? WHERE id = ?", [newStockStr, id]);
            res.status(200).json({ message: "Stock reserved", newStock: newNum });
        } else {
            res.status(400).json({ message: "Invalid stock format in DB" });
        }
    } catch (err) {
        console.error("Error reserving stock:", err);
        res.status(500).json({ message: "Server error reserving stock" });
    }
};

// Release stock (when item is removed from cart/cart cleared)
exports.releaseStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { qty } = req.body;
        if (!qty || qty <= 0) return res.status(400).json({ message: "Invalid quantity" });

        const [products] = await pool.execute("SELECT stock FROM products WHERE id = ?", [id]);
        if (products.length === 0) return res.status(404).json({ message: "Product not found" });

        const rawStock = products[0].stock;
        // Even if rawStock is falsy (like "0"), we can add to it if we assume it's "0"
        let currentNum = 0;
        let suffixPart = "";

        if (rawStock) {
            const numPart = String(rawStock).match(/^[0-9.]+/);
            suffixPart = String(rawStock).replace(/^[0-9.]+/, '');
            if (numPart) currentNum = parseFloat(numPart[0]);
        }

        const newNum = currentNum + parseFloat(qty);
        const newStockStr = `${newNum}${suffixPart}`;
        await pool.execute("UPDATE products SET stock = ? WHERE id = ?", [newStockStr, id]);

        res.status(200).json({ message: "Stock released", newStock: newNum });
    } catch (err) {
        console.error("Error releasing stock:", err);
        res.status(500).json({ message: "Server error releasing stock" });
    }
};
// Direct stock update by seller (Bypasses admin-approval logic completely)
exports.directStockUpdate = async (req, res) => {
    try {
        const { productId, sellerId, stock } = req.body;

        if (!productId || !sellerId || !stock) {
            return res.status(400).json({ message: "Product ID, Seller ID and stock are required" });
        }

        // Verify product exists and belongs to seller
        const [rows] = await pool.execute("SELECT id, name, seller_id FROM products WHERE id = ?", [productId]);
        if (rows.length === 0) return res.status(404).json({ message: "Product not found" });

        if (parseInt(rows[0].seller_id) !== parseInt(sellerId)) {
            return res.status(403).json({ message: "Unauthorized. You can only update your own products." });
        }

        // 1. Direct update to the live products table
        await pool.execute("UPDATE products SET stock = ? WHERE id = ?", [stock, productId]);

        // 2. CLEAR OLD PENDING REQUESTS for this product (to remove 'Update Pending' label)
        await pool.execute("DELETE FROM product_updates WHERE product_id = ?", [productId]);

        // 3. Log a notification for admin audit (Non-critical)
        try {
            const logMsg = `[AUTO] Seller (ID: ${sellerId}) updated stock for '${rows[0].name}' to ${stock}`;
            await pool.execute("INSERT INTO notifications (message, type) VALUES (?, 'info')", [logMsg]);
        } catch (nErr) {
            console.warn("Notification failed (non-critical):", nErr.message);
        }

        res.status(200).json({
            message: "Stock updated instantly!",
            stock
        });
    } catch (err) {
        console.error("Error in directStockUpdate:", err);
        res.status(500).json({ message: "Server error during direct stock update" });
    }
};

// --- Q&A Logic ---

// Ask a question (Customer)
exports.askQuestion = async (req, res) => {
    try {
        const { productId } = req.params;
        const { userId, question } = req.body;

        if (!userId || !question) {
            return res.status(400).json({ message: "User ID and question are required" });
        }

        await pool.execute(
            "INSERT INTO questions (product_id, user_id, question) VALUES (?, ?, ?)",
            [productId, userId, question]
        );

        res.status(201).json({ message: "Question submitted! It will appear once answered." });
    } catch (err) {
        console.error("Error asking question:", err);
        res.status(500).json({ message: "Server error submitting question" });
    }
};

// Get questions for a product (Public - only answered ones as requested)
exports.getProductQuestions = async (req, res) => {
    try {
        const { productId } = req.params;
        const [rows] = await pool.execute(
            `SELECT q.*, c.name as user_name 
             FROM questions q 
             LEFT JOIN customers c ON q.user_id = c.customer_id 
             WHERE q.product_id = ? AND q.answer IS NOT NULL 
             ORDER BY q.created_at DESC`,
            [productId]
        );

        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching product questions:", err);
        res.status(500).json({ message: "Server error fetching questions" });
    }
};

// Get all questions for admin (Both answered and unanswered)
exports.getAdminQuestions = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT q.*, p.name as product_name, c.name as user_name 
             FROM questions q 
             JOIN products p ON q.product_id = p.id 
             LEFT JOIN customers c ON q.user_id = c.customer_id 
             ORDER BY (q.answer IS NULL) DESC, q.created_at DESC`
        );

        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching admin questions:", err);
        res.status(500).json({ message: "Server error fetching admin questions" });
    }
};

// Reply to a question (Admin)
exports.replyToQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { answer } = req.body;

        if (!answer) return res.status(400).json({ message: "Answer is required" });

        await pool.execute(
            "UPDATE questions SET answer = ? WHERE id = ?",
            [answer, id]
        );

        res.status(200).json({ message: "Replied successfully" });
    } catch (err) {
        console.error("Error replying to question:", err);
        res.status(500).json({ message: "Server error during reply" });
    }
};
// Update product image order, thumbnail and delete images (Admin)
exports.updateProductImages = async (req, res) => {
    try {
        const { productId, images, mainImage } = req.body;

        if (!productId) return res.status(400).json({ message: "Product ID required" });

        // 1. Update main thumbnail in products table
        if (mainImage) {
            await pool.execute("UPDATE products SET image_url = ? WHERE id = ?", [mainImage, productId]);
        }

        // 2. Update display_order for images or delete if not in list
        // 'images' should be an array of image_urls in the desired order
        if (Array.isArray(images)) {
            // First, get all current image URLs for this product
            const [currentImgs] = await pool.execute("SELECT image_url FROM product_images WHERE product_id = ?", [productId]);
            const currentUrls = currentImgs.map(i => i.image_url);

            // Delete images not in the new list
            for (const url of currentUrls) {
                if (!images.includes(url)) {
                    await pool.execute("DELETE FROM product_images WHERE product_id = ? AND image_url = ?", [productId, url]);
                }
            }

            // Update display_order for remaining images
            for (let i = 0; i < images.length; i++) {
                await pool.execute(
                    "UPDATE product_images SET display_order = ? WHERE product_id = ? AND image_url = ?",
                    [i, productId, images[i]]
                );
            }
        }

        res.status(200).json({ message: "Product images updated successfully" });
    } catch (err) {
        console.error("Error updating product images:", err);
        res.status(500).json({ message: "Server error updating images" });
    }
};
