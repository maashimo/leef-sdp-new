const mysql = require('mysql2/promise');

async function testUpdate() {
    const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'leef' });
    try {
        const id = 8; // Change as needed
        const refundAmount = 50;
        const responsibleParty = 'delivery';
        const adminNote = 'test update';
        const sellerId = null;

        console.log('Fetching refund...');
        const [refundRows] = await pool.execute(`
        SELECT r.*, COALESCE(p.price, o.unit_price) as original_unit_price, o.total_qty
        FROM refunds r
        LEFT JOIN products p ON r.product_id = p.id
        LEFT JOIN order_requests o ON r.order_id = o.id
        WHERE r.id = ?
    `, [id]);

        if (refundRows.length === 0) {
            console.log('Refund not found.');
            process.exit(1);
        }

        const refund = refundRows[0];
        const originalTotal = (parseFloat(refund.original_unit_price) * (refund.total_qty || 1));
        console.log('Original unit price:', refund.original_unit_price, 'Total qty:', refund.total_qty, 'Calculated total:', originalTotal);

        let newStatus;
        if (parseFloat(refundAmount) < originalTotal) {
            newStatus = 'pending_customer_consent';
            console.log('Setting status to pending_customer_consent');
        } else {
            newStatus = responsibleParty === 'seller' ? 'pending_seller' : 'approved';
            console.log('Setting status to', newStatus);
        }

        console.log('Executing UPDATE...');
        await pool.execute(
            "UPDATE refunds SET status = ?, admin_note = ?, responsible_party = ?, responsible_seller_id = ?, refund_amount = ?, updated_at = NOW() WHERE id = ?",
            [newStatus, adminNote || null, responsibleParty || null, sellerId || null, refundAmount || 0, id]
        );
        console.log('UPDATE successful!');

    } catch (err) {
        console.error('SQL Error Occurred:');
        console.error(err);
    }
    process.exit();
}

testUpdate();
