/**
 * Leef Platform - Global API Configuration
 * ==========================================
 * Change the BACKEND_URL below to point to your hosted backend.
 * All frontend pages will use this URL automatically.
 */
(function() {
    // ┌─────────────────────────────────────────────────────┐
    // │  SET YOUR BACKEND URL HERE                          │
    // │  Change this to your hosted backend URL             │
    // │  e.g. 'https://leef-api.example.com'               │
    // │       'http://142.93.208.192'                       │
    // │       'http://142.93.208.192:5000'                  │
    // └─────────────────────────────────────────────────────┘
    // const BACKEND_URL = "https://142.93.208.192.sslip.io";
    const BACKEND_URL = "http://192.168.1.9:5000";

    window.API_BASE_URL = BACKEND_URL;
    console.log(`%c[Leef Config] Using API: ${BACKEND_URL}`, "color: #4ade80; font-weight: bold;");
})();
