/**
 * Simple wrapper ontop of Ganache Test RPC.
 *
 * @module test/lib/test-rpc
 */

'use strict';

const ganache = require('ganache-cli');

module.exports = TestRpc;

/**
 * Test RPC.
 *
 * @class
 */
function TestRpc(opts) {
    if (!new.target) {
        return new TestRpc(opts);
    }

    this.server = ganache.server(opts);

    this.start = function start(port) {
        return Promise.resolve(this.server.listen(port));
    };

    this.stop = function stop() {
        this.server.close();
    };
}
