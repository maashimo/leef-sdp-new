const http = require('http');

function test(url) {
    http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => console.log(url, res.statusCode, data.substring(0, 500)));
    }).on('error', e => console.error(url, e));
}

test('http://localhost:5000/api/orders/admin/all');
test('http://localhost:5000/api/orders/customer/1');
test('http://localhost:5000/api/orders/admin/ledger');
