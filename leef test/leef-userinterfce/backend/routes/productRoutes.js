const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "../uploads"); // Go up one level to backend root's uploads
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
        cb(null, safe);
    },
});
const upload = multer({ storage });

// Route to add product (Seller) - supports image upload
router.post("/add", upload.array('images', 5), productController.addProduct);

// Route for admin to view pending products
router.get("/admin/pending", productController.getPendingProducts);

// Route for admin to approve product - supports image upload
router.post("/admin/approve", upload.array('images', 5), productController.approveProduct);

// Route for admin to reject product
router.post("/admin/reject", productController.rejectProduct);

// Admin advanced image management
router.put("/admin/update-images", productController.updateProductImages);

// Route for seller to request update
router.post("/update-request", productController.requestUpdate);

// Route to get seller's products (internal/seller dashboard)
router.get("/seller/:sellerId", productController.getSellerProducts);

// Route to get seller's products (public/customer discovery)
router.get("/seller/:sellerId/public", productController.getSellerPublicProducts);

// Direct stock update (Bypasses admin approval)
router.post("/direct-stock-update", productController.directStockUpdate);

// Public Marketplace Route
router.get("/marketplace", productController.getMarketplaceProducts);

// Seller delete
router.delete("/seller/delete/:id", productController.deleteProductBySeller);

// Admin notifications
router.get("/admin/notifications", productController.getNotifications);

// Chatbot Search (Public)
router.get("/chatbot-search", productController.searchProductsForChatbot);

// Get Single Product
router.get("/:id", productController.getProductById);



// Reserve Stock
router.post("/:id/reserve-stock", productController.reserveStock);

// Release Stock
router.post("/:id/release-stock", productController.releaseStock);

// --- Q&A Routes ---
// Public: Get answered questions for a product
router.get("/:productId/questions", productController.getProductQuestions);
// Customer: Ask a question
router.post("/:productId/questions", productController.askQuestion);
// Admin: Get all questions
router.get("/admin/questions/all", productController.getAdminQuestions);
// Admin: Reply to a question
router.put("/admin/questions/:id/reply", productController.replyToQuestion);

module.exports = router;
