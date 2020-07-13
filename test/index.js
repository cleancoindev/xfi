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
const helpers  = require('test/lib/helpers');
const TestRpc  = require('test/lib/test-rpc');

global.contract = contract;
global.Web3     = Web3;
global.helpers  = helpers;
global.TestRpc  = TestRpc;

describe('Integration', () => {
    require('test/integration/dfi-token');
    require('test/integration/exchange');
});
