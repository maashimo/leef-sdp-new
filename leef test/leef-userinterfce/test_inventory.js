const axios = require('axios');

async function testInventory() {
    try {
        console.log("Adding 1kg to reserve stock for product 55 (Carrots)...");
        const res = await axios.post('http://localhost:5000/api/products/55/reserve-stock', { qty: 1 });
        console.log("Reserve Response:", res.data);

        console.log("Releasing 1kg for product 55...");
        const res2 = await axios.post('http://localhost:5000/api/products/55/release-stock', { qty: 1 });
        console.log("Release Response:", res2.data);
    } catch (err) {
        console.error("Test failed:", err.response ? err.response.data : err.message);
    }
}

testInventory();
