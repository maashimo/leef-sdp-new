const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const { dbConfig } = require("./config/db");
const { transporter } = require("./utils/authUtils");
const { generateSellerInvitationEmail, generateAccountApprovedEmail } = require("./templates/email-templates");

const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const refundRoutes = require("./routes/refundRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/products", productRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/notifications", notificationRoutes);

async function initializeDatabase() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS otp_verification (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role ENUM('customer', 'seller', 'admin') NOT NULL,
        user_id INT DEFAULT NULL,
        email VARCHAR(255) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        purpose ENUM('registration', 'password_reset') NOT NULL,
        expires_at DATETIME NOT NULL,
        is_used TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_otp_code (otp_code),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150),
        price DECIMAL(10, 2),
        image_url VARCHAR(255),
        stock INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_updates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT,
        seller_id INT,
        name VARCHAR(150),
        category VARCHAR(100),
        price VARCHAR(100),
        stock VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (seller_id) REFERENCES sellers(seller_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.error("Database initialization error:", err.message);
  } finally {
    if (conn) await conn.end();
  }
}

app.get("/", (req, res) => res.send("leef backend running ✅"));

// ─── ADMIN ───

app.get("/api/admin/sidebar-counts", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [[fb]] = await conn.execute("SELECT COUNT(*) as count FROM feedback WHERE is_read = 0");
    const [[q]] = await conn.execute("SELECT COUNT(*) as count FROM questions WHERE is_read = 0");
    const [[r]] = await conn.execute("SELECT COUNT(*) as count FROM refunds WHERE status IN ('pending', 'seller_approved', 'seller_rejected')");
    const [[reg]] = await conn.execute("SELECT COUNT(*) as count FROM customers WHERE is_verified = 1 AND is_approved = 0");
    const [[loc]] = await conn.execute("SELECT COUNT(*) as count FROM user_locations WHERE status = 'pending'");
    res.json({ feedback: fb.count, questions: q.count, refunds: r.count, registrations: reg.count, locations: loc.count });
  } catch (err) {
    res.json({ feedback: 0, questions: 0, refunds: 0, registrations: 0, locations: 0 });
  } finally {
    if (conn) await conn.end();
  }
});

