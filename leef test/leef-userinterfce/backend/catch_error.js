const http = require('http');
const fs = require('fs');

function test(url) {
    http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
             console.log(url, res.statusCode, data.substring(0, 500));
             fs.appendFileSync('catch_out.txt', url + " " + res.statusCode + " " + data.substring(0, 500) + "\n");
        });
    }).on('error', e => {
         fs.appendFileSync('catch_out.txt', url + " " + e.message + "\n");
    });
}
fs.writeFileSync('catch_out.txt', '');
test('http://localhost:5000/api/orders/admin/all');
test('http://localhost:5000/api/orders/customer/1');
test('http://localhost:5000/api/orders/admin/ledger');
test('http://localhost:5000/api/orders/admin/stats');
