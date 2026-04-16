const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ quiet: true });
console.log("----- ENV DIAGNOSTICS -----");
console.log("MAIL_USER:", process.env.MAIL_USER);
console.log("MAIL_PASS SET:", !!process.env.MAIL_APP_PASSWORD);
console.log("---------------------------");
// Initialize Stripe safely
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn("⚠️  STRIPE_SECRET_KEY is missing. Stripe features will be disabled.");
  // Provide a dummy object to prevent 'undefined' errors if called before a crash, 
  // though it will still fail if a method is called.
  stripe = {
    checkout: { sessions: { create: () => { throw new Error("Stripe not configured"); }, retrieve: () => { throw new Error("Stripe not configured"); } } },
    coupons: { create: () => { throw new Error("Stripe not configured"); } }
  };
}


// Config & Routes
const { dbConfig } = require("./config/db");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const refundRoutes = require("./routes/refundRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const { generateSellerInvitationEmail, generateAccountApprovedEmail } = require("./templates/email-templates");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/products", productRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/notifications", notificationRoutes);

// Initialize Database
async function initializeDatabase() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);

    // Create OTP table
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

    // Create products table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150),
        price DECIMAL(10, 2),
        image_url VARCHAR(255),
        stock INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create product_updates
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

    // Create Notifications
    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT DEFAULT NULL,
          message VARCHAR(255) NOT NULL,
          type ENUM('info', 'warning', 'error') DEFAULT 'info',
          is_read TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (e) { console.log(`Note (notifications): ${e.message}`); }

    // Create product_images gallery
    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS product_images (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          image_url VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (e) { console.log(`Note (product_images): ${e.message}`); }

    // Create product_update_images for pending updates
    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS product_update_images (
          id INT AUTO_INCREMENT PRIMARY KEY,
          update_id INT NOT NULL,
          image_url VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (e) { console.log(`Note (product_update_images): ${e.message}`); }

    // Create seller_certificates table
    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS seller_certificates (
          id INT AUTO_INCREMENT PRIMARY KEY,
          seller_id INT NOT NULL,
          certificate VARCHAR(500) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (e) { console.log(`Note (seller_certificates): ${e.message}`); }

    // Create user_locations table for multi-location delivery
    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS user_locations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          user_role ENUM('customer', 'seller') NOT NULL,
          short_name VARCHAR(100) NOT NULL,
          district VARCHAR(100) DEFAULT NULL,
          location_details VARCHAR(255) NOT NULL,
          status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (e) { console.log(`Note (user_locations): ${e.message}`); }

    // Add user_id to notifications if missing
    try {
      await conn.execute("ALTER TABLE notifications ADD COLUMN user_id INT DEFAULT NULL AFTER id");
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log(`Note: ${e.message}`);
    }

    // Create Questions
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        user_id INT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create / Repair Feedback table
    // Check if feedback table has the required schema; if not, rebuild it
    try {
      const [fbCols] = await conn.execute("SHOW COLUMNS FROM feedback");
      const fbColNames = fbCols.map(c => c.Field);
      const needsRebuild = !fbColNames.includes('user_id') || !fbColNames.includes('product_id');
      if (needsRebuild) {
        console.log("⚠️  feedback table has wrong schema — rebuilding...");
        await conn.execute("DROP TABLE IF EXISTS feedback");
      }
    } catch (e) {
      // Table doesn't exist yet — that's fine, the CREATE below will make it
    }
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        user_id INT NOT NULL,
        order_id INT DEFAULT NULL,
        seller_id INT DEFAULT NULL,
        rating INT DEFAULT 5,
        seller_rating INT DEFAULT 5,
        comment TEXT,
        is_visible TINYINT(1) DEFAULT 1,
        image_url VARCHAR(500) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Safe Migration: Rename refund_requests to refunds
    try {
      const [[oldTable]] = await conn.execute("SHOW TABLES LIKE 'refund_requests'");
      const [[newTable]] = await conn.execute("SHOW TABLES LIKE 'refunds'");

      if (oldTable) {
        if (newTable) {
          // If the new table 'refunds' is empty, we can drop it and rename the old one
          const [rows] = await conn.execute("SELECT COUNT(*) as count FROM refunds");
          if (rows[0].count === 0) {
            console.log("🔄 Dropping empty 'refunds' table to make room for rename...");
            await conn.execute("DROP TABLE refunds");
            await conn.execute("RENAME TABLE refund_requests TO refunds");
          } else {
            // If it has data, merge instead
            console.log("🔄 Merging refund_requests into existing refunds table...");
            await conn.execute("INSERT IGNORE INTO refunds (user_id, order_id, product_id, reason, description, status, admin_note, image_urls, created_at, updated_at) SELECT user_id, order_id, product_id, reason, description, status, admin_note, image_urls, created_at, updated_at FROM refund_requests");
            await conn.execute("DROP TABLE refund_requests");
          }
          console.log("✅ Migration complete: Data is now in 'refunds' table");
        } else {
          // Only old exists: rename it
          await conn.execute("RENAME TABLE refund_requests TO refunds");
          console.log("✅ Renamed refund_requests table to refunds");
        }
      }
    } catch (e) {
      console.error("⚠️ Migration error (refunds):", e.message);
    }

    // Create / Update Refunds table structure
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS refunds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        order_id INT NOT NULL,
        product_id INT DEFAULT NULL,
        reason VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        admin_note TEXT DEFAULT NULL,
        seller_note TEXT DEFAULT NULL,
        image_urls TEXT DEFAULT NULL,
        responsible_party VARCHAR(50) DEFAULT NULL,
        responsible_seller_id INT DEFAULT NULL,
        payment_status ENUM('pending', 'paid') DEFAULT 'pending',
        refund_amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create Refund Messages table for multi-message history
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS refund_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        refund_id INT NOT NULL,
        sender_role ENUM('admin', 'seller') NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (refund_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Create Payments table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        order_id INT DEFAULT NULL,
        amount DECIMAL(10,2) NOT NULL,
        method ENUM('cod','visa') NOT NULL,
        status ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
        transaction_ref VARCHAR(100) DEFAULT NULL,
        coins_earned DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Repair payments table (standardize on user_id)
    try {
      const [cols] = await conn.execute("SHOW COLUMNS FROM payments");
      const colNames = cols.map(c => c.Field);

      // If customer_id exists but user_id doesn't, rename it
      if (colNames.includes('customer_id') && !colNames.includes('user_id')) {
        console.log("⚠️  Renaming customer_id -> user_id in payments...");
        await conn.execute("ALTER TABLE payments CHANGE customer_id user_id INT NOT NULL");
      }
      // If user_id still doesn't exist, add it
      if (!colNames.includes('user_id')) {
        console.log("⚠️  Adding missing user_id to payments...");
        // Use a generic ADD COLUMN without AFTER if id might be missing
        await conn.execute("ALTER TABLE payments ADD COLUMN user_id INT NOT NULL");
      }
      // Ensure coins_earned exists
      if (!colNames.includes('coins_earned')) {
        console.log("⚠️  Adding missing coins_earned to payments...");
        await conn.execute("ALTER TABLE payments ADD COLUMN coins_earned DECIMAL(10,2) DEFAULT 0");
      }
      // Ensure transaction_ref exists
      if (!colNames.includes('transaction_ref')) {
        console.log("⚠️  Adding missing transaction_ref to payments...");
        await conn.execute("ALTER TABLE payments ADD COLUMN transaction_ref VARCHAR(100) DEFAULT NULL");
      }
      // Ensure order_id exists
      if (!colNames.includes('order_id')) {
        console.log("⚠️  Adding missing order_id to payments...");
        await conn.execute("ALTER TABLE payments ADD COLUMN order_id INT DEFAULT NULL");
      } else {
        try {
          await conn.execute("ALTER TABLE payments DROP FOREIGN KEY fk_payments_order");
          console.log("⚠️  Dropped fk_payments_order constraint to allow nulls...");
        } catch (e) { }
        await conn.execute("ALTER TABLE payments MODIFY COLUMN order_id INT DEFAULT NULL");
      }
      // Ensure created_at exists
      if (!colNames.includes('created_at')) {
        console.log("⚠️  Adding missing created_at to payments...");
        await conn.execute("ALTER TABLE payments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
      }
      // Ensure updated_at exists
      if (!colNames.includes('updated_at')) {
        console.log("⚠️  Adding missing updated_at to payments...");
        await conn.execute("ALTER TABLE payments ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
      }
    } catch (e) {
      console.log(`Note (payments repair): ${e.message}`);
    }

    // Create Order Requests (for Distributor Approval)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS order_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        seller_id INT NOT NULL,
        locations JSON NOT NULL,
        total_qty INT NOT NULL,
        unit_price DECIMAL(10,2) DEFAULT 0,
        total_price DECIMAL(10,2) DEFAULT 0,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Repair order_items if it has the wrong schema (missing user_id)
    try {
      const [cols] = await conn.execute("SHOW COLUMNS FROM order_items");
      const colNames = cols.map(c => c.Field);
      if (!colNames.includes('user_id')) {
        console.log("⚠️  order_items table has outdated schema — dropping to recreate...");
        await conn.execute("DROP TABLE order_items");
      }
    } catch (e) {
      // Table doesn't exist yet
    }

    // Create Orders Table (Finalized Orders)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        seller_id INT NOT NULL,
        order_type ENUM('direct', 'request') NOT NULL,
        request_id INT DEFAULT NULL,
        quantity DECIMAL(10,2) NOT NULL,
        unit_price DECIMAL(10,2) DEFAULT 0,
        total_price DECIMAL(10,2) DEFAULT 0,
        status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
        payment_status ENUM('pending', 'paid') DEFAULT 'pending',
        payment_method VARCHAR(20) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (request_id) REFERENCES order_requests(id) ON DELETE SET NULL
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
    `);

    // Migration: Rename order_items to orders if it exists
    try {
      const [[oldOrdersTable]] = await conn.execute("SHOW TABLES LIKE 'order_items'");
      const [[newOrdersTable]] = await conn.execute("SHOW TABLES LIKE 'orders'");
      if (oldOrdersTable && !newOrdersTable) {
        console.log("🔄 Renaming 'order_items' to 'orders'...");
        await conn.execute("RENAME TABLE order_items TO orders");
      }
    } catch (e) {
      console.log(`Note (orders migration): ${e.message}`);
    }

    // ALTERS
    const productAlterStmts = [
      "ALTER TABLE products ADD COLUMN seller_id INT NOT NULL AFTER id",
      "ALTER TABLE products ADD COLUMN category VARCHAR(100) AFTER name",
      "ALTER TABLE products ADD COLUMN description TEXT AFTER stock",
      "ALTER TABLE products ADD COLUMN is_approved TINYINT(1) DEFAULT 0 AFTER description",
      "ALTER TABLE products ADD COLUMN final_price VARCHAR(100) AFTER price",
      "ALTER TABLE products DROP COLUMN supply_price",
      "ALTER TABLE products ADD COLUMN coins_percent INT DEFAULT 0",
      "ALTER TABLE products ADD COLUMN sale_details VARCHAR(255)",
      "ALTER TABLE products ADD COLUMN is_ads TINYINT(1) DEFAULT 0",
      "ALTER TABLE products MODIFY COLUMN price VARCHAR(100)",
      "ALTER TABLE products MODIFY COLUMN stock VARCHAR(100)",
      "ALTER TABLE products MODIFY COLUMN final_price VARCHAR(100)"
    ];
    for (const sql of productAlterStmts) {
      try {
        await conn.execute(sql);
      } catch (e) {
        // Ignore if column already exists (ER_DUP_FIELDNAME) 
        // or if column to drop doesn't exist (ER_CANT_DROP_FIELD_OR_KEY)
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.errno !== 1091) {
          console.log(`Note: ${e.message}`);
        }
      }
    }

    const alterStatements = [
      { table: 'customers', sql: 'ALTER TABLE customers ADD COLUMN is_verified TINYINT(1) DEFAULT 0 AFTER password_hash' },
      { table: 'customers', sql: 'ALTER TABLE customers ADD COLUMN is_approved TINYINT(1) DEFAULT 0 AFTER is_verified' },
      { table: 'sellers', sql: 'ALTER TABLE sellers ADD COLUMN is_verified TINYINT(1) DEFAULT 0 AFTER password_hash' },
      { table: 'sellers', sql: 'ALTER TABLE sellers ADD COLUMN shop_town VARCHAR(100) AFTER shop_name' },
      { table: 'sellers', sql: 'ALTER TABLE sellers ADD COLUMN shop_address VARCHAR(255) AFTER shop_town' },
      { table: 'sellers', sql: 'ALTER TABLE sellers ADD COLUMN certificate_url VARCHAR(255) AFTER shop_details' },
      { table: 'admins', sql: 'ALTER TABLE admins ADD COLUMN is_verified TINYINT(1) DEFAULT 1 AFTER password_hash' },
      { table: 'order_requests', sql: 'ALTER TABLE order_requests ADD COLUMN admin_note TEXT DEFAULT NULL' },
      { table: 'order_requests', sql: 'ALTER TABLE order_requests ADD COLUMN rejection_reason TEXT DEFAULT NULL' },
      { table: 'customers', sql: 'ALTER TABLE customers ADD COLUMN loyalty_coins DECIMAL(10,2) DEFAULT 0' },
      { table: 'feedback', sql: 'ALTER TABLE feedback ADD COLUMN user_id INT NOT NULL DEFAULT 0' },
      { table: 'feedback', sql: 'ALTER TABLE feedback ADD COLUMN product_id INT NOT NULL DEFAULT 0' },
      { table: 'feedback', sql: 'ALTER TABLE feedback ADD COLUMN order_id INT DEFAULT NULL' },
      { table: 'feedback', sql: 'ALTER TABLE feedback ADD COLUMN seller_id INT DEFAULT NULL' },
      { table: 'feedback', sql: 'ALTER TABLE feedback ADD COLUMN seller_rating INT DEFAULT 5' },
      { table: 'feedback', sql: 'ALTER TABLE feedback ADD COLUMN is_visible TINYINT(1) DEFAULT 1' },
      { table: 'feedback', sql: 'ALTER TABLE feedback ADD COLUMN image_url VARCHAR(500) DEFAULT NULL' },
      { table: 'refunds', sql: 'ALTER TABLE refunds ADD COLUMN image_urls TEXT DEFAULT NULL' },
      { table: 'refunds', sql: "ALTER TABLE refunds MODIFY COLUMN responsible_party VARCHAR(50) DEFAULT NULL" },
      { table: 'refunds', sql: 'ALTER TABLE refunds ADD COLUMN responsible_seller_id INT DEFAULT NULL' },
      { table: 'refunds', sql: "ALTER TABLE refunds MODIFY COLUMN status VARCHAR(50) DEFAULT 'pending'" },
      { table: 'refunds', sql: 'ALTER TABLE refunds ADD COLUMN seller_note TEXT DEFAULT NULL AFTER admin_note' },
      { table: 'refunds', sql: 'ALTER TABLE refunds ADD COLUMN refund_amount DECIMAL(10,2) DEFAULT 0 AFTER payment_status' },
      { table: 'order_requests', sql: 'ALTER TABLE order_requests ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0 AFTER total_qty' },
      { table: 'order_requests', sql: 'ALTER TABLE order_requests ADD COLUMN total_price DECIMAL(10,2) DEFAULT 0 AFTER unit_price' },
      { table: 'order_requests', sql: 'ALTER TABLE order_requests ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      { table: 'sellers', sql: 'ALTER TABLE sellers ADD COLUMN phone VARCHAR(20) AFTER email' },
      { table: 'sellers', sql: 'ALTER TABLE sellers ADD COLUMN profile_pic VARCHAR(255) DEFAULT NULL' },
      { table: 'feedback', sql: 'ALTER TABLE feedback ADD COLUMN is_read TINYINT(1) DEFAULT 0' },
      { table: 'questions', sql: 'ALTER TABLE questions ADD COLUMN is_read TINYINT(1) DEFAULT 0' },
      { table: 'user_locations', sql: 'ALTER TABLE user_locations ADD COLUMN district VARCHAR(100) DEFAULT NULL AFTER short_name' },
      { table: 'customers', sql: 'ALTER TABLE customers ADD COLUMN phone2 VARCHAR(20) AFTER phone' },
      { table: 'sellers', sql: 'ALTER TABLE sellers ADD COLUMN phone2 VARCHAR(20) AFTER phone' },
      { table: 'orders', sql: 'ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) DEFAULT 0' },
      { table: 'orders', sql: 'ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0' },
    ];
    for (const stmt of alterStatements) {
      try {
        await conn.execute(stmt.sql);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.errno !== 1091) {
          console.log(`Note: ${e.message}`);
        }
      }
    }

    console.log("✅ Database initialization complete");
  } catch (err) {
    console.error("⚠️  Database initialization warning:", err.message);
  } finally {
    if (conn) await conn.end();
  }
}

app.get("/", (req, res) => res.send("leef backend running ✅"));

// ─── ADMIN SIDEBAR BADGE COUNTS ───
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
    console.error("Sidebar counts error:", err.message);
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
    if (type === 'feedback') {
      await conn.execute("UPDATE feedback SET is_read = 1 WHERE is_read = 0");
    } else if (type === 'questions') {
      await conn.execute("UPDATE questions SET is_read = 1 WHERE is_read = 0");
    }
    res.json({ message: `${type} marked as read` });
  } catch (err) {
    console.error("Mark read error:", err.message);
    res.status(500).json({ message: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// ─── SELLER SIDEBAR BADGE COUNTS ───
app.get("/api/seller/sidebar-counts/:sellerId", async (req, res) => {
  let conn;
  try {
    const { sellerId } = req.params;
    conn = await mysql.createConnection(dbConfig);
    // Use responsible_seller_id as seen in refundController.js
    const [[r]] = await conn.execute(
      "SELECT COUNT(*) as count FROM refunds WHERE responsible_seller_id = ? AND status = 'waiting_seller'",
      [sellerId]
    );
    res.json({ refunds: r.count });
  } catch (err) {
    console.error("Seller sidebar counts error:", err.message);
    res.json({ refunds: 0 });
  } finally {
    if (conn) await conn.end();
  }
});

// ADMIN: INVITE SELLER (Needs transporter, which is now in utils... but invite-seller was not refactored yet)
// We need to import transporter from utils if we use it here.
const { transporter } = require("./utils/authUtils");

app.post("/api/admin/invite-seller", async (req, res) => {
  let conn;
  try {
    const { email } = req.body;
    if (!email) return res.status(400).send("Email is required");

    conn = await mysql.createConnection(dbConfig);
    // Check if email already exists in sellers
    const [existingSeller] = await conn.execute("SELECT seller_id FROM sellers WHERE email=? LIMIT 1", [email]);
    if (existingSeller.length > 0) return res.status(400).send("Seller with this email already exists.");

    // Check if email already exists in customers
    const [existingCustomer] = await conn.execute("SELECT customer_id FROM customers WHERE email=? LIMIT 1", [email]);
    if (existingCustomer.length > 0) return res.status(400).send("This email is already registered as a Customer. One email can only have one role.");

    const invitationLink = `http://localhost:5173/register-seller.html?email=${encodeURIComponent(email)}`;
    const emailContent = generateSellerInvitationEmail(email, invitationLink);

    await transporter.sendMail({
      from: `Leef <${process.env.MAIL_USER}>`,
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    console.log(`✅ Seller invitation sent to ${email}`);
    return res.json({ message: "Invitation sent successfully" });
  } catch (err) {
    console.error("❌ Failed to invite seller:", err);
    return res.status(500).send("Server error: " + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

// ADMIN: CUSTOMER APPROVAL
app.get("/api/admin/requests/customers", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      "SELECT customer_id, name, town, email, created_at FROM customers WHERE is_verified = 1 AND is_approved = 0 ORDER BY created_at DESC"
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
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
    const [rows] = await conn.execute("SELECT name, email FROM customers WHERE customer_id=?", [customerId]);
    if (rows.length === 0) return res.status(404).send("Customer not found");

    const { name, email } = rows[0];
    await conn.execute("UPDATE customers SET is_approved = 1 WHERE customer_id = ?", [customerId]);

    const emailContent = generateAccountApprovedEmail(name);
    await transporter.sendMail({
      from: `Leef <${process.env.MAIL_USER}>`,
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    console.log(`✅ Customer ${email} approved.`);
    return res.json({ message: "Customer approved successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error: " + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

// ADMIN: GET ALL USERS (Customers + Sellers)
app.get("/api/admin/users", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);

    // Fetch Customers
    const [customers] = await conn.execute(
      "SELECT customer_id as id, name, username, email, phone, phone2, address, town, 'Customer' as role, created_at FROM customers ORDER BY created_at DESC"
    );

    const [sellers] = await conn.execute(
      "SELECT seller_id as id, name, username, email, phone, phone2, shop_name, shop_town as town, shop_address, 'Seller' as role, created_at FROM sellers ORDER BY created_at DESC"
    );

    // Combine and sort by date descending
    const allUsers = [...customers, ...sellers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json(allUsers);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  } finally {
    if (conn) await conn.end();
  }
});

// ADMIN: DELETE USER
app.delete("/api/admin/user/:role/:id", async (req, res) => {
  let conn;
  try {
    const { role, id } = req.params;
    if (!role || !id) return res.status(400).send("Missing role or id");

    conn = await mysql.createConnection(dbConfig);
    let query = "";
    if (role === 'Customer') {
      query = "DELETE FROM customers WHERE customer_id = ?";
    } else if (role === 'Seller') {
      // Note: Might need to handle seller certificates table if no CASCADE
      await conn.execute("DELETE FROM seller_certificates WHERE seller_id = ?", [id]);
      query = "DELETE FROM sellers WHERE seller_id = ?";
    } else {
      return res.status(400).send("Invalid role");
    }

    const [result] = await conn.execute(query, [id]);
    if (result.affectedRows === 0) return res.status(404).send("User not found");

    return res.json({ message: `${role} removed successfully` });
  } catch (err) {
    console.error("Delete user error:", err);
    return res.status(500).send("Server error: " + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

// =====================
// LOYALTY COINS API
// =====================

// GET coin balance
app.get("/api/coins/:customerId", async (req, res) => {
  let conn;
  try {
    const { customerId } = req.params;
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      "SELECT loyalty_coins FROM customers WHERE customer_id = ?",
      [customerId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Customer not found" });
    return res.json({ coins: parseFloat(rows[0].loyalty_coins) || 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// POST earn coins (2% of purchase total)
app.post("/api/coins/earn", async (req, res) => {
  let conn;
  try {
    const { customerId, amount } = req.body;
    if (!customerId || amount === undefined) return res.status(400).json({ error: "customerId and amount required" });
    const earned = 10;
    conn = await mysql.createConnection(dbConfig);
    await conn.execute(
      "UPDATE customers SET loyalty_coins = loyalty_coins + ? WHERE customer_id = ?",
      [earned, customerId]
    );
    const [rows] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [customerId]);
    return res.json({ earned: earned.toFixed(2), newBalance: parseFloat(rows[0].loyalty_coins) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// POST spend coins
app.post("/api/coins/spend", async (req, res) => {
  let conn;
  try {
    const { customerId, coinsToSpend } = req.body;
    if (!customerId || !coinsToSpend) return res.status(400).json({ error: "customerId and coinsToSpend required" });
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [customerId]);
    if (rows.length === 0) return res.status(404).json({ error: "Customer not found" });
    const current = parseFloat(rows[0].loyalty_coins) || 0;
    if (current < parseFloat(coinsToSpend)) {
      return res.status(400).json({ error: "Insufficient coins", balance: current });
    }
    await conn.execute(
      "UPDATE customers SET loyalty_coins = loyalty_coins - ? WHERE customer_id = ?",
      [parseFloat(coinsToSpend), customerId]
    );
    const [updated] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [customerId]);
    return res.json({ spent: parseFloat(coinsToSpend), newBalance: parseFloat(updated[0].loyalty_coins) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// POST add flat coins (e.g. feedback reward claim)
app.post("/api/coins/add", async (req, res) => {
  let conn;
  try {
    const { customerId, coins } = req.body;
    if (!customerId || !coins) return res.status(400).json({ error: "customerId and coins required" });
    const amount = parseFloat(coins);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "Invalid coins value" });
    conn = await mysql.createConnection(dbConfig);
    await conn.execute(
      "UPDATE customers SET loyalty_coins = loyalty_coins + ? WHERE customer_id = ?",
      [amount, customerId]
    );
    const [rows] = await conn.execute("SELECT loyalty_coins FROM customers WHERE customer_id = ?", [customerId]);
    return res.json({ added: amount, newBalance: parseFloat(rows[0].loyalty_coins) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// =====================
// PAYMENTS CRUD API
// =====================

// POST /api/payments — Create a payment record
app.post("/api/payments", async (req, res) => {
  let conn;
  try {
    const { customerId, orderId, amount, method, status, transactionRef, coinsEarned } = req.body;
    if (!customerId || !amount || !method) return res.status(400).json({ error: "customerId, amount, and method are required" });
    conn = await mysql.createConnection(dbConfig);
    const [result] = await conn.execute(
      `INSERT INTO payments (user_id, order_id, amount, method, status, transaction_ref, coins_earned)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customerId, orderId || null, parseFloat(amount), method, status || "pending", transactionRef || null, parseFloat(coinsEarned) || 0]
    );
    return res.status(201).json({ id: result.insertId, message: "Payment recorded" });
  } catch (err) {
    console.error("Error creating payment:", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// GET /api/payments/customer/:customerId — Customer's payment history
app.get("/api/payments/customer/:customerId", async (req, res) => {
  let conn;
  try {
    const { customerId } = req.params;
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      `SELECT p.*, p.user_id as customer_id, c.name as customer_name FROM payments p
       JOIN customers c ON p.user_id = c.customer_id
       WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      [customerId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// GET /api/payments/admin/all — Admin: all payments
app.get("/api/payments/admin/all", async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      `SELECT p.*, p.user_id as customer_id, c.name as customer_name, c.email as customer_email
       FROM payments p JOIN customers c ON p.user_id = c.customer_id
       ORDER BY p.created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// GET /api/payments/:id — Get a single payment
app.get("/api/payments/:id", async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute("SELECT * FROM payments WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Payment not found" });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// PATCH /api/payments/:id/status — Update payment status
app.patch("/api/payments/:id/status", async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!["pending", "paid", "failed", "refunded"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    conn = await mysql.createConnection(dbConfig);
    await conn.execute("UPDATE payments SET status = ? WHERE id = ?", [status, id]);
    return res.json({ message: "Payment status updated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// GET /api/payments/seller/:sellerId — Payments for a seller's products
app.get("/api/payments/seller/:sellerId", async (req, res) => {
  let conn;
  try {
    const { sellerId } = req.params;
    conn = await mysql.createConnection(dbConfig);
    // Join payments (p.user_id) with order_requests + products to filter by seller
    const [rows] = await conn.execute(
      `SELECT p.*, c.name as customer_name, c.email as customer_email,
              r.product_id, prod.name as product_name, prod.image_url as product_image
       FROM payments p
       JOIN customers c ON p.user_id = c.customer_id
       LEFT JOIN orders r ON p.order_id = r.id
       LEFT JOIN products prod ON r.product_id = prod.id
       WHERE r.seller_id = ? OR prod.seller_id = ?
       ORDER BY p.created_at DESC`,
      [sellerId, sellerId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// DELETE /api/payments/:id — Admin: delete a payment record
app.delete("/api/payments/:id", async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await mysql.createConnection(dbConfig);
    await conn.execute("DELETE FROM payments WHERE id = ?", [id]);
    return res.json({ message: "Payment deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (conn) await conn.end();
  }
});

// =====================
// STRIPE CHECKOUT API
// =====================

// Helper: parse VARCHAR price like "40 per 500 g" or "150" into a numeric price-per-unit (per kg)
function parseProductPrice(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  const str = String(priceStr || '0');
  const match = str.match(/(\d+(?:\.\d+)?)\s*(?:per|\/|Rs\.?)\s*(\d+)?\s*([a-zA-Z]+)/i);
  if (match) {
    let price = parseFloat(match[1]);
    let amount = parseFloat(match[2]) || 1;
    let unit = match[3].toLowerCase();
    let unitInKg = 1;
    if (unit.startsWith('g')) unitInKg = amount / 1000;
    else if (unit.startsWith('kg')) unitInKg = amount;
    else unitInKg = amount;
    return price / unitInKg;
  }
  const fallback = str.match(/[\d.]+/);
  return fallback ? parseFloat(fallback[0]) : 0;
}

// POST /api/create-checkout-session
app.post("/api/create-checkout-session", async (req, res) => {
  let conn;
  try {
    const { items, customerId, deliveryFee, surcharge, coinDiscount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }
    if (!customerId) {
      return res.status(400).json({ error: "customerId is required" });
    }

    conn = await mysql.createConnection(dbConfig);
    const line_items = [];

    for (const item of items) {
      const { productId, quantity, orderId } = item;
      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ error: `Invalid item: productId=${productId}, quantity=${quantity}` });
      }

      let pricePerUnit = 0;
      let productName = "Product";

      // If it's a distributor request order, fetch the custom unit price
      if (orderId && typeof orderId === 'string' && orderId.startsWith('#REQ-')) {
        const reqMatch = orderId.match(/\d+/);
        if (reqMatch) {
          const reqId = parseInt(reqMatch[0]);
          const [reqRows] = await conn.execute(
            "SELECT orq.unit_price, p.name FROM order_requests orq JOIN products p ON orq.product_id = p.id WHERE orq.id = ?",
            [reqId]
          );
          if (reqRows.length > 0) {
            pricePerUnit = parseFloat(reqRows[0].unit_price) || 0;
            productName = reqRows[0].name;
          }
        }
      }

      // Standard product lookup if price isn't set yet
      if (!pricePerUnit) {
        const [rows] = await conn.execute("SELECT id, name, price, sale_details FROM products WHERE id = ?", [productId]);
        if (rows.length === 0) {
          return res.status(400).json({ error: `Product not found: id=${productId}` });
        }
        const product = rows[0];
        productName = product.name;
        
        pricePerUnit = product.sale_details
          ? parseProductPrice(product.sale_details)
          : parseProductPrice(product.price);
      }

      // Stripe expects unit_amount in the smallest currency unit (cents for LKR)
      // We calculate the exact subtotal for this item to avoid compounding rounding errors
      const totalAmountCents = Math.round(pricePerUnit * quantity * 100);

      line_items.push({
        price_data: {
          currency: 'lkr',
          product_data: { name: productName },
          unit_amount: totalAmountCents,
        },
        quantity: 1, // We pre-calculated totalAmountCents = price * qty, so Stripe quantity is 1
      });
    }

    // Add delivery fee as a line item if present
    if (deliveryFee && parseFloat(deliveryFee) > 0) {
      line_items.push({
        price_data: {
          currency: 'lkr',
          product_data: { name: 'Delivery Fee' },
          unit_amount: Math.round(parseFloat(deliveryFee) * 100),
        },
        quantity: 1,
      });
    }

    // Add surcharge as a line item if present
    if (surcharge && parseFloat(surcharge) > 0) {
      line_items.push({
        price_data: {
          currency: 'lkr',
          product_data: { name: 'Small Order Fee' },
          unit_amount: Math.round(parseFloat(surcharge) * 100),
        },
        quantity: 1,
      });
    }

    // Add coin discount as a negative line item (coupon/discount)
    // Stripe doesn't support negative line items, so we use discounts via coupons
    // For simplicity, we subtract from the metadata and handle it server-side
    const frontendUrl = process.env.FRONTEND_URL || 'https://leef-sdp-new-one.vercel.app';

    const sessionConfig = {
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: `${frontendUrl}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/order-confirm.html`,
      metadata: {
        customerId: String(customerId),
        coinDiscount: String(coinDiscount || 0),
      },
    };

    // If coin discount exists, create a coupon and apply it
    if (coinDiscount && parseFloat(coinDiscount) > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(parseFloat(coinDiscount) * 100),
        currency: 'lkr',
        duration: 'once',
        name: 'Loyalty Coin Discount',
      });
      sessionConfig.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log(`✅ Stripe session created: ${session.id} for customer ${customerId}`);
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("❌ Stripe session error:", err);
    return res.status(500).json({ error: "Failed to create checkout session: " + err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// GET /api/checkout-session/:sessionId — Verify a completed session
app.get("/api/checkout-session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

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
    console.error("❌ Stripe session retrieve error:", err);
    return res.status(500).json({ error: "Failed to retrieve session: " + err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  initializeDatabase().then(() => {
    console.log("✅ Database initialized in background");
  }).catch(err => {
    console.error("❌ Database initialization failed:", err.message);
  });
});
