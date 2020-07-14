/* global artifacts */

'use strict';

const DfiToken = artifacts.require('DFIToken');
const Exchange = artifacts.require('Exchange');

module.exports = async function deploy(deployer) {
    const CREATOR_ADDRESS           = process.env.CREATOR_ADDRESS;
    const WINGS_TOKEN_ADDRESS       = process.env.WINGS_TOKEN_ADDRESS;
    const UNISWAP_V2_ROUTER_ADDRESS = process.env.UNISWAP_V2_ROUTER_ADDRESS;

    if (!CREATOR_ADDRESS) {
        throw 'CREATOR_ADDRESS is missing';
    }

    if (!WINGS_TOKEN_ADDRESS) {
        throw 'WINGS_TOKEN_ADDRESS is missing';
    }

    if (!UNISWAP_V2_ROUTER_ADDRESS) {
        throw 'UNISWAP_V2_ROUTER_ADDRESS is missing';
    }

    // Deploy the DFI Token.
    await deployer.deploy(DfiToken);

    // Deploy the Exchange.
    await deployer.deploy(Exchange, WINGS_TOKEN_ADDRESS, DfiToken.address, UNISWAP_V2_ROUTER_ADDRESS);

    // Grant the Exchange role of minter.
    const dfiToken   = await DfiToken.at(DfiToken.address);
    const minterRole = await dfiToken.MINTER_ROLE.call();

    await dfiToken.grantRole(minterRole, Exchange.address, {from: CREATOR_ADDRESS});
};
