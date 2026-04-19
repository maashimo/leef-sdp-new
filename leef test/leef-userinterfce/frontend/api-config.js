/**
 * API Configuration for Leef Platform
 * -----------------------------------
 * This file defines the backend endpoint used by all frontend components.
 * To point to a different server, simply update the 'API_BASE_URL' below.
 */

const BACKEND_ENVIRONMENTS = {
    local: "http://localhost:5000",
    network: "http://192.168.1.9:5000",
    production: "https://142.93.208.192.sslip.io"
};

// Change this line to switch between environments
const ACTIVE_URL = BACKEND_ENVIRONMENTS.network;

// Set as global for use in all scripts
window.API_BASE_URL = ACTIVE_URL;

// Optional: environment check log 
if (window.location.hostname === 'localhost') {
    console.log(`[Config] Using ${ACTIVE_URL === BACKEND_ENVIRONMENTS.local ? 'Local' : 'Remote'} API: ${ACTIVE_URL}`);
}
