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

const TEST_RPC_PORT     = +process.env.TEST_RPC_PORT || 9545;
const WEB3_PROVIDER_URL = `http://localhost:${TEST_RPC_PORT}`;

const url      = require('url');
const prom     = require('util').promisify;
const jayson   = require('jayson');
const contract = require('@truffle/contract');
const Web3     = require('web3');
const helpers  = require('test/lib/helpers');
const TestRpc  = require('test/lib/test-rpc');
const rpc      = require('test/lib/rpc');

const method  = (url.parse(WEB3_PROVIDER_URL).protocol === 'http:') && 'http' || 'https';
const client  = jayson.client[method](WEB3_PROVIDER_URL);
const request = prom(client.request).bind(client);

global.contract          = contract;
global.Web3              = Web3;
global.TEST_RPC_PORT     = TEST_RPC_PORT;
global.WEB3_PROVIDER_URL = WEB3_PROVIDER_URL;
global.helpers           = helpers;
global.TestRpc           = TestRpc;
global.rpc               = rpc.bind(null, request);

describe('Integration', () => {
    require('test/integration/xfi-token');
    require('test/integration/exchange');
    require('test/integration/distribution-math');
});
