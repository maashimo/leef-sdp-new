const { pool } = require('./config/db');

(async () => {
    try {
        const [rows] = await pool.execute(
            `SELECT seller_id, status, COUNT(*) as count 
             FROM orders 
             GROUP BY seller_id, status`
        );
        console.log("Order Stats:", rows);
        
        const [revenue] = await pool.execute(
            `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(total_price) as revenue 
             FROM orders 
             WHERE status = 'completed' 
             GROUP BY month`
        );
        console.log("Completed Revenue:", revenue);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
