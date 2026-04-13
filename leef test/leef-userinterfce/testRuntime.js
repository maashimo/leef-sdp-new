const htmlStrOutput = [];
const orders = [
    {
        id: 1, status: 'approved', updated_at: '2026-02-24T12:00:00Z', created_at: '2026-02-24T12:00:00Z',
        admin_note: 'ok', product_name: 'test', price: 'Rs. 90 per 300g', total_qty: 2, product_id: 5
    },
    {
        id: 2, status: 'rejected', updated_at: '2026-02-24T12:00:00Z', created_at: '2026-02-24T12:00:00Z',
        rejection_reason: 'no', product_name: 'test2', price: 'Rs. 90 per 300g', total_qty: null, product_id: 6
    },
    {
        id: 3, status: 'approved', updated_at: null, created_at: null,
        product_name: 'test3', price: 90, total_qty: 2, product_id: 7
    }
];

try {
    let htmlStr = "";
    let renderedCount = 0;

    orders.forEach(order => {
        const orderDate = new Date(order.updated_at || order.created_at);
        const now = new Date();
        const hoursDiff = (now - orderDate) / (1000 * 60 * 60);

        // Show Approved/Rejected orders that are less than 30 days old (720 hours)
        if (order.status !== "pending" && hoursDiff <= 720) {
            const isApproved = order.status === "approved";
            const statusColor = isApproved ? "#16a34a" : "#dc2626";
            const adminNote = isApproved ? (order.admin_note ? `Note: ${order.admin_note}` : "") : `Reason: ${order.rejection_reason || 'N/A'}`;

            const actionHtml = isApproved
                ? `<a href="cart.html" class="link" style="background:#16a34a; color:#fff; padding:0.4em 1em; border-radius:0.5em; font-weight:600; text-decoration:none;">Add to Cart</a>`
                : `<span style="color:${statusColor}; font-weight:bold;">Rejected</span>`;

            // Reorder Button Logic
            const reorderHtml = isApproved
                ? `<button class="btn" style="background:#fbbf24; color:#000; padding:0.4em 1em; border-radius:0.5em; font-weight:600; font-size: 0.85rem; border:none; cursor:pointer;" onclick="localStorage.setItem('redirectAfterLogin', 'product-details.html?id=${order.product_id || ''}'); window.location.href='product-details.html?id=${order.product_id || ''}'"><i class="fas fa-redo-alt" style="margin-right: 5px;"></i> Reorder</button>`
                : `<span style="color:#666; font-size: 0.85rem;">Unavailable</span>`;

            // Calculate Total Price safely
            let totalPriceDisplay = "N/A";
            if (order.price && order.total_qty) {
                // Price could be a number or a string like "90 per 300g"
                let basePrice = 0;
                if (typeof order.price === 'string') {
                    const priceMatch = order.price.match(/[\d.]+/);
                    if (priceMatch) basePrice = parseFloat(priceMatch[0]);
                } else {
                    basePrice = parseFloat(order.price);
                }

                if (basePrice && !isNaN(basePrice)) {
                    const total = basePrice * parseFloat(order.total_qty);
                    totalPriceDisplay = `Rs. ${total.toFixed(2)}`;
                }
            }

            htmlStr += `
                <tr>
                    <td>#REQ-${order.id}</td>
                    <td>
                        ${order.product_name || "Unknown Product"}<br>
                        <small style="color:#666">${adminNote}</small>
                    </td>
                    <td>${orderDate.toLocaleDateString()}</td>
                    <td>${totalPriceDisplay}</td>
                    <td>
                        ${actionHtml}
                    </td>
                    <td>
                        ${reorderHtml}
                    </td>
                </tr>
            `;
            renderedCount++;
        }
    });
    console.log("Success! Rendered", renderedCount);
} catch (e) {
    console.error("Runtime Runtime Error:", e);
}
