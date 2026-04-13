const http = require('http');

const data = JSON.stringify({
    adminNote: "Testing update over http",
    responsibleParty: "delivery",
    sellerId: null,
    refundAmount: 50
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/refunds/8/approve',
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Status code:', res.statusCode, 'Body:', body));
});

req.on('error', error => console.error(error));

req.write(data);
req.end();
