/**
 * Leef Platform - Global API Configuration
 * This file centralizes the API endpoint for all frontend pages.
 */
(function() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Default to localhost for development
    let apiBase = 'http://localhost:5000';
    
    if (!isLocal) {
        // --- PRODUCTION CONFIGURATION ---
        // For production, you can either:
        // 1. Manually set your backend URL below
        // 2. Use a relative path if your backend is on the same domain
        // 3. Configure Vercel to proxy /api requests (recommended)
        
        // apiBase = 'https://leef-api.up.railway.app'; // <--- UPDATE THIS AFTER DEPLOYING YOUR BACKEND
        let apiBase = 'http://142.93.208.192:5000';
    }
    
    window.API_BASE_URL = apiBase;
    console.log(`%c[Leef Config] Using API: ${apiBase}`, "color: #4ade80; font-weight: bold;");
})();
