/* global artifacts */

/**
 * Deploy Exchange instance.
 *
 * @module migrations/2_deploy_exchange
 */

'use strict';

const XfiToken = artifacts.require('XFIToken');
const Exchange = artifacts.require('Exchange');

module.exports = async function deploy(deployer) {
    if (!process.env.EXCHANGE) {
        return;
    }

    const CREATOR_ADDRESS           = process.env.CREATOR_ADDRESS;
    const WINGS_TOKEN_ADDRESS       = process.env.WINGS_TOKEN_ADDRESS;
    const XFI_TOKEN_ADDRESS         = process.env.XFI_TOKEN_ADDRESS;

    if (!CREATOR_ADDRESS) {
        throw 'CREATOR_ADDRESS is missing';
    }

    if (!WINGS_TOKEN_ADDRESS) {
        throw 'WINGS_TOKEN_ADDRESS is missing';
    }

    if (!XFI_TOKEN_ADDRESS) {
        throw 'XFI_TOKEN_ADDRESS is missing';
    }

    // Deploy the Exchange.
    await deployer.deploy(Exchange, WINGS_TOKEN_ADDRESS, XFI_TOKEN_ADDRESS, {
        from: CREATOR_ADDRESS
    });

    // Grant the Exchange role of minter.
    const xfiToken   = await XfiToken.at(XFI_TOKEN_ADDRESS);
    const minterRole = await xfiToken.MINTER_ROLE.call();

    await xfiToken.grantRole(minterRole, Exchange.address, {from: CREATOR_ADDRESS});
};