app.post("/api/admin/mark-read/:type", async (req, res) => {
  let conn;
  try {
    const { type } = req.params;
    conn = await mysql.createConnection(dbConfig);
    if (type === "feedback") await conn.execute("UPDATE feedback SET is_read = 1 WHERE is_read = 0");
    else if (type === "questions") await conn.execute("UPDATE questions SET is_read = 1 WHERE is_read = 0");
    res.json({ message: `${type} marked as read` });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.get("/api/seller/sidebar-counts/:sellerId", async (req, res) => {
  let conn;
  try {
    const { sellerId } = req.params;
    conn = await mysql.createConnection(dbConfig);
    const [[r]] = await conn.execute(
      "SELECT COUNT(*) as count FROM refunds WHERE responsible_seller_id = ? AND status = 'waiting_seller'",
      [sellerId]
    );
    res.json({ refunds: r.count });
  } catch (err) {
    res.json({ refunds: 0 });
  } finally {
    if (conn) await conn.end();
  }
});

app.post("/api/admin/invite-seller", async (req, res) => {
  let conn;
  try {
    const { email } = req.body;
    if (!email) return res.status(400).send("Email is required");
    conn = await mysql.createConnection(dbConfig);
    const [existingSeller] = await conn.execute("SELECT seller_id FROM sellers WHERE email = ? LIMIT 1", [email]);
    if (existingSeller.length > 0) return res.status(400).send("Seller with this email already exists.");
    const [existingCustomer] = await conn.execute("SELECT customer_id FROM customers WHERE email = ? LIMIT 1", [email]);
    if (existingCustomer.length > 0) return res.status(400).send("This email is already registered as a Customer.");
    const invitationLink = `http://localhost:5173/register-seller.html?email=${encodeURIComponent(email)}`;
    const emailContent = generateSellerInvitationEmail(email, invitationLink);
    await transporter.sendMail({ from: `Leef <${process.env.MAIL_USER}>`, to: email, ...emailContent });
    return res.json({ message: "Invitation sent successfully" });
  } catch (err) {
    return res.status(500).send("Server error: " + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

app.get("/api/admin/requests/customers", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      "SELECT customer_id, name, town, email, created_at FROM customers WHERE is_verified = 1 AND is_approved = 0 ORDER BY created_at DESC"
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).send("Server error");
  } finally {
    if (conn) await conn.end();
  }
});

app.post("/api/admin/approve-customer", async (req, res) => {
  let conn;
  try {
    const { customerId } = req.body;
    if (!customerId) return res.status(400).send("Customer ID required");
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute("SELECT name, email FROM customers WHERE customer_id = ?", [customerId]);
    if (rows.length === 0) return res.status(404).send("Customer not found");
    const { name, email } = rows[0];
    await conn.execute("UPDATE customers SET is_approved = 1 WHERE customer_id = ?", [customerId]);
    const emailContent = generateAccountApprovedEmail(name);
    await transporter.sendMail({ from: `Leef <${process.env.MAIL_USER}>`, to: email, ...emailContent });
    return res.json({ message: "Customer approved successfully" });
  } catch (err) {
    return res.status(500).send("Server error: " + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

app.get("/api/admin/users", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [customers] = await conn.execute(
      "SELECT customer_id as id, name, username, email, phone, phone2, address, town, 'Customer' as role, created_at FROM customers ORDER BY created_at DESC"
    );
    const [sellers] = await conn.execute(
      "SELECT seller_id as id, name, username, email, phone, phone2, shop_name, shop_town as town, shop_address, 'Seller' as role, created_at FROM sellers ORDER BY created_at DESC"
    );
    const allUsers = [...customers, ...sellers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json(allUsers);
  } catch (err) {
    return res.status(500).send("Server error");
  } finally {
    if (conn) await conn.end();
  }
});

app.delete("/api/admin/user/:role/:id", async (req, res) => {
  let conn;
  try {
    const { role, id } = req.params;
    conn = await mysql.createConnection(dbConfig);
    if (role === "Customer") {
      await conn.execute("DELETE FROM customers WHERE customer_id = ?", [id]);
    } else if (role === "Seller") {
      await conn.execute("DELETE FROM seller_certificates WHERE seller_id = ?", [id]);
      await conn.execute("DELETE FROM sellers WHERE seller_id = ?", [id]);
    } else {
      return res.status(400).send("Invalid role");
    }
    return res.json({ message: `${role} removed successfully` });
  } catch (err) {
    return res.status(500).send("Server error: " + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

// ─── LOYALTY COINS ───

app.get("/api/coins/:customerId", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [req.params.customerId]);
    if (rows.length === 0) return res.status(404).json({ error: "Customer not found" });
    return res.json({ coins: parseFloat(rows[0].loyalty_coins) || 0 });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.post("/api/coins/earn", async (req, res) => {
  let conn;
  try {
    const { customerId, amount } = req.body;
    if (!customerId || amount === undefined) return res.status(400).json({ error: "customerId and amount required" });
    conn = await mysql.createConnection(dbConfig);
    await conn.execute("UPDATE customers SET loyalty_coins = loyalty_coins + 10 WHERE customer_id = ?", [customerId]);
    const [rows] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [customerId]);
    return res.json({ earned: "10.00", newBalance: parseFloat(rows[0].loyalty_coins) });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.post("/api/coins/spend", async (req, res) => {
  let conn;
  try {
    const { customerId, coinsToSpend } = req.body;
    if (!customerId || !coinsToSpend) return res.status(400).json({ error: "customerId and coinsToSpend required" });
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [customerId]);
    if (rows.length === 0) return res.status(404).json({ error: "Customer not found" });
    const current = parseFloat(rows[0].loyalty_coins) || 0;
    if (current < parseFloat(coinsToSpend)) return res.status(400).json({ error: "Insufficient coins", balance: current });
    await conn.execute("UPDATE customers SET loyalty_coins = loyalty_coins - ? WHERE customer_id = ?", [parseFloat(coinsToSpend), customerId]);
    const [updated] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [customerId]);
    return res.json({ spent: parseFloat(coinsToSpend), newBalance: parseFloat(updated[0].loyalty_coins) });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.post("/api/coins/add", async (req, res) => {
  let conn;
  try {
    const { customerId, coins } = req.body;
    const amount = parseFloat(coins);
    if (!customerId || isNaN(amount) || amount <= 0) return res.status(400).json({ error: "Invalid request" });
    conn = await mysql.createConnection(dbConfig);
    await conn.execute("UPDATE customers SET loyalty_coins = loyalty_coins + ? WHERE customer_id = ?", [amount, customerId]);
    const [rows] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [customerId]);
    return res.json({ added: amount, newBalance: parseFloat(rows[0].loyalty_coins) });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// ─── PAYMENTS ───

app.post("/api/payments", async (req, res) => {
  let conn;
  try {
    const { customerId, orderId, amount, method, status, transactionRef, coinsEarned } = req.body;
    if (!customerId || !amount || !method) return res.status(400).json({ error: "customerId, amount, and method are required" });
    conn = await mysql.createConnection(dbConfig);
    const [result] = await conn.execute(
      "INSERT INTO payments (user_id, order_id, amount, method, status, transaction_ref, coins_earned) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [customerId, orderId || null, parseFloat(amount), method, status || "pending", transactionRef || null, parseFloat(coinsEarned) || 0]
    );
    return res.status(201).json({ id: result.insertId, message: "Payment recorded" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.get("/api/payments/customer/:customerId", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      "SELECT p.*, p.user_id as customer_id, c.name as customer_name FROM payments p JOIN customers c ON p.user_id = c.customer_id WHERE p.user_id = ? ORDER BY p.created_at DESC",
      [req.params.customerId]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.get("/api/payments/admin/all", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      "SELECT p.*, p.user_id as customer_id, c.name as customer_name, c.email as customer_email FROM payments p JOIN customers c ON p.user_id = c.customer_id ORDER BY p.created_at DESC"
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.get("/api/payments/:id", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute("SELECT * FROM payments WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Payment not found" });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.patch("/api/payments/:id/status", async (req, res) => {
  let conn;
  try {
    const { status } = req.body;
    if (!["pending", "paid", "failed", "refunded"].includes(status)) return res.status(400).json({ error: "Invalid status" });
    conn = await mysql.createConnection(dbConfig);
    await conn.execute("UPDATE payments SET status = ? WHERE id = ?", [status, req.params.id]);
    return res.json({ message: "Payment status updated" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.get("/api/payments/seller/:sellerId", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      `SELECT p.*, c.name as customer_name, c.email as customer_email,
              r.product_id, prod.name as product_name, prod.image_url as product_image
       FROM payments p
       JOIN customers c ON p.user_id = c.customer_id
       LEFT JOIN orders r ON p.order_id = r.id
       LEFT JOIN products prod ON r.product_id = prod.id
       WHERE r.seller_id = ? OR prod.seller_id = ?
       ORDER BY p.created_at DESC`,
      [req.params.sellerId, req.params.sellerId]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

app.delete("/api/payments/:id", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    await conn.execute("DELETE FROM payments WHERE id = ?", [req.params.id]);
    return res.json({ message: "Payment deleted" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// ─── STRIPE ───

function parseProductPrice(priceStr) {
  if (typeof priceStr === "number") return priceStr;
  const str = String(priceStr || "0");
  const match = str.match(/(\d+(?:\.\d+)?)\s*(?:per|\/|Rs\.?)\s*(\d+)?\s*([a-zA-Z]+)/i);
  if (match) {
    const price = parseFloat(match[1]);
    const amount = parseFloat(match[2]) || 1;
    const unit = match[3].toLowerCase();
    const unitInKg = unit.startsWith("g") ? amount / 1000 : amount;
    return price / unitInKg;
  }
  const fallback = str.match(/[\d.]+/);
  return fallback ? parseFloat(fallback[0]) : 0;
}

app.post("/api/create-checkout-session", async (req, res) => {
  let conn;
  try {
    const { items, customerId, deliveryFee, surcharge, coinDiscount } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items array is required" });
    if (!customerId) return res.status(400).json({ error: "customerId is required" });

    conn = await mysql.createConnection(dbConfig);
    const line_items = [];

    for (const item of items) {
      const { productId, quantity, orderId } = item;
      if (!productId || !quantity || quantity <= 0) return res.status(400).json({ error: `Invalid item: productId=${productId}` });

      let pricePerUnit = 0;
      let productName = "Product";

      if (orderId && typeof orderId === "string" && orderId.startsWith("#REQ-")) {
        const reqId = parseInt(orderId.match(/\d+/)?.[0]);
        if (reqId) {
          const [reqRows] = await conn.execute(
            "SELECT orq.unit_price, p.name FROM order_requests orq JOIN products p ON orq.product_id = p.id WHERE orq.id = ?",
            [reqId]
          );
          if (reqRows.length > 0) { pricePerUnit = parseFloat(reqRows[0].unit_price) || 0; productName = reqRows[0].name; }
        }
      }

      if (!pricePerUnit) {
        const [rows] = await conn.execute("SELECT id, name, price, sale_details FROM products WHERE id = ?", [productId]);
        if (rows.length === 0) return res.status(400).json({ error: `Product not found: id=${productId}` });
        const product = rows[0];
        productName = product.name;
        pricePerUnit = product.sale_details ? parseProductPrice(product.sale_details) : parseProductPrice(product.price);
      }

      line_items.push({
        price_data: { currency: "lkr", product_data: { name: productName }, unit_amount: Math.round(pricePerUnit * quantity * 100) },
        quantity: 1,
      });
    }

    if (deliveryFee && parseFloat(deliveryFee) > 0) {
      line_items.push({ price_data: { currency: "lkr", product_data: { name: "Delivery Fee" }, unit_amount: Math.round(parseFloat(deliveryFee) * 100) }, quantity: 1 });
    }

    if (surcharge && parseFloat(surcharge) > 0) {
      line_items.push({ price_data: { currency: "lkr", product_data: { name: "Small Order Fee" }, unit_amount: Math.round(parseFloat(surcharge) * 100) }, quantity: 1 });
    }

    const frontendUrl = process.env.FRONTEND_URL || "https://leef-sdp-new-one.vercel.app";
    const sessionConfig = {
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      success_url: `${frontendUrl}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/order-confirm.html`,
      metadata: { customerId: String(customerId), coinDiscount: String(coinDiscount || 0) },
    };

    if (coinDiscount && parseFloat(coinDiscount) > 0) {
      const coupon = await stripe.coupons.create({ amount_off: Math.round(parseFloat(coinDiscount) * 100), currency: "lkr", duration: "once", name: "Loyalty Coin Discount" });
      sessionConfig.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res.status(500).json({ error: "Failed to create checkout session: " + err.message });
  } finally {
    if (conn) await conn.end();
  }
});

app.get("/api/checkout-session/:sessionId", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    return res.json({
      id: session.id,
      payment_status: session.payment_status,
      status: session.status,
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_details?.email || null,
      metadata: session.metadata,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to retrieve session: " + err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  initializeDatabase();
  console.log(`Server running on port ${PORT}`);
});