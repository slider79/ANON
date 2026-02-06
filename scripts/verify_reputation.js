
const http = require('http');

// Use a known user ID from the previous debug output
// id: "79cdeda847a5376f635518e2a50a738187102970da00fc0e41d7727a5c698f04"
const userId = "79cdeda847a5376f635518e2a50a738187102970da00fc0e41d7727a5c698f04";

const options = {
    hostname: 'localhost',
    port: 5003,
    path: `/api/users/${userId}`,
    method: 'GET',
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('BODY: ' + data);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
