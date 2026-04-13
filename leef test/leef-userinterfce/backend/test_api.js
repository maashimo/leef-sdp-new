const http = require('http');

http.get('http://localhost:5000/api/orders/customer/1', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        try {
            console.log(res.statusCode);
            console.log(rawData.substring(0, 500));
        } catch (e) {
            console.error(e.message);
        }
    });
}).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
});
