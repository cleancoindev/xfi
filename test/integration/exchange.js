/* global Web3 */

/**
 * Integration test which covers functionality of Ethereum DFI Exchange.
 *
 * @module test/integration/exchange
 */

'use strict';

const TestRpc = require('test/helpers/test-rpc');

const TEST_RPC_PORT = +process.env.TEST_RPC_PORT || 9545;

const web3 = new Web3(`http://localhost:${TEST_RPC_PORT}`);

describe('Ethereum DFI Exchange', () => {
    const creator = web3.eth.accounts.create();

    const testRpc = TestRpc({
        accounts: [
            {
                balance: '1000000000000000000000000', // 1 million ETH
                secretKey: creator.privateKey
            }
        ],
        locked: false
    });

    before('launch test RPC', async () => {
        await testRpc.start(TEST_RPC_PORT);
    });

    after('stop test RPC', () => {
        testRpc.stop();
    });
});
