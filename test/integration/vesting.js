/* global Web3 contract helpers TestRpc moveTime rpc WEB3_PROVIDER_URL TEST_RPC_PORT */

/**
 * Integration test which covers vesting of XFI tokens.
 *
 * @module test/integration/vesting
 */

'use strict';

const bigInt = require('big-integer');
const math   = require('test/lib/math');

const TokenJson = require('build/contracts/XFIToken.json');

const {toStr}                          = helpers;
const {convertAmountUsingReverseRatio} = math;

const ONE_DAY        = 86400;
const DAY_MULTIPLIER = 60; // Any number in range [1...182].

const web3         = new Web3(WEB3_PROVIDER_URL);
const web3Provider = new Web3.providers.HttpProvider(WEB3_PROVIDER_URL);

const {toWei} = web3.utils;

const Token = contract({abi: TokenJson.abi, unlinked_binary: TokenJson.bytecode});
Token.setProvider(web3Provider);

describe('Vesting', () => {
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

    let token;
    let snapshotId;

    before('start Test RPC', async () => {
        await testRpc.start(TEST_RPC_PORT);
    });

    before('deploy', async () => {
        const vestingStart = Math.floor((Date.now() / 1000) + ONE_DAY).toString();

        token = await Token.new(vestingStart, {from: creator.address});

        const minterRole = await token.MINTER_ROLE.call();

        await token.grantRole(minterRole, minter.address, {from: creator.address});

        const now = Math.floor(Date.now() / 1000);

        await moveTime(vestingStart - now + 1);
    });

    beforeEach('create a snapshot', async () => {
        snapshotId = await snapshot();
    });

    afterEach('revert to last snapshot', async () => {
        await revert(snapshotId);
    });

    it('182 XFI Wei', async () => {
        const amount = '182';

        await runTestCase(token, amount);
    });

    it('1 XFI', async () => {
        const amount = toWei('1');

        await runTestCase(token, amount);
    });

    it('1000 XFI', async () => {
        const amount = toWei('1000');

        await runTestCase(token, amount);
    });

    it('549450.54945054945 XFI', async () => {
        const amount = toWei('549450.54945054945');

        await runTestCase(token, amount);
    });

    after('stop Test RPC', () => {
        testRpc.stop();
    });
});

async function runTestCase(token, amount) {
    const vestingDurationDays = Number(await token.VESTING_DURATION_DAYS.call());

    const accounts = [];

    for (let i = 0; i <= vestingDurationDays; i++) {
        const account = web3.eth.accounts.create();

        account.dailyBalances = calculateDailyBalances(amount, vestingDurationDays, i);

        accounts.push(account);
    }

    let i = Number(await token.vestingDaysSinceStart.call());

    while (i < vestingDurationDays) {
        // console.log('Day:', i);

        const account = accounts[i];

        // This mimicks the amount conversion during a swap in the Exchange contract.
        const convertedAmount = await token.convertAmountUsingReverseRatio.call(amount);

        const minterRole = await token.MINTER_ROLE.call();

        const minterAddress = await token.getRoleMember.call(minterRole, 0);

        await token.mint(account.address, convertedAmount, {from: minterAddress});

        for (const account of accounts) {
            const expectedBalance = account.dailyBalances[i];

            const balance = toStr(await token.balanceOf.call(account.address));

            const diff = toStr(bigInt(expectedBalance).minus(balance));

            diff.should.be.equal('0');
        }

        await moveTime(ONE_DAY * DAY_MULTIPLIER);

        i = Number(await token.vestingDaysSinceStart.call());
    }
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
 * Snapshot the state of the blockchain at the current block.
 *
 * @return {Promise<String>} Snapshot ID.
 */
function snapshot() {
    return rpc('evm_snapshot');
}

/**
 * Revert the state of the blockchain to a previous snapshot.
 *
 * @param  {String}  snapshotId Snapshot ID.
 * @return {Promise}
 */
async function revert(snapshotId) {
    await rpc('evm_revert', [snapshotId]);
}
