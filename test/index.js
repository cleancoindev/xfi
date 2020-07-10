/**
 * Test entrypoint.
 *
 * Here we import common libraries and provide global access to them.
 * Tests are grouped by type (e.g. unit, integration) and are launched
 * consecutively.
 *
 * @module test
 */

'use strict';

require('chai').should();

const contract = require('@truffle/contract');
const Web3     = require('web3');

global.contract = contract;
global.Web3     = Web3;

describe('Integration', () => {
    require('test/integration/dfi-token');
});
