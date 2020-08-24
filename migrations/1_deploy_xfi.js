/* global artifacts */

/**
 * Deploy XFI Token instance.
 *
 * @module migrations/1_deploy_xfi
 */


'use strict';

const XfiToken = artifacts.require('XFIToken');

module.exports = async function deploy(deployer) {
    if (!process.env.XFI) {
        return;
    }

    const CREATOR_ADDRESS = process.env.CREATOR_ADDRESS;
    const START_DATE      = process.env.START_DATE;

    if (!CREATOR_ADDRESS) {
        throw 'CREATOR_ADDRESS is missing';
    }

    if (!START_DATE) {
        throw 'START_DATE is missing';
    }

    // Deploy the XFI Token.
    await deployer.deploy(XfiToken, START_DATE, {from: CREATOR_ADDRESS});
};
