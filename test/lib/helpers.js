/**
 * Auxiliary functions.
 *
 * @module test/lib/helpers
 */

'use strict';

const bigInt = require('big-integer');

exports.toStr = toStr;
exports.toWei = toWei;

/**
 * The Ethereum zero address.
 *
 * @type {String}
 */
exports.ZERO_ADDRESS = '0x' + '0'.repeat(40);

/**
 * Move Test RPC time.
 *
 * @param  {Object}  rpc     RPC client.
 * @param  {Number}  seconds
 * @return {Promise}
 */
exports.moveTime = async function moveTime(rpc, seconds) {
    await rpc('evm_increaseTime', [seconds]);
    await rpc('evm_mine');
};

/**
 * Type cast an object to a string.
 *
 * @param  {Object} o Input object.
 * @return {String}   Output string.
 */
function toStr(o) {
    return o.toString(10);
}

/**
 * Simplified `toWei` function that assumes that we work only with 18 decimal
 * tokens. It also returns string instead of BN.
 *
 * @param  {String} s Input string.
 * @return {String}   Output string.
 */
function toWei(s) {
    return toStr(bigInt(s).multiply(1e18));
}
