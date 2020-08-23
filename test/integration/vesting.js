/* global Web3 contract helpers TestRpc moveTime WEB3_PROVIDER_URL TEST_RPC_PORT */

/**
 * Integration test which covers vesting of XFI tokens.
 *
 * @module test/integration/vesting
 */

'use strict';

const bigInt = require('big-integer');

const TokenJson = require('build/contracts/XFIToken.json');

const {toStr} = helpers;

const ONE_DAY        = 86400;
const DAY_MULTIPLIER = 60; // Any number in range [1...182].

const web3         = new Web3(WEB3_PROVIDER_URL);
const web3Provider = new Web3.providers.HttpProvider(WEB3_PROVIDER_URL);

const {toWei} = web3.utils;

const Token = contract({abi: TokenJson.abi, unlinked_binary: TokenJson.bytecode});
Token.setProvider(web3Provider);

describe('Vesting', () => {
    it('182 XFI Wei', async () => {
        const amount = '182';

        await runTestCase(amount);
    });

    it('1 XFI', async () => {
        const amount = toWei('1');

        await runTestCase(amount);
    });

    it('1000 XFI', async () => {
        const amount = toWei('1000');

        await runTestCase(amount);
    });

    it('549450.54945054945 XFI', async () => {
        const amount = toWei('549450.54945054945');

        await runTestCase(amount);
    });
});

async function runTestCase(amount) {
    const creator = web3.eth.accounts.create();
    const minter  = web3.eth.accounts.create();

    const testRpc = TestRpc({
        accounts: [
            {
                balance: toWei('10000'),
                secretKey: creator.privateKey
            },
            {
                balance: toWei('10000'),
                secretKey: minter.privateKey
            }
        ],
        locked: false
    });

    await testRpc.start(TEST_RPC_PORT);

    const startDate = Math.floor((Date.now() / 1000) + ONE_DAY).toString();

    const token = await Token.new(startDate, {from: creator.address});

    const minterRole = await token.MINTER_ROLE.call();

    await token.grantRole(minterRole, minter.address, {from: creator.address});

    const now = Math.floor(Date.now() / 1000);

    await moveTime(startDate - now + 1);

    const vestingDurationDays = Number(await token.VESTING_DURATION_DAYS.call());

    const accounts = [];

    for (let i = 0; i <= vestingDurationDays; i++) {
        const account = web3.eth.accounts.create();

        account.dailyBalances = calculateDailyBalances(amount, vestingDurationDays, i);

        accounts.push(account);
    }

    let i = Number(await token.daysSinceStart.call());

    while (i < vestingDurationDays) {
        // console.log('Day:', i);

        const account = accounts[i];

        // This mimicks the amount conversion during a swap in the Exchange contract.
        const convertedAmount = await token.convertAmountUsingReverseRatio.call(amount);

        await token.mint(account.address, convertedAmount, {from: minter.address});

        for (const account of accounts) {
            const expectedBalance = account.dailyBalances[i];

            const balance = toStr(await token.balanceOf.call(account.address));

            const diff = toStr(bigInt(expectedBalance).minus(balance));

            diff.should.be.equal('0');
        }

        await moveTime(ONE_DAY * DAY_MULTIPLIER);

        i = Number(await token.daysSinceStart.call());
    }

    testRpc.stop();
}

/**
 * Calculate expected daily balances.
 *
 * @param  {String]}  amount          Vesting amount.
 * @param  {Number]}  vestingDuration Vesting duration in days.
 * @param  {Number]}  day             Number of days since the vesting start.
 * @return {String[]}
 */
function calculateDailyBalances(amount, vestingDuration, day) {
    const dailyBalances = Array(day).fill('0');

    amount = convertAmountUsingReverseRatio(amount, vestingDuration, day);

    while (day <= vestingDuration) {
        dailyBalances[day] = toStr(bigInt(amount).times(day).divide(vestingDuration));

        day += DAY_MULTIPLIER;
    }

    return dailyBalances;
}

/**
 * JS analogy of the same function in the token.
 *
 * @param  {String} amount          Amount to convert.
 * @param  {Number} vestingDuration Vesting duration in days.
 * @param  {Number} day             Number of days since the vesting start.
 * @return {String}                 Converted amount.
 */
function convertAmountUsingReverseRatio(amount, vestingDuration, day) {
    if (day > 0) {
        return bigInt(amount)
            .times(vestingDuration - day)
            .divide(vestingDuration)
            .toString(10);
    } else {
        return amount;
    }
}
