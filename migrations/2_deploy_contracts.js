/* global artifacts */

'use strict';

const Token = artifacts.require('DFIToken');

module.exports = function (deployer) {
    deployer.deploy(Token);
};
