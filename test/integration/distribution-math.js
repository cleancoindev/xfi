/* global Web3 contract helpers TestRpc rpc WEB3_PROVIDER_URL TEST_RPC_PORT */

/**
 * Integration test which covers distribution math of XFI tokens.
 *
 * @module test/integration/distribution-math
 */

'use strict';

const bigInt = require('big-integer');

const web3 = new Web3(WEB3_PROVIDER_URL);

const {toStr} = helpers;
const {toWei} = web3.utils;

describe('Distribution math', () => {
    const START_DATE = Math.floor((Date.now() / 1000) + 3600).toString();

    const creator = web3.eth.accounts.create();

    const testRpc = TestRpc({
        accounts: [
            {
                balance: toWei('1000000'),
                secretKey: creator.privateKey
            }
        ],
        locked: false
    });

    let token;

    before('launch the Test RPC', async () => {
        await testRpc.start(TEST_RPC_PORT);
    });

    before('deploy', async () => {
        const web3Provider = new Web3.providers.HttpProvider(WEB3_PROVIDER_URL);

        const TokenJson = require('build/contracts/XFIToken.json');
        const Token     = contract({abi: TokenJson.abi, unlinked_binary: TokenJson.bytecode});
        Token.setProvider(web3Provider);

        token = await Token.new(START_DATE, {from: creator.address});
    });

    it('100 million', async () => {
        let daysSinceStart = 0;

        const amount = toWei('100000000');
        // const amount = toWei('10000000');
        // const amount = toWei('1000000');
        // const amount = toWei('100000');
        // const amount = toWei('10000');
        // const amount = toWei('1000');
        // const amount = toWei('100');
        // const amount = toWei('10');
        // const amount = toWei('1');
        // const amount = toWei('0.1');
        // const amount = '182';
        // Math errors below 182 are expected.

        while (daysSinceStart < 182) {
            daysSinceStart = toStr(await token.daysSinceStart.call());

            const vestingEndsInDays = toStr(await token.vestingEndsInDays.call());

            console.log('Vesting ends in days:', vestingEndsInDays);

            const totalDays = Number(vestingEndsInDays) + Number(daysSinceStart);

            totalDays.should.be.equal(182);

            const expectedAmountConverted        = toStr(bigInt(amount).times(daysSinceStart).divide(182));
            const expectedReverseAmountConverted = toStr(bigInt(amount).times(vestingEndsInDays).divide(182));

            const amountConverted = toStr(await token.convertAmountUsingRatio.call(amount));
            amountConverted.should.be.equal(expectedAmountConverted);

            const amountReverseConverted = toStr(await token.convertAmountUsingReverseRatio.call(amount));

            amountReverseConverted.should.be.equal(expectedReverseAmountConverted);

            await moveTime(86400 + 1);
        }
    });

    after('stop the Test RPC', () => {
        testRpc.stop();
    });
});

/**
 * Move Test RPC time.
 *
 * @param  {Number}  seconds
 * @return {Promise}
 */
async function moveTime(seconds) {
    await rpc('evm_increaseTime', [seconds]);
    await rpc('evm_mine');
}
