SELECT seller_id,
    name,
    email
FROM sellers;
SELECT id,
    order_id,
    status,
    responsible_party,
    responsible_seller_id
FROM refunds
WHERE status = 'approved'
    AND responsible_party = 'seller';