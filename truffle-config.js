'use strict';

require('dotenv').config();

const {getProvider} = require('provider');

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
                return getProvider();
            },
            network_id: 3,
            gas: 8000000,
            skipDryRun: true
        },
        mainnet: {
            provider: () => {
                return getProvider();
            },
            network_id: 1,
            gas: 2000000,
            gasPrice: 112000000000,
            skipDryRun: true
        },
    }
};
