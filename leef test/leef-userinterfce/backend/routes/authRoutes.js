const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const upload = require("../middleware/upload");

router.post("/register", upload.fields([{ name: 'certificates', maxCount: 1 }, { name: 'profile_pic', maxCount: 1 }]), authController.register);
router.post("/verify-email", authController.verifyEmail);
router.post("/resend-otp", authController.resendOTP);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/change-password", authController.changePassword);

// Profile
router.get("/profile/:role/:id", authController.getProfile);
router.put("/profile/update", upload.single("profile_pic"), authController.updateProfile);

// Customer Stats for Seller Dashboard
router.get("/customer-stats/:customerId/:sellerId", authController.getCustomerStats);

// Seller Certificates
router.get("/certificates/:sellerId", authController.getSellerCertificates);
router.post("/certificates/upload", upload.single("certificate"), authController.uploadCertificate);
router.delete("/certificates/:id", authController.deleteCertificate);

// User Locations
router.get("/locations/:role/:userId", authController.getUserLocations);
router.post("/locations", authController.addUserLocation);
router.delete("/locations/:id", authController.deleteUserLocation);

// Admin: Seller Management
router.get("/admin/sellers", authController.adminGetAllSellers);

// Admin: Location Management
router.get("/admin/locations", authController.adminGetLocationRequests);
router.put("/admin/locations/:id/status", authController.adminUpdateLocationStatus);

module.exports = router;
