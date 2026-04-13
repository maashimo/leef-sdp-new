const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

// Request approval (Customer)
router.post("/request-approval", orderController.createOrderRequest);

// Get pending requests (Admin)
router.get("/admin/pending", orderController.getPendingRequests);

// Get all requests (Admin)
router.get("/admin/all", orderController.getAllRequests);

// Get all consolidated orders (Admin Ledger)
router.get("/admin/ledger", orderController.getAdminAllOrders);

// Get today's consolidated orders (Admin)
router.get("/admin/today", orderController.getAdminTodayOrders);

// Get shops with active orders for prep (Admin)
router.get("/admin/prep-shops", orderController.getAdminPrepShops);

// Get prep summary for all sellers (Admin)
router.get("/admin/prep-summary", orderController.getAdminAllPrepSummary);

// Accept request (Admin)
router.put("/admin/:id/accept", orderController.acceptOrderRequest);

// Reject request (Admin)
router.put("/admin/:id/reject", orderController.rejectOrderRequest);

// Update locations (Admin)
router.patch("/admin/:id/locations", orderController.updateOrderLocations);

// Get consolidated recent orders for dashboard (Customer)
router.get("/customer/:userId", orderController.getConsolidatedOrders);

// Consolidated flows
router.post("/direct", orderController.createDirectOrder);
router.patch("/item/:orderId/payment", orderController.updatePaymentStatus);

// Get report for seller based on date
router.get("/seller-report", orderController.getSellerReport);

// Seller Dashboard: Get orders for a specific seller
router.get("/seller/:sellerId", orderController.getSellerOrders);

// Seller Dashboard:// Get aggregated prep summary for a specific date (Seller)
router.get("/seller/prep-summary/:sellerId", orderController.getSellerPrepSummary);

// Update order status (Seller)
router.patch("/:orderId/status", orderController.updateStatus);

// Product transactions (Admin)
router.get("/transactions/:productId", orderController.getProductTransactions);

// Admin: Seller Revenue Analysis
router.get("/admin/revenue/:sellerId", orderController.getSellerRevenueByMonth);

// Seller: My Monthly Revenue Stats
router.get("/seller/revenue-stats/:sellerId", orderController.getSellerRevenueByMonth);

// Seller stats (Most sold, Top rated)
router.get("/seller/stats/:sellerId", orderController.getSellerProductStats);

// Admin dashboard stats
router.get("/admin/dashboard-stats", orderController.getAdminStats);

module.exports = router;
