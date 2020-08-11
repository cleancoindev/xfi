/* global artifacts */

'use strict';

const XfiToken = artifacts.require('XFIToken');

module.exports = async function deploy(deployer) {
    if (!process.env.TOKEN) {
        return
    }

    const CREATOR_ADDRESS = process.env.CREATOR_ADDRESS;

    if (!CREATOR_ADDRESS) {
        throw 'CREATOR_ADDRESS is missing';
    }

    // Deploy the XFI Token.
    await deployer.deploy(XfiToken);
};
