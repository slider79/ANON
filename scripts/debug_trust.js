
const fs = require('fs');
const dagStore = require('../models/dagStore');
const userStore = require('../models/userStore');
const trustService = require('../services/trustService');

const log = [];
function print(msg) {
    console.log(msg);
    log.push(msg);
}

print('--- USERS ---');
const users = userStore.getAllUsers();
print(JSON.stringify(users.map(u => ({ id: u.id, rep: u.reputation })), null, 2));

print('\n--- TRUST DEBUG ---');
try {
    const debug = trustService.getDebugTrust();

    if (debug.matrix.length === 0) {
        print("Matrix is empty (no users or effective trust data).");
    } else {
        debug.matrix.forEach(row => {
            print(`From ${row.from.substring(0, 8)}...:`);
            row.to.forEach(to => {
                if (to.c > 0.01) {
                    print(`  -> ${to.userId.substring(0, 8)}...: C=${to.c.toFixed(4)} (Agree: ${to.agree}/${to.total})`);
                }
            });
        });
    }
} catch (e) {
    print("Error running trust debug: " + e.message);
}

fs.writeFileSync('debug_output.txt', log.join('\n'));
