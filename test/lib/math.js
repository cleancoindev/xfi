/**
 * Auxiliary math functions.
 *
 * @module test/lib/math
 */

'use strict';

const bigInt = require('big-integer');

/**
 * JS analogy of the same function in the token.
 *
 * @param  {String} amount          Amount to convert.
 * @param  {Number} vestingDuration Vesting duration in days.
 * @param  {Number} day             Number of days since the vesting start.
 * @return {String}                 Converted amount.
 */
exports.convertAmountUsingRatio = function convertAmountUsingRatio(amount, vestingDuration, day) {
    if (day <= vestingDuration) {
        return bigInt(amount)
            .times(day)
            .divide(vestingDuration)
            .toString(10);
    } else {
        return amount;
    }
};

/**
 * JS analogy of the same function in the token.
 *
 * @param  {String} amount          Amount to convert.
 * @param  {Number} vestingDuration Vesting duration in days.
 * @param  {Number} day             Number of days since the vesting start.
 * @return {String}                 Converted amount.
 */
exports.convertAmountUsingReverseRatio = function convertAmountUsingReverseRatio(amount, vestingDuration, day) {
    if (day > 0) {
        return bigInt(amount)
            .times(vestingDuration - day)
            .divide(vestingDuration)
            .toString(10);
    } else {
        return amount;
    }
};
