'use strict';

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
        }
    }
};
