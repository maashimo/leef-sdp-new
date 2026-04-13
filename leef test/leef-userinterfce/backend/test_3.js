const mysql = require('mysql2/promise');
const { dbConfig } = require('./backend/config/db');

(async () => {
  const conn = await mysql.createConnection(dbConfig);
  try {
    const [c] = await conn.execute("SELECT * FROM customers WHERE email LIKE '%3@gmail%' OR name LIKE '%3@gmail%' OR username LIKE '%3@gmail%'");
    console.log("CUSTOMERS:", c);
    
    const [o] = await conn.execute("SELECT * FROM orders WHERE user_id = 3 OR user_id = (SELECT customer_id FROM customers WHERE email = '3@gmail.com' LIMIT 1)");
    console.log("ORDERS:", o.length);
  } catch(e) { console.error(e); }
  await conn.end();
})();
