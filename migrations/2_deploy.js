/* global artifacts */

'use strict';

const DfiToken = artifacts.require('DFIToken');
const Exchange = artifacts.require('Exchange');

module.exports = async function (deployer) {
    const WINGS_TOKEN_ADDRESS       = process.env.WINGS_TOKEN_ADDRESS;
    const UNISWAP_V2_ROUTER_ADDRESS = process.env.UNISWAP_V2_ROUTER_ADDRESS;

    if (!WINGS_TOKEN_ADDRESS) {
        throw 'WINGS_TOKEN_ADDRESS is missing';
    }

    if (!UNISWAP_V2_ROUTER_ADDRESS) {
        throw 'UNISWAP_V2_ROUTER_ADDRESS is missing';
    }

    deployer.deploy(DfiToken)
        .then(() => {
            return deployer.deploy(Exchange, WINGS_TOKEN_ADDRESS, DfiToken.address, UNISWAP_V2_ROUTER_ADDRESS);
        });
};
