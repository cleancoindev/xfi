'use strict';

require('dotenv').config();

const { getHDProvider } = require('./provider.js');

/**
 * Truffle configuration object.
 *
 * @see http://truffleframework.com/docs/advanced/configuration
 * @return {Object}
 */
module.exports = {
    compilers: {
        solc: {
            version: '0.6.11'
        },
    },
    networks: {
        development: {
            host: '127.0.0.1',
            port: 9545,
            network_id: '*'
        },
        ropsten: {
            provider: () => {
                return getHDProvider();
            },
            network_id: 3,
            gas: 8000000,
            skipDryRun: true
        },
        mainnet: {
            provider: () => {
                return getHDProvider();
            },
            network_id: 1,
            gas: 2000000,
            gasPrice: 112000000000,
            skipDryRun: true
        },
    }
};
