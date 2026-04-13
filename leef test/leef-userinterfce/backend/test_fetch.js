const fs = require('fs');
fetch('http://localhost:5000/api/orders/customer/1')
  .then(r => r.text())
  .then(t => { fs.writeFileSync('test_ok.txt', t.substring(0, 100)); console.log('ok'); })
  .catch(e => { fs.writeFileSync('test_ok.txt', e.message); console.log('err'); });
