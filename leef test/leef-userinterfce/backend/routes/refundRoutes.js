const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
    submitRefund,
    getCustomerRefunds,
    getAllRefundsAdmin,
    approveRefund,
    rejectRefund,
    sendToSeller,
    finalAdminDecision,
    getSellerRefunds,
    markRefundAsPaid,
    sellerApproveRefund,
    sellerUpdateNote,
    getRefundMessages,
    customerAcceptPartial,
    adminUpdateNote
} = require("../controllers/refundController");

// Multer config — store in uploads/refunds/ (allow up to 3 images)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "../uploads/refunds");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB per file

// Wrapper to handle Multer errors
const uploadMiddleware = (req, res, next) => {
    const uploadArray = upload.array("images", 3);
    uploadArray(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: "One or more files are too large. Maximum size is 10MB per file." });
            }
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ message: `Server error during upload: ${err.message}` });
        }
        next();
    });
};

router.post("/", uploadMiddleware, submitRefund); 
router.get("/customer/:userId", getCustomerRefunds);
router.get("/admin", getAllRefundsAdmin);
router.put("/:id/approve", approveRefund); 
router.put("/:id/reject", rejectRefund);
router.put("/:id/send-to-seller", sendToSeller);
router.put("/:id/final-decision", finalAdminDecision);
router.get("/seller/:sellerId", getSellerRefunds);
router.put("/:id/pay", markRefundAsPaid);
router.put("/:id/seller-respond", sellerApproveRefund);
router.put("/:id/seller-note", sellerUpdateNote);
router.put("/:id/admin-note", adminUpdateNote);
router.get("/:id/messages", getRefundMessages);
router.put("/:id/customer-accept", customerAcceptPartial);

module.exports = router;
