const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");
const { generateOTP, sendOTPEmail, storeOTP, verifyOTP, makeUniqueUsername, verifyPassword } = require("../utils/authUtils");

/* =========================
   REGISTER
========================= */
exports.register = async (req, res) => {
    try {
        const { fullname, email, password, address, role, town, shop_name, shop_town, bio, phone, phone2 } = req.body;
        let { username } = req.body; // get custom username if present

        if (!fullname || !email || !password || !address || !role || !phone || !phone2) {
            return res.status(400).send("Missing required fields (Make sure two phone numbers are provided)");
        }

        if (password.length < 6) return res.status(400).send("Password must be at least 6 characters long");
        if (!/[A-Z]/.test(password)) return res.status(400).send("Password must contain at least one uppercase letter");
        if (!/[a-z]/.test(password)) return res.status(400).send("Password must contain at least one lowercase letter");
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return res.status(400).send("Password must contain at least one special character");

        // Email & Username check
        const [customerExists] = await pool.execute("SELECT customer_id FROM customers WHERE email=? LIMIT 1", [email]);
        const [sellerExists] = await pool.execute("SELECT seller_id FROM sellers WHERE email=? LIMIT 1", [email]);
        if (customerExists.length > 0) return res.status(409).send("This email is already registered as a Customer. One email can only have one role.");
        if (sellerExists.length > 0) return res.status(409).send("This email is already registered as a Seller. One email can only have one role.");

        if (username) {
            // Check username uniqueness if provided
            username = username.trim().toLowerCase();
            const [uc] = await pool.execute("SELECT customer_id FROM customers WHERE username=? LIMIT 1", [username]);
            const [us] = await pool.execute("SELECT seller_id FROM sellers WHERE username=? LIMIT 1", [username]);
            if (uc.length > 0 || us.length > 0) return res.status(409).send("Username already taken. Please choose another.");
        } else {
            // Auto-generate if not provided
            username = await makeUniqueUsername(pool, email);
        }

        const password_hash = await bcrypt.hash(password, 10);
        let userId;

        if (role === "customer") {
            const [result] = await pool.execute(
                "INSERT INTO customers (name, email, phone, phone2, username, password_hash, address, town, role, is_verified, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [fullname, email, phone, phone2, username, password_hash, address, town || null, "CUSTOMER", 0, 0]
            );
            userId = result.insertId;
        } else if (role === "seller") {
            const shop_details = `Bio: ${bio || ""}`;
            const profilePicField = req.files && req.files['profile_pic'] ? req.files['profile_pic'][0] : null;
            const profile_pic = profilePicField ? 'uploads/' + profilePicField.filename : null;

            const [result] = await pool.execute(
                "INSERT INTO sellers (name, email, phone, phone2, shop_name, shop_town, shop_address, shop_details, username, password_hash, profile_pic, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [fullname, email, phone, phone2, shop_name || "", shop_town || null, address || null, shop_details, username, password_hash, profile_pic, 0]
            );
            userId = result.insertId;

            const certField = req.files && req.files['certificates'] ? req.files['certificates'][0] : null;
            if (certField) {
                const certPath = "uploads/" + certField.filename;
                await pool.execute("INSERT INTO seller_certificates (seller_id, certificate) VALUES (?, ?)", [userId, certPath]);
            }
        } else {
            return res.status(400).send("Role must be customer or seller");
        }

        const otpCode = generateOTP();
        await storeOTP(pool, role, userId, email, otpCode, "registration");
        const emailSent = await sendOTPEmail(email, otpCode, "registration", fullname);

        if (!emailSent) return res.status(500).send("Registration successful but failed to send verification email.");

        return res.status(201).json({
            message: "Registration successful! Please check your email for verification code.",
            email: email,
            role: role
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server error: " + err.message);
    }
};

/* =========================
   VERIFY EMAIL
========================= */
exports.verifyEmail = async (req, res) => {
    try {
        const { email, otpCode, role } = req.body;
        if (!email || !otpCode || !role) return res.status(400).send("Required fields missing");

        const verification = await verifyOTP(pool, email, otpCode, "registration");
        if (!verification.valid) return res.status(400).send(verification.error);

        let table = role === "customer" ? "customers" : role === "seller" ? "sellers" : role === "admin" ? "admins" : null;
        let idCol = role === "customer" ? "customer_id" : role === "seller" ? "seller_id" : "admin_id"; // Assuming admin_id for admin

        if (table) {
            await pool.execute(`UPDATE ${table} SET is_verified = 1 WHERE ${idCol} = ?`, [verification.userId]);
        }

        return res.status(200).json({ message: "Email verified successfully!", success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server error: " + err.message);
    }
};

/* =========================
   RESEND OTP
========================= */
exports.resendOTP = async (req, res) => {
    try {
        const { email, purpose, role } = req.body;
        if (!email || !purpose || !role) return res.status(400).send("Required fields missing");

        let userId, userName;
        if (role === "customer") {
            const [rows] = await pool.execute("SELECT customer_id, name FROM customers WHERE email = ? LIMIT 1", [email]);
            if (rows.length === 0) return res.status(404).send("User not found");
            userId = rows[0].customer_id;
            userName = rows[0].name;
        } else if (role === "seller") {
            const [rows] = await pool.execute("SELECT seller_id, name FROM sellers WHERE email = ? LIMIT 1", [email]);
            if (rows.length === 0) return res.status(404).send("User not found");
            userId = rows[0].seller_id;
            userName = rows[0].name;
        } else {
            return res.status(400).send("Invalid role");
        }

        const otpCode = generateOTP();
        await storeOTP(pool, role, userId, email, otpCode, purpose);
        const emailSent = await sendOTPEmail(email, otpCode, purpose, userName);

        if (!emailSent) return res.status(500).json({ message: "Failed to send verification code email.", success: false });

        return res.status(200).json({ message: "OTP code sent successfully!", success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server error: " + err.message);
    }
};

/* =========================
   LOGIN
========================= */
exports.login = async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) return res.status(400).send("Missing login fields");

        let user = null;
        let role = "";

        // Check Admin
        const [adminRows] = await pool.execute("SELECT admin_id AS id, username, email, password_hash, is_verified FROM admins WHERE email=? OR username=? LIMIT 1", [identifier, identifier]);
        if (adminRows.length > 0) { user = adminRows[0]; role = "admin"; }

        // Check Customer
        if (!user) {
            const [customerRows] = await pool.execute("SELECT customer_id AS id, username, email, password_hash, is_verified, is_approved FROM customers WHERE email=? OR username=? LIMIT 1", [identifier, identifier]);
            if (customerRows.length > 0) { user = customerRows[0]; role = "customer"; }
        }

        // Check Seller
        if (!user) {
            const [sellerRows] = await pool.execute("SELECT seller_id AS id, username, email, password_hash, is_verified, profile_pic FROM sellers WHERE email=? OR username=? LIMIT 1", [identifier, identifier]);
            if (sellerRows.length > 0) { user = sellerRows[0]; role = "seller"; }
        }

        if (!user) return res.status(401).send("User not found");
        if (user.is_verified === 0) return res.status(403).send("Please verify your email.");
        if (role === "customer" && user.is_approved === 0) return res.status(403).send("Account pending approval.");

        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) return res.status(401).send("Wrong password");

        return res.status(200).json({
            message: "Login success ✅",
            role,
            id: user.id,
            username: user.username,
            email: user.email,
            profile_pic: user.profile_pic || null
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server error: " + err.message);
    }
};

/* =========================
   FORGOT PASSWORD
========================= */
exports.forgotPassword = async (req, res) => {
    try {
        let { role, email } = req.body;
        if (!email) return res.status(400).send("Email is required");

        // We return generic success to prevent user enumeration, but for our flow we return role too?
        // Actually, the next step usually needs the role to Verify OTP.
        // We should send the role back in the response? 
        // Or the verify endpoint also needs to be smart.
        // Wait, verifyOTP uses role to verify.
        // I should return the detected role in the response so the frontend can store it for the next step (Verify OTP).

        let userRow = null;
        let userName = "User";

        // Auto-detect role
        if (!role) {
            // Check Customers
            const [c] = await pool.execute("SELECT customer_id AS id, name FROM customers WHERE email=? LIMIT 1", [email]);
            if (c.length > 0) {
                role = "customer"; userRow = c[0];
            } else {
                // Check Sellers
                const [s] = await pool.execute("SELECT seller_id AS id, name FROM sellers WHERE email=? LIMIT 1", [email]);
                if (s.length > 0) {
                    role = "seller"; userRow = s[0];
                } else {
                    // Check Admins
                    const [a] = await pool.execute("SELECT admin_id AS id, username as name FROM admins WHERE email=? LIMIT 1", [email]);
                    if (a.length > 0) {
                        role = "admin"; userRow = a[0];
                    }
                }
            }
        } else {
            // Explicit role logic
            let table = role === "customer" ? "customers" : role === "seller" ? "sellers" : "admins";
            let idCol = role === "customer" ? "customer_id" : role === "seller" ? "seller_id" : "admin_id";
            const [r] = await pool.execute(`SELECT ${idCol} AS id, ${role === 'admin' ? 'username' : 'name'} as name FROM ${table} WHERE email=? LIMIT 1`, [email]);
            if (r.length > 0) userRow = r[0];
        }

        const generic = { message: "If the email exists, a reset code was sent to your email.", role: role, success: true }; // Include role for frontend

        if (!userRow) return res.json(generic);

        userName = userRow.name || "User";

        const otpCode = generateOTP();
        await storeOTP(pool, role, userRow.id, email, otpCode, "password_reset");
        const emailSent = await sendOTPEmail(email, otpCode, "password_reset", userName);

        if (!emailSent) {
            return res.status(500).json({ message: "Failed to send reset code email.", success: false });
        }

        return res.json(generic);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server error");
    }
};

/* =========================
   RESET PASSWORD
========================= */
exports.resetPassword = async (req, res) => {
    try {
        const { email, otpCode, newPassword, role } = req.body;
        if (!email || !otpCode || !newPassword || !role) return res.status(400).send("Missing fields");

        const verification = await verifyOTP(pool, email, otpCode, "password_reset");
        if (!verification.valid) return res.status(400).send(verification.error);

        const password_hash = await bcrypt.hash(newPassword, 10);

        let table = role === "customer" ? "customers" : role === "seller" ? "sellers" : "admins";
        let idCol = role === "customer" ? "customer_id" : role === "seller" ? "seller_id" : "admin_id";

        if (table) {
            await pool.execute(`UPDATE ${table} SET password_hash=? WHERE ${idCol}=?`, [password_hash, verification.userId]);
        }

        return res.json({ message: "Password updated successfully!" });
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server error");
    }
};

/* =========================
   GET PROFILE
========================= */
exports.getProfile = async (req, res) => {
    try {
        const { role, id } = req.params;
        if (!role || !id) return res.status(400).send("Role and ID required");

        let user = null;
        if (role === "customer") {
            const [rows] = await pool.execute("SELECT customer_id as id, name, email, phone, phone2, address, town, username, loyalty_coins FROM customers WHERE customer_id = ?", [id]);
            if (rows.length > 0) user = rows[0];
        } else if (role === "seller") {
            const [rows] = await pool.execute("SELECT seller_id as id, name, email, phone, phone2, shop_name, shop_details, shop_town, shop_address, username, profile_pic FROM sellers WHERE seller_id = ?", [id]);
            if (rows.length > 0) user = rows[0];
        }

        if (!user) return res.status(404).send("User not found");

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
};

/* =========================
   UPDATE PROFILE
========================= */
exports.updateProfile = async (req, res) => {
    try {
        const { role, id, name, email, phone, phone2, address, town, shop_name, shop_town, shop_address, shop_details, username } = req.body;
        if (!role || !id) return res.status(400).send("Role and ID required");

        // Validate username uniqueness if changing
        if (username) {
            const checkUserStr = username.trim().toLowerCase();
            let conflict = [];
            if (role === "customer") {
                [conflict] = await pool.execute("SELECT customer_id FROM customers WHERE username=? AND customer_id != ? LIMIT 1", [checkUserStr, id]);
            } else if (role === "seller") {
                [conflict] = await pool.execute("SELECT seller_id FROM sellers WHERE username=? AND seller_id != ? LIMIT 1", [checkUserStr, id]);
            }
            if (conflict.length > 0) return res.status(409).send("Username already taken");
        }

        // Validate email uniqueness if changing
        if (email) {
            const checkEmail = email.trim().toLowerCase();
            const [ec] = await pool.execute("SELECT customer_id FROM customers WHERE email=? AND customer_id != ? LIMIT 1", [checkEmail, role === 'customer' ? id : -1]);
            const [es] = await pool.execute("SELECT seller_id FROM sellers WHERE email=? AND seller_id != ? LIMIT 1", [checkEmail, role === 'seller' ? id : -1]);
            if (ec.length > 0 || es.length > 0) return res.status(409).send("Email already in use by another account.");
        }

        if (role === "customer") {
            await pool.execute(
                "UPDATE customers SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), phone2 = COALESCE(?, phone2), address = COALESCE(?, address), username = COALESCE(?, username), town = COALESCE(?, town) WHERE customer_id = ?",
                [name || null, email || null, phone || null, phone2 || null, address || null, username || null, town || null, id]
            );
            const [updated] = await pool.execute(
                "SELECT customer_id as id, name, email, phone, phone2, address, town, username, loyalty_coins FROM customers WHERE customer_id = ?",
                [id]
            );
            return res.status(200).json({ message: "Profile updated successfully", user: { ...updated[0], role: 'customer' } });
        } else if (role === "seller") {
            const profile_pic = req.file ? 'uploads/' + req.file.filename : null;

            // Update with profile_pic if provided
            if (profile_pic) {
                await pool.execute(
                    "UPDATE sellers SET name = COALESCE(?, name), phone = COALESCE(?, phone), phone2 = COALESCE(?, phone2), shop_name = COALESCE(?, shop_name), shop_town = COALESCE(?, shop_town), shop_address = COALESCE(?, shop_address), shop_details = COALESCE(?, shop_details), username = COALESCE(?, username), profile_pic = ? WHERE seller_id = ?",
                    [name || null, phone || null, phone2 || null, shop_name || null, shop_town || null, shop_address || null, shop_details || null, username || null, profile_pic, id]
                );
            } else {
                await pool.execute(
                    "UPDATE sellers SET name = COALESCE(?, name), phone = COALESCE(?, phone), phone2 = COALESCE(?, phone2), shop_name = COALESCE(?, shop_name), shop_town = COALESCE(?, shop_town), shop_address = COALESCE(?, shop_address), shop_details = COALESCE(?, shop_details), username = COALESCE(?, username) WHERE seller_id = ?",
                    [name || null, phone || null, phone2 || null, shop_name || null, shop_town || null, shop_address || null, shop_details || null, username || null, id]
                );
            }

            const [updatedRows] = await pool.execute(
                "SELECT seller_id as id, name, email, phone, phone2, shop_name, shop_town, shop_address, shop_details, username, profile_pic FROM sellers WHERE seller_id = ?",
                [id]
            );
            return res.status(200).json({ message: "Profile updated successfully", user: { ...updatedRows[0], role: 'seller' } });
        } else {
            return res.status(400).send("Invalid role");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
};

/* =========================
   CHANGE PASSWORD (LOGGED IN)
========================= */
exports.changePassword = async (req, res) => {
    try {
        const { role, id, oldPassword, newPassword } = req.body;
        if (!role || !id || !oldPassword || !newPassword) return res.status(400).send("Missing fields");

        let user = null;
        let table = "";
        let idCol = "";

        if (role === "customer") { table = "customers"; idCol = "customer_id"; }
        else if (role === "seller") { table = "sellers"; idCol = "seller_id"; }
        else if (role === "admin") { table = "admins"; idCol = "admin_id"; }
        else return res.status(400).send("Invalid role");

        const [rows] = await pool.execute(`SELECT password_hash FROM ${table} WHERE ${idCol} = ?`, [id]);
        if (rows.length === 0) return res.status(404).send("User not found");
        user = rows[0];

        const match = await verifyPassword(oldPassword, user.password_hash);
        if (!match) return res.status(400).send("password is wrong and try again");

        // Validate new password complexity
        if (newPassword.length < 6) return res.status(400).send("Password must be at least 6 characters long");
        if (!/[A-Z]/.test(newPassword)) return res.status(400).send("Password must contain at least one uppercase letter");
        if (!/[a-z]/.test(newPassword)) return res.status(400).send("Password must contain at least one lowercase letter");
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) return res.status(400).send("Password must contain at least one special character");

        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.execute(`UPDATE ${table} SET password_hash = ? WHERE ${idCol} = ?`, [newHash, id]);

        return res.json({ message: "Password changed successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server error");
    }
};

/* =========================
   GET CUSTOMER STATS FOR SELLER
========================= */
exports.getCustomerStats = async (req, res) => {
    try {
        const { customerId, sellerId } = req.params;

        // Fetch customer profile details
        const [customerRows] = await pool.execute(
            "SELECT name, email, phone, phone2, address, town FROM customers WHERE customer_id = ?",
            [customerId]
        );
        if (customerRows.length === 0) return res.status(404).json({ message: "Customer not found" });

        const customer = customerRows[0];
        let orderQuery = "SELECT COUNT(id) AS totalOrders FROM order_requests WHERE user_id = ?";
        let refundQuery = "SELECT COUNT(id) AS totalRefunds FROM refunds WHERE user_id = ?";
        let approvedRefundsQuery = `SELECT r.id, r.product_id, r.refund_amount, r.updated_at, p.name as product_name
                                    FROM refunds r
                                    LEFT JOIN products p ON r.product_id = p.id
                                    WHERE r.user_id = ? AND r.status = 'approved'
                                    ORDER BY r.updated_at DESC`;
        let params = [customerId];

        if (sellerId && sellerId !== 'all') {
            orderQuery += " AND seller_id = ?";
            refundQuery = `SELECT COUNT(r.id) AS totalRefunds 
                           FROM refunds r 
                           JOIN products p ON r.product_id = p.id 
                           WHERE r.user_id = ? AND p.seller_id = ?`;
            approvedRefundsQuery = `SELECT r.id, r.product_id, r.refund_amount, r.updated_at, p.name as product_name
                                    FROM refunds r
                                    JOIN products p ON r.product_id = p.id
                                    WHERE r.user_id = ? AND p.seller_id = ? AND r.status = 'approved'
                                    ORDER BY r.updated_at DESC`;
            params.push(sellerId);
        }

        const [orderRows] = await pool.execute(orderQuery, params);
        const [refundRows] = await pool.execute(refundQuery, params);
        const [approvedRefundsList] = await pool.execute(approvedRefundsQuery, params);

        res.status(200).json({
            ...customer,
            total_orders: orderRows[0].totalOrders || 0,
            total_refunds: refundRows[0].totalRefunds || 0,
            approved_refunds: approvedRefundsList
        });
    } catch (err) {
        console.error("Error fetching customer stats:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

/* =========================
   SELLER CERTIFICATES
========================= */

exports.getSellerCertificates = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const [rows] = await pool.execute("SELECT * FROM seller_certificates WHERE seller_id = ?", [sellerId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching certificates:", err);
        res.status(500).send("Server error");
    }
};

exports.uploadCertificate = async (req, res) => {
    try {
        const { sellerId } = req.body;
        if (!req.file) return res.status(400).send("No file uploaded");

        const certPath = 'uploads/' + req.file.filename;
        const [result] = await pool.execute(
            "INSERT INTO seller_certificates (seller_id, certificate) VALUES (?, ?)",
            [sellerId, certPath]
        );

        res.json({ id: result.insertId, certificate: certPath });
    } catch (err) {
        console.error("Error uploading certificate:", err);
        res.status(500).send("Server error");
    }
};

exports.deleteCertificate = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get current cert to delete file
        const [rows] = await pool.execute("SELECT certificate FROM seller_certificates WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).send("Certificate not found");

        const certPath = rows[0].certificate;
        const fullPath = path.join(__dirname, "../", certPath);

        // 2. Delete from DB
        await pool.execute("DELETE FROM seller_certificates WHERE id = ?", [id]);

        // 3. Delete file if exists
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }

        res.json({ message: "Certificate deleted" });
    } catch (err) {
        console.error("Error deleting certificate:", err);
        res.status(500).send("Server error");
    }
};
// Get all sellers (for Admin Analysis)
exports.adminGetAllSellers = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            "SELECT seller_id, name, username, shop_name, email, phone, phone2, shop_town, shop_address, profile_pic, created_at FROM sellers ORDER BY created_at DESC"
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching sellers for admin:", err);
        res.status(500).json({ message: "Server error" });
    }
};

/* =========================
   USER LOCATIONS
========================= */

exports.getUserLocations = async (req, res) => {
    try {
        const { role, userId } = req.params;
        const [rows] = await pool.execute(
            "SELECT * FROM user_locations WHERE user_id = ? AND user_role = ? ORDER BY created_at DESC",
            [userId, role]
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching locations:", err);
        res.status(500).json({ message: "Server error" });
    }
};

exports.addUserLocation = async (req, res) => {
    try {
        const { user_id, user_role, short_name, district, location_details } = req.body;
        if (!user_id || !user_role || !short_name || !district || !location_details) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const [result] = await pool.execute(
            "INSERT INTO user_locations (user_id, user_role, short_name, district, location_details, status) VALUES (?, ?, ?, ?, ?, 'pending')",
            [user_id, user_role, short_name, district, location_details]
        );
        res.status(201).json({ id: result.insertId, message: "Location added successfully and is pending approval" });
    } catch (err) {
        console.error("Error adding location:", err);
        res.status(500).json({ message: "Server error" });
    }
};

exports.deleteUserLocation = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute("DELETE FROM user_locations WHERE id = ?", [id]);
        res.status(200).json({ message: "Location deleted successfully" });
    } catch (err) {
        console.error("Error deleting location:", err);
        res.status(500).json({ message: "Server error" });
    }
};

/* =========================
   ADMIN: LOCATION MANAGEMENT
========================= */

exports.adminGetLocationRequests = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            "SELECT ul.*, COALESCE(c.name, s.name) as user_name FROM user_locations ul LEFT JOIN customers c ON ul.user_id = c.customer_id AND ul.user_role = 'customer' LEFT JOIN sellers s ON ul.user_id = s.seller_id AND ul.user_role = 'seller' ORDER BY ul.created_at DESC"
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Error fetching all locations:", err);
        res.status(500).json({ message: "Server error" });
    }
};

exports.adminUpdateLocationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'approved' or 'rejected'
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ message: "Invalid status value" });
        }

        await pool.execute("UPDATE user_locations SET status = ? WHERE id = ?", [status, id]);
        res.status(200).json({ message: "Location status updated successfully" });
    } catch (err) {
        console.error("Error updating location status:", err);
        res.status(500).json({ message: "Server error" });
    }
};

