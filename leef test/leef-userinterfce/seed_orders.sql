-- ====================================================
-- Run this script in your MySQL client / phpMyAdmin
-- It will insert 4 approved test orders for:
--   madhushipanchali03@gmail.com
-- 
-- Step 1: Find the customer ID
SELECT customer_id
FROM customers
WHERE email = 'madhushipanchali03@gmail.com';
-- (Note the customer_id from the result above, e.g. 5)
-- Step 2: Find available product IDs
SELECT id,
    name,
    seller_id
FROM products
LIMIT 5;
-- (Note down a few product IDs and their seller_ids)
-- Step 3: Insert approved orders
-- Replace @CUSTOMER_ID, @PRODUCT_ID_1, @SELLER_ID_1 etc. with the values from above
SET @CID = (
        SELECT customer_id
        FROM customers
        WHERE email = 'madhushipanchali03@gmail.com'
        LIMIT 1
    );
-- Get first 4 products
SET @P1 = (
        SELECT id
        FROM products
        LIMIT 1 OFFSET 0
    );
SET @P2 = (
        SELECT id
        FROM products
        LIMIT 1 OFFSET 1
    );
SET @P3 = (
        SELECT id
        FROM products
        LIMIT 1 OFFSET 2
    );
SET @P4 = (
        SELECT id
        FROM products
        LIMIT 1 OFFSET 3
    );
SET @S1 = (
        SELECT seller_id
        FROM products
        LIMIT 1 OFFSET 0
    );
SET @S2 = (
        SELECT seller_id
        FROM products
        LIMIT 1 OFFSET 1
    );
SET @S3 = (
        SELECT seller_id
        FROM products
        LIMIT 1 OFFSET 2
    );
SET @S4 = (
        SELECT seller_id
        FROM products
        LIMIT 1 OFFSET 3
    );
-- Insert 4 completed/approved orders
INSERT INTO order_requests (
        user_id,
        product_id,
        seller_id,
        total_qty,
        locations,
        status,
        admin_note,
        created_at,
        updated_at
    )
VALUES (
        @CID,
        @P1,
        COALESCE(@S1, 1),
        3,
        '[]',
        'approved',
        'Fresh and well packed — delivered on time',
        DATE_SUB(NOW(), INTERVAL 2 DAY),
        DATE_SUB(NOW(), INTERVAL 2 DAY)
    ),
    (
        @CID,
        @P2,
        COALESCE(@S2, 1),
        5,
        '[]',
        'approved',
        'Good quality produce',
        DATE_SUB(NOW(), INTERVAL 5 DAY),
        DATE_SUB(NOW(), INTERVAL 5 DAY)
    ),
    (
        @CID,
        @P3,
        COALESCE(@S3, 1),
        2,
        '[]',
        'approved',
        'Order fulfilled as requested',
        DATE_SUB(NOW(), INTERVAL 8 DAY),
        DATE_SUB(NOW(), INTERVAL 8 DAY)
    ),
    (
        @CID,
        @P4,
        COALESCE(@S4, 1),
        4,
        '[]',
        'approved',
        'Excellent product — delivered promptly',
        DATE_SUB(NOW(), INTERVAL 12 DAY),
        DATE_SUB(NOW(), INTERVAL 12 DAY)
    );
-- Verify
SELECT r.id,
    r.status,
    r.total_qty,
    p.name as product,
    r.created_at
FROM order_requests r
    JOIN products p ON r.product_id = p.id
WHERE r.user_id = @CID
ORDER BY r.created_at DESC;