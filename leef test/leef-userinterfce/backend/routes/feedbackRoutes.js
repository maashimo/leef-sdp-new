const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
    submitFeedback,
    getCustomerFeedback,
    getProductFeedback,
    getAllFeedbackAdmin,
    deleteFeedback,
    getOrderFeedback,
    getSellerFeedback
} = require("../controllers/feedbackController");

// Multer config — store in uploads/feedback/
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "../uploads/feedback");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Wrapper to handle Multer errors
const uploadMiddleware = (req, res, next) => {
    const uploadSingle = upload.single("image");
    uploadSingle(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: "Image is too large. Maximum size is 10MB." });
            }
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ message: `Server error during upload: ${err.message}` });
        }
        next();
    });
};

router.post("/", uploadMiddleware, submitFeedback);
router.get("/customer/:userId", getCustomerFeedback);
router.get("/product/:productId", getProductFeedback);
router.get("/order/:orderId", getOrderFeedback);
router.get("/seller/:sellerId", getSellerFeedback);
router.get("/admin", getAllFeedbackAdmin);
router.delete("/:id", deleteFeedback);

module.exports = router;
