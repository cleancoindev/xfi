/* global Web3 contract helpers TestRpc moveTime WEB3_PROVIDER_URL TEST_RPC_PORT */

/**
 * Integration test which covers functionality of Ethereum XFI Exchange.
 *
 * @module test/integration/exchange
 */

'use strict';

const bigInt = require('big-integer');
const math   = require('test/lib/math');

const ONE_DAY = 86400;

const web3 = new Web3(WEB3_PROVIDER_URL);

const {toStr}                          = helpers;
const {ZERO_ADDRESS}                   = helpers;
const {toWei}                          = web3.utils;
const {convertAmountUsingRatio}        = math;
const {convertAmountUsingReverseRatio} = math;

describe('Ethereum XFI Exchange', () => {
    const START_DATE         = Math.floor((Date.now() / 1000) + 3600).toString();
    const WINGS_TOTAL_SUPPLY = toWei('100000000'); // 1e26

    const creator       = web3.eth.accounts.create();
    const newOwner      = web3.eth.accounts.create();
    const tempOwner     = web3.eth.accounts.create();
    const maliciousUser = web3.eth.accounts.create();
    const firstUser     = web3.eth.accounts.create();
    const secondUser    = web3.eth.accounts.create();

    const testRpc = TestRpc({
        accounts: [
            {
                balance: toWei('1000000'),
                secretKey: creator.privateKey
            },
            {
                balance: toWei('10'),
                secretKey: newOwner.privateKey
            },
            {
                balance: toWei('10'),
                secretKey: tempOwner.privateKey
            },
            {
                balance: toWei('10'),
                secretKey: firstUser.privateKey
            },
            {
                balance: toWei('10'),
                secretKey: secondUser.privateKey
            },
            {
                balance: toWei('10'),
                secretKey: maliciousUser.privateKey
            }
        ],
        locked: false
    });

    const xfiTotalSupply = {
        persistent:  '0',
        vesting:     '0',
        spentVested: '0'
    };

    let wingsToken;
    let xfiToken;
    let exchange;
    let xfiReserveAmount;

    /**
     * Swap WINGS for XFI.
     *
     * @param  {Object} user
     * @param  {String} amountIn Amount of WINGS in.
     * @return {Promise}
     */
    async function swap(user, amountIn) {
        const vestingDurationDays   = Number(await xfiToken.VESTING_DURATION_DAYS.call());
        const vestingDaysSinceStart = Number(await xfiToken.vestingDaysSinceStart.call());

        // Balances check before the swap.
        const userWingsBalanceBefore     = toStr(await wingsToken.balanceOf.call(user.address));
        const userXfiBalanceBefore       = toStr(await xfiToken.balanceOf.call(user.address));
        const exchangeWingsBalanceBefore = toStr(await wingsToken.balanceOf.call(exchange.address));

        // Expected XFI amount to receive after the vesting end.
        const expectedAmountOut = convertAmountUsingReverseRatio(amountIn, vestingDurationDays, vestingDaysSinceStart);

        // Update the vesting XFI total supply.
        xfiTotalSupply.vesting = await increaseXfiTotalSupply(xfiToken, xfiTotalSupply.vesting, amountIn);

        // Update the XFI reserve amount.
        xfiReserveAmount = bigInt(xfiReserveAmount)
            .minus(expectedAmountOut)
            .toString(10);

        // Expected values after the swap.
        const expectedXfiTotalSupplyAfter        = await calculateXfiTotalSupply(xfiToken, xfiTotalSupply);
        const expectedUserWingsBalanceAfter      = bigInt(userWingsBalanceBefore)
            .minus(amountIn)
            .toString(10);
        const expectedUserXfiBalanceAfter        = bigInt(userXfiBalanceBefore)
            .plus(convertAmountUsingRatio(expectedAmountOut, vestingDurationDays, vestingDaysSinceStart))
            .toString(10);
        const expectedExchangeWingsBalanceAfter  = bigInt(exchangeWingsBalanceBefore)
            .plus(amountIn)
            .toString(10);

        // Approve the Exchange to spend `amountIn` of WINGS tokens before the swap.
        await wingsToken.approve(exchange.address, amountIn, {from: user.address});

        /* ▲ Before swap ▲ */

        // Swap WINGS for XFI.
        const txResult = await exchange.swapWINGSForXFI(amountIn, {from: user.address});

        /* ▼ After swap ▼ */

        // XFI total supply check after the swap.
        const xfiTotalSupplyAfter = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyAfter.should.be.equal(expectedXfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = toStr(await wingsToken.balanceOf.call(user.address));
        const userXfiBalanceAfter       = toStr(await xfiToken.balanceOf.call(user.address));
        const exchangeWingsBalanceAfter = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userXfiBalanceAfter.should.be.equal(expectedUserXfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);

        // Check the XFI reserve amount.

        const xfiReserveAmount_ = toStr(await xfiToken.reserveAmount.call());

        xfiReserveAmount_.should.be.equal(xfiReserveAmount);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapWINGSForXFI');
        firstLog.args.sender.should.be.equal(user.address);
        toStr(firstLog.args.amountIn).should.be.equal(amountIn);
        toStr(firstLog.args.amountOut).should.be.equal(expectedAmountOut);
    }

    before('launch the Test RPC', async () => {
        await testRpc.start(TEST_RPC_PORT);
    });

    before('deploy', async () => {
        const web3Provider = new Web3.providers.HttpProvider(WEB3_PROVIDER_URL);

        // Deploy of the Wings token mock.
        const WingsTokenJson = require('build/contracts/WingsToken.json');
        const WingsToken     = contract({abi: WingsTokenJson.abi, unlinked_binary: WingsTokenJson.bytecode});
        WingsToken.setProvider(web3Provider);

        wingsToken = await WingsToken.new({from: creator.address});

        // Deploy of the XFI token.
        const XfiTokenJson = require('build/contracts/XFIToken.json');
        const XfiToken     = contract({abi: XfiTokenJson.abi, unlinked_binary: XfiTokenJson.bytecode});
        XfiToken.setProvider(web3Provider);

        xfiToken = await XfiToken.new(START_DATE, {from: creator.address});

        // Deploy of the Exchange.
        const ExchangeJson = require('build/contracts/Exchange.json');
        const Exchange     = contract({abi: ExchangeJson.abi, unlinked_binary: ExchangeJson.bytecode});
        Exchange.setProvider(web3Provider);

        exchange = await Exchange.new(wingsToken.address, xfiToken.address, {from: creator.address});
    });

    it('total supply of WINGS is valid', async () => {
        const wingsTotalSupply = toStr(await wingsToken.totalSupply.call());

        wingsTotalSupply.should.be.equal(WINGS_TOTAL_SUPPLY);
    });

    it('total supply of XFI is valid', async () => {
        const expectedXfiTotalSupply = await calculateXfiTotalSupply(xfiToken, xfiTotalSupply);

        const xfiTotalSupply_ = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupply_.should.be.equal(expectedXfiTotalSupply);
    });

    it('reserve amount of XFI is correct', async () => {
        const expectedMaxXfiVestingTotalSupply = toWei('100000000'); // 1e26

        const maxXfiVestingTotalSupply = toStr(await xfiToken.MAX_VESTING_TOTAL_SUPPLY.call());

        maxXfiVestingTotalSupply.should.be.equal(expectedMaxXfiVestingTotalSupply);

        xfiReserveAmount = maxXfiVestingTotalSupply;
    });

    it('the Exchange has correct addresses of tokens', async () => {
        const wingsTokenAddress    = await exchange.wingsToken.call();
        const xfiTokenAddress      = await exchange.xfiToken.call();

        wingsTokenAddress.should.be.equal(wingsToken.address);
        xfiTokenAddress.should.be.equal(xfiToken.address);
    });

    it('creator is owner', async () => {
        const ownerRole = await exchange.DEFAULT_ADMIN_ROLE.call();

        const roleMemberCount = (await exchange.getRoleMemberCount.call(ownerRole)).toNumber();
        const creatorIsOwner  = await exchange.hasRole.call(ownerRole, creator.address);
        const roleMember      = await exchange.getRoleMember.call(ownerRole, '0');

        roleMemberCount.should.be.equal(1);
        creatorIsOwner.should.be.true;
        roleMember.should.be.equal(creator.address);
    });

    it('doesn\'t allow to add owners before owner role was granted', async () => {
        const ownerRole = await exchange.DEFAULT_ADMIN_ROLE.call();

        try {
            await exchange.grantRole(ownerRole, tempOwner.address, {from: newOwner.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('AccessControl: sender must be an admin to grant');
        }
    });

    it('add new owner', async () => {
        const ownerRole = await exchange.DEFAULT_ADMIN_ROLE.call();

        const txResult = await exchange.grantRole(ownerRole, newOwner.address, {from: creator.address});

        const roleMemberCount = (await exchange.getRoleMemberCount.call(ownerRole)).toNumber();
        const newOwnerIsOwner = await exchange.hasRole.call(ownerRole, newOwner.address);
        const roleMember      = await exchange.getRoleMember.call(ownerRole, '1');

        roleMemberCount.should.be.equal(2);
        newOwnerIsOwner.should.be.true;
        roleMember.should.be.equal(newOwner.address);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('RoleGranted');
        firstLog.args.role.should.be.equal(ownerRole);
        firstLog.args.account.should.be.equal(newOwner.address);
        firstLog.args.sender.should.be.equal(creator.address);
    });

    it('new owner can add owners', async () => {
        const ownerRole = await exchange.DEFAULT_ADMIN_ROLE.call();

        await exchange.grantRole(ownerRole, tempOwner.address, {from: newOwner.address});

        const roleMemberCount  = (await exchange.getRoleMemberCount.call(ownerRole)).toNumber();
        const tempOwnerIsOwner = await exchange.hasRole.call(ownerRole, tempOwner.address);
        const roleMember       = await exchange.getRoleMember.call(ownerRole, '2');

        roleMemberCount.should.be.equal(3);
        tempOwnerIsOwner.should.be.true;
        roleMember.should.be.equal(tempOwner.address);
    });

    it('new owner can remove temp owner', async () => {
        const ownerRole = await exchange.DEFAULT_ADMIN_ROLE.call();

        const txResult = await exchange.revokeRole(ownerRole, tempOwner.address, {from: newOwner.address});

        const roleMemberCount  = (await exchange.getRoleMemberCount.call(ownerRole)).toNumber();
        const tempOwnerIsOwner = await exchange.hasRole.call(ownerRole, tempOwner.address);

        roleMemberCount.should.be.equal(2);
        tempOwnerIsOwner.should.be.false;

        try {
            await exchange.getRoleMember.call(ownerRole, '2');

            throw Error('Should revert');
        } catch (error) {
            error.message.should.be.equal('Returned error: VM Exception while processing transaction: revert EnumerableSet: index out of bounds');
        }

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('RoleRevoked');
        firstLog.args.role.should.be.equal(ownerRole);
        firstLog.args.account.should.be.equal(tempOwner.address);
        firstLog.args.sender.should.be.equal(newOwner.address);
    });

    it('remove new owner', async () => {
        const ownerRole = await exchange.DEFAULT_ADMIN_ROLE.call();

        await exchange.revokeRole(ownerRole, newOwner.address, {from: creator.address});

        const roleMemberCount = (await exchange.getRoleMemberCount.call(ownerRole)).toNumber();
        const newOwnerIsOwner = await exchange.hasRole.call(ownerRole, newOwner.address);

        roleMemberCount.should.be.equal(1);
        newOwnerIsOwner.should.be.false;

        try {
            await exchange.getRoleMember.call(ownerRole, '1');

            throw Error('Should revert');
        } catch (error) {
            error.message.should.be.equal('Returned error: VM Exception while processing transaction: revert EnumerableSet: index out of bounds');
        }
    });

    it('grant the Exchange minter role', async () => {
        const minterRole = await xfiToken.MINTER_ROLE.call();

        await xfiToken.grantRole(minterRole, exchange.address, {from: creator.address});

        const roleMemberCount = (await xfiToken.getRoleMemberCount.call(minterRole)).toNumber();
        const minterIsMinter  = await xfiToken.hasRole.call(minterRole, exchange.address);
        const roleMember      = await xfiToken.getRoleMember.call(minterRole, 0);

        roleMemberCount.should.be.equal(1);
        minterIsMinter.should.be.true;
        roleMember.should.be.equal(exchange.address);
    });

    it('transfer first user some WINGS tokens', async () => {
        // Initial user WINGS balance.
        const amountToTransfer = toWei('300');

        // Transfer WINGS tokens.
        await wingsToken.transfer(firstUser.address, amountToTransfer, {from: creator.address});

        // Check user WINGS balance after the operation.
        const userBalance = toStr(await wingsToken.balanceOf.call(firstUser.address));

        userBalance.should.be.equal(amountToTransfer);
    });

    it('transfer second user some WINGS tokens', async () => {
        // Initial user WINGS balance.
        const amountToTransfer = toWei('200');

        // Transfer WINGS tokens.
        await wingsToken.transfer(secondUser.address, amountToTransfer, {from: creator.address});

        // Check user WINGS balance after the operation.
        const userBalance = toStr(await wingsToken.balanceOf.call(secondUser.address));

        userBalance.should.be.equal(amountToTransfer);
    });

    it('estimate amounts of swap WINGS-XFI', async () => {
        const amountIn = toWei('100');

        const amounts = await exchange.estimateSwapWINGSForXFI.call(amountIn);

        const expectedWingsIn = amountIn;
        const expectedXfiOut  = amountIn;

        const wingsIn = toStr(amounts[0]);
        const xfiOut  = toStr(amounts[1]);

        wingsIn.should.be.equal(expectedWingsIn);
        xfiOut.should.be.equal(expectedXfiOut);
    });

    it('estimate amounts of swap WINGS-XFI per day', async () => {
        const vestingDurationDays = Number(await xfiToken.VESTING_DURATION_DAYS.call());
        const vestingDaysLeft     = Number(await xfiToken.vestingDaysLeft.call());

        const amountIn = toWei('100');

        const expectedAmountOutPerDay = bigInt(amountIn)
            .times(vestingDaysLeft)
            .divide(vestingDurationDays)
            .divide(vestingDurationDays)
            .toString(10);

        const amountPerDay = toStr(await exchange.estimateSwapWINGSForXFIPerDay.call(amountIn));

        amountPerDay.should.be.equal(expectedAmountOutPerDay);
    });

    it('doesn\'t allow to swap before the vesting start', async () => {
        try {
            await exchange.swapWINGSForXFI('1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping has not started');
        }
    });

    it('move time after vesting start', async () => {
        const now          = Math.floor(Date.now() / 1000);
        const vestingStart = await xfiToken.vestingStart.call();

        await moveTime(vestingStart - now + 1);

        const vestingDaysSinceStart = Number(await xfiToken.vestingDaysSinceStart.call());
        const vestingDaysLeft       = Number(await xfiToken.vestingDaysLeft.call());

        vestingDaysSinceStart.should.be.equal(1);
        vestingDaysLeft.should.be.equal(181);
    });

    it('doesn\'t allow to set gas price without the owner access role', async () => {
        const maxGasPrice = toWei('100', 'gwei');

        try {
            await exchange.setMaxGasPrice(maxGasPrice, {from: maliciousUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: sender is not owner');
        }
    });

    it('set gas price', async () => {
        const maxGasPriceBefore = toStr(await exchange.maxGasPrice.call());

        maxGasPriceBefore.should.be.equal('0');

        const maxGasPrice = toWei('100', 'gwei');

        const txResult = await exchange.setMaxGasPrice(maxGasPrice, {from: creator.address});

        const maxGasPriceAfter = toStr(await exchange.maxGasPrice.call());

        maxGasPriceAfter.should.be.equal(maxGasPrice);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('MaxGasPriceChanged');
        toStr(firstLog.args.newMaxGasPrice).should.be.equal(maxGasPrice);
    });

    it('doesn\'t allow to swap when gas price is higher than the limit', async () => {
        // Amount of WINGS to swap.
        const amountIn = toWei('100');
        const gasPrice = toWei('200', 'gwei');

        try {
            await exchange.swapWINGSForXFI(amountIn, {from: firstUser.address, gasPrice});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: gas price exceeds the limit');
        }
    });

    it('unset gas price', async () => {
        const maxGasPrice = '0';

        await exchange.setMaxGasPrice(maxGasPrice, {from: creator.address});

        const maxGasPriceAfter = toStr(await exchange.maxGasPrice.call());

        maxGasPriceAfter.should.be.equal(maxGasPrice);
    });

    it('doesn\'t allow to swap for less than 182 XFI Wei', async () => {
        try {
            await exchange.swapWINGSForXFI('181', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: minimum XFI swap output amount is 182 * 10 ** -18');
        }
    });

    it('swap WINGS-XFI (first user, first day)', async () => {
        // Amount of WINGS to swap.
        const amountIn = toWei('100');

        await swap(firstUser, amountIn);
    });

    it('move time one day in the future', async () => {
        await moveTime(ONE_DAY);

        const vestingDaysSinceStart = Number(await xfiToken.vestingDaysSinceStart.call());

        vestingDaysSinceStart.should.be.equal(2);
    });

    it('check vested balance of the user that swapped on the first day', async () => {
        const expectedBalance              = toStr(await xfiToken.convertAmountUsingRatio.call(toWei('100')));
        const expectedVestedBalance        = expectedBalance;
        const expectedUnspentVestedBalance = expectedBalance;
        const expectedSpentVestedBalance   = '0';

        const balance              = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const totalVestedBalance   = toStr(await xfiToken.totalVestedBalanceOf.call(firstUser.address));
        const unspentVestedBalance = toStr(await xfiToken.unspentVestedBalanceOf.call(firstUser.address));
        const spentVestedBalance   = toStr(await xfiToken.spentVestedBalanceOf.call(firstUser.address));

        balance.should.be.equal(expectedBalance);
        totalVestedBalance.should.be.equal(expectedVestedBalance);
        unspentVestedBalance.should.be.equal(expectedUnspentVestedBalance);
        spentVestedBalance.should.be.equal(expectedSpentVestedBalance);
    });

    it('swap WINGS-XFI (first user, second day)', async () => {
        // Amount of WINGS to swap.
        const amountIn = toWei('100');

        await swap(firstUser, amountIn);
    });

    it('first user transfers tokens to a second user', async () => {
        const firstUserBalanceBefore              = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const firstUserTotalVestedBalanceBefore   = toStr(await xfiToken.totalVestedBalanceOf.call(firstUser.address));
        const firstUserUnspentVestedBalanceBefore = toStr(await xfiToken.unspentVestedBalanceOf.call(firstUser.address));
        const firstUserSpentVestedBalanceBefore   = toStr(await xfiToken.spentVestedBalanceOf.call(firstUser.address));

        const secondUserBalanceBefore              = toStr(await xfiToken.balanceOf.call(secondUser.address));
        const secondUserTotalVestedBalanceBefore   = toStr(await xfiToken.totalVestedBalanceOf.call(secondUser.address));
        const secondUserUnspentVestedBalanceBefore = toStr(await xfiToken.unspentVestedBalanceOf.call(secondUser.address));
        const secondUserSpentVestedBalanceBefore   = toStr(await xfiToken.spentVestedBalanceOf.call(secondUser.address));

        const amount = toWei('2');

        xfiTotalSupply.persistent  = bigInt(xfiTotalSupply.persistent)
            .plus(amount)
            .toString(10);
        xfiTotalSupply.spentVested = bigInt(xfiTotalSupply.spentVested)
            .plus(amount)
            .toString(10);

        const expectedFirstUserBalance              = bigInt(firstUserBalanceBefore)
            .minus(amount)
            .toString(10);
        const expectedFirstUserTotalVestedBalance   = firstUserTotalVestedBalanceBefore;
        const expectedFirstUserUnspentVestedBalance = bigInt(firstUserUnspentVestedBalanceBefore)
            .minus(amount)
            .toString(10);
        const expectedFirstUserSpentVestedBalance   = bigInt(firstUserSpentVestedBalanceBefore)
            .plus(amount)
            .toString(10);

        const expectedSecondUserBalance              = bigInt(secondUserBalanceBefore)
            .plus(amount)
            .toString(10);
        const expectedSecondUserTotalVestedBalance   = secondUserTotalVestedBalanceBefore;
        const expectedSecondUserUnspentVestedBalance = secondUserUnspentVestedBalanceBefore;
        const expectedSecondUserSpentVestedBalance   = secondUserSpentVestedBalanceBefore;

        /* ▲ Before transfer ▲ */

        await xfiToken.transfer(secondUser.address, amount, {from: firstUser.address});

        /* ▼ After transfer ▼ */

        const firstUserBalanceAfter              = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const firstUserTotalVestedBalanceAfter   = toStr(await xfiToken.totalVestedBalanceOf.call(firstUser.address));
        const firstUserUnspentVestedBalanceAfter = toStr(await xfiToken.unspentVestedBalanceOf.call(firstUser.address));
        const firstUserSpentVestedBalanceAfter   = toStr(await xfiToken.spentVestedBalanceOf.call(firstUser.address));

        const secondUserBalanceAfter              = toStr(await xfiToken.balanceOf.call(secondUser.address));
        const secondUserTotalVestedBalanceAfter   = toStr(await xfiToken.totalVestedBalanceOf.call(secondUser.address));
        const secondUserUnspentVestedBalanceAfter = toStr(await xfiToken.unspentVestedBalanceOf.call(secondUser.address));
        const secondUserSpentVestedBalanceAfter   = toStr(await xfiToken.spentVestedBalanceOf.call(secondUser.address));

        firstUserBalanceAfter.should.be.equal(expectedFirstUserBalance);
        firstUserTotalVestedBalanceAfter.should.be.equal(expectedFirstUserTotalVestedBalance);
        firstUserUnspentVestedBalanceAfter.should.be.equal(expectedFirstUserUnspentVestedBalance);
        firstUserSpentVestedBalanceAfter.should.be.equal(expectedFirstUserSpentVestedBalance);

        secondUserBalanceAfter.should.be.equal(expectedSecondUserBalance);
        secondUserTotalVestedBalanceAfter.should.be.equal(expectedSecondUserTotalVestedBalance);
        secondUserUnspentVestedBalanceAfter.should.be.equal(expectedSecondUserUnspentVestedBalance);
        secondUserSpentVestedBalanceAfter.should.be.equal(expectedSecondUserSpentVestedBalance);
    });

    it('second user burns 1 XFI', async () => {
        const amountToBurn = toWei('1');

        await xfiToken.burn(amountToBurn, {from: secondUser.address});

        // Update XFI total supply.
        xfiTotalSupply.persistent = bigInt(xfiTotalSupply.persistent)
            .minus(amountToBurn)
            .toString(10);
    });

    it('swap WINGS-XFI (second user, second day)', async () => {
        // Amount of WINGS to swap.
        const amountIn = toWei('200');

        await swap(secondUser, amountIn);
    });

    it('grant the creator minter role', async () => {
        const minterRole = await xfiToken.MINTER_ROLE.call();

        await xfiToken.grantRole(minterRole, creator.address, {from: creator.address});

        const roleMemberCount = (await xfiToken.getRoleMemberCount.call(minterRole)).toNumber();
        const minterIsMinter  = await xfiToken.hasRole.call(minterRole, creator.address);
        const roleMember      = await xfiToken.getRoleMember.call(minterRole, 1);

        roleMemberCount.should.be.equal(2);
        minterIsMinter.should.be.true;
        roleMember.should.be.equal(creator.address);
    });

    it('mint without vesting', async () => {
        const expectedXfiTotalSupplyBefore = await calculateXfiTotalSupply(xfiToken, xfiTotalSupply);

        // Update persistent total supply.
        xfiTotalSupply.persistent = bigInt(xfiTotalSupply.persistent)
            .plus(toWei('1'))
            .toString(10);

        const expectedXfiTotalSupplyAfter = await calculateXfiTotalSupply(xfiToken, xfiTotalSupply);

        const xfiTotalSupplyBefore = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyBefore.should.be.equal(expectedXfiTotalSupplyBefore);

        const amountToMint = toWei('1');

        await xfiToken.mintWithoutVesting(secondUser.address, amountToMint, {from: creator.address});

        const xfiTotalSupplyAfter = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyAfter.should.be.equal(expectedXfiTotalSupplyAfter);
    });

    it('doesn\'t allow to migrate vesting balance to zero address', async () => {
        const ZERO_BYTES = '0x' + '0'.repeat(64);

        try {
            await xfiToken.migrateVestingBalance(ZERO_BYTES, {from: secondUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: migrate to the zero bytes');
        }
    });

    it('doesn\'t allow to migrate vesting balance when migrating is disallowed', async () => {
        const BYTE_ADDRESS = '0x' + '1'.repeat(64);

        try {
            await xfiToken.migrateVestingBalance(BYTE_ADDRESS, {from: secondUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: migrating is disallowed');
        }
    });

    it('doesn\'t allow to allow migrations without owner access role', async () => {
        try {
            await xfiToken.allowMigrations({from: maliciousUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: sender is not owner');
        }
    });

    it('allow migrations', async () => {
        const migratingAllowedBefore = await xfiToken.isMigratingAllowed.call();

        migratingAllowedBefore.should.be.false;

        await xfiToken.allowMigrations({from: creator.address});

        const migratingAllowedAfter = await xfiToken.isMigratingAllowed.call();

        migratingAllowedAfter.should.be.true;
    });

    it('doesn\'t allow to allow migrations when migraitons are allowed', async () => {
        try {
            await xfiToken.allowMigrations({from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: migrating is allowed');
        }
    });

    it('migrate vesting balance (second user, second day)', async () => {
        const BYTE_ADDRESS = '0x' + '1'.repeat(64);

        const vestingDurationDays = Number(await xfiToken.VESTING_DURATION_DAYS.call());
        const vestingDaysLeft     = Number(await xfiToken.vestingDaysLeft.call());

        // Update the absolute XFI total supply.

        const expectedVestingBalance = convertAmountUsingReverseRatio(toWei('200'), vestingDurationDays, 2);
        const expectedVestedBalance  = convertAmountUsingRatio(expectedVestingBalance, vestingDurationDays, 2);

        // Update total supply.

        xfiTotalSupply.vesting = bigInt(xfiTotalSupply.vesting)
            .minus(expectedVestingBalance)
            .toString(10);

        xfiTotalSupply.persistent = bigInt(xfiTotalSupply.persistent)
            .plus(expectedVestedBalance)
            .toString(10);

        const expectedTotalSupplyAfter = await calculateXfiTotalSupply(xfiToken, xfiTotalSupply);

        /* ▲ Before migration ▲ */

        const txResult = await xfiToken.migrateVestingBalance(BYTE_ADDRESS, {from: secondUser.address});

        /* ▼ After migration ▼ */

        // Check balances.

        const balance              = toStr(await xfiToken.balanceOf.call(secondUser.address));
        const totalVestedBalance   = toStr(await xfiToken.totalVestedBalanceOf.call(secondUser.address));
        const unspentVestedBalance = toStr(await xfiToken.unspentVestedBalanceOf.call(secondUser.address));
        const spentVestedBalance   = toStr(await xfiToken.spentVestedBalanceOf.call(secondUser.address));

        const expectedBalance              = bigInt(expectedVestedBalance)
            .add(toWei('2'))
            .toString(10);
        const expectedTotalVestedBalance   = '0';
        const expectedUnspentVestedBalance = '0';
        const expectedSpentVestedBalance   = '0';

        balance.should.be.equal(expectedBalance);
        totalVestedBalance.should.be.equal(expectedTotalVestedBalance);
        unspentVestedBalance.should.be.equal(expectedUnspentVestedBalance);
        spentVestedBalance.should.be.equal(expectedSpentVestedBalance);

        // Check total supply.

        const totalSupplyAfter = toStr(await xfiToken.totalSupply.call());

        totalSupplyAfter.should.be.equal(expectedTotalSupplyAfter);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('VestingBalanceMigrated');
        firstLog.args.from.should.be.equal(secondUser.address);
        firstLog.args.to.should.be.equal(BYTE_ADDRESS);
        Number(firstLog.args.vestingDaysLeft).should.be.equal(vestingDaysLeft);
        toStr(firstLog.args.vestingBalance).should.be.equal(expectedVestingBalance);
    });

    it('move time to last day', async () => {
        const now        = Math.floor(Date.now() / 1000);
        const vestingEnd = await xfiToken.vestingEnd.call();

        await moveTime(vestingEnd - now - 2 * ONE_DAY + 1);
    });

    it('swap WINGS-XFI (first user, last day)', async () => {
        // Amount of WINGS to swap.
        const amountIn = toWei('100');

        await swap(firstUser, amountIn);
    });

    it('migrate vesting balance (first user, last day)', async () => {
        const BYTE_ADDRESS = '0x' + '1'.repeat(64);

        const vestingDurationDays = Number(await xfiToken.VESTING_DURATION_DAYS.call());
        const vestingDaysLeft     = Number(await xfiToken.vestingDaysLeft.call());

        // Update the absolute XFI total supply.

        const expectedVestingBalance = bigInt(convertAmountUsingReverseRatio(toWei('100'), vestingDurationDays, 1))
            .plus(convertAmountUsingReverseRatio(toWei('100'), vestingDurationDays, 2))
            .plus(convertAmountUsingReverseRatio(toWei('100'), vestingDurationDays, vestingDurationDays))
            .toString(10);
        const expectedVestedBalance  = convertAmountUsingRatio(expectedVestingBalance, vestingDurationDays, vestingDurationDays);

        const spentVestedBalanceBefore = toStr(await xfiToken.spentVestedBalanceOf.call(firstUser.address));

        // Update total supply.

        xfiTotalSupply.persistent = bigInt(xfiTotalSupply.persistent)
            .plus(expectedVestedBalance)
            .minus(toWei('2'))
            .toString(10);

        xfiTotalSupply.vesting = bigInt(xfiTotalSupply.vesting)
            .minus(expectedVestingBalance)
            .toString(10);

        xfiTotalSupply.spentVested = bigInt(xfiTotalSupply.spentVested)
            .minus(spentVestedBalanceBefore)
            .toString(10);

        const expectedTotalSupplyAfter = await calculateXfiTotalSupply(xfiToken, xfiTotalSupply);

        /* ▲ Before migration ▲ */

        const txResult = await xfiToken.migrateVestingBalance(BYTE_ADDRESS, {from: firstUser.address});

        /* ▼ After migration ▼ */

        // Check balances.

        const balance              = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const totalVestedBalance   = toStr(await xfiToken.totalVestedBalanceOf.call(firstUser.address));
        const unspentVestedBalance = toStr(await xfiToken.unspentVestedBalanceOf.call(firstUser.address));
        const spentVestedBalance   = toStr(await xfiToken.spentVestedBalanceOf.call(firstUser.address));

        const expectedBalance              = bigInt(expectedVestedBalance)
            .minus(toWei('2'))
            .toString(10);
        const expectedTotalVestedBalance   = '0';
        const expectedUnspentVestedBalance = '0';
        const expectedSpentVestedBalance   = '0';

        balance.should.be.equal(expectedBalance);
        totalVestedBalance.should.be.equal(expectedTotalVestedBalance);
        unspentVestedBalance.should.be.equal(expectedUnspentVestedBalance);
        spentVestedBalance.should.be.equal(expectedSpentVestedBalance);

        // Check total supply.

        const totalSupplyAfter = toStr(await xfiToken.totalSupply.call());

        totalSupplyAfter.should.be.equal(expectedTotalSupplyAfter);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('VestingBalanceMigrated');
        firstLog.args.from.should.be.equal(firstUser.address);
        firstLog.args.to.should.be.equal(BYTE_ADDRESS);
        Number(firstLog.args.vestingDaysLeft).should.be.equal(vestingDaysLeft);
        toStr(firstLog.args.vestingBalance).should.be.equal(expectedVestingBalance);
    });

    it('doesn\'t allow to migrate vesting balance that is equal to zero', async () => {
        const BYTE_ADDRESS = '0x' + '1'.repeat(64);

        try {
            await xfiToken.migrateVestingBalance(BYTE_ADDRESS, {from: secondUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: vesting balance is zero');
        }
    });

    it('doesn\'t allow ex-owner to stop swaps without owner access role', async () => {
        try {
            await exchange.stopSwaps({from: tempOwner.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: sender is not owner');
        }
    });

    it('stop swaps', async () => {
        // Check the state of swaps before.
        const swappingIsStopped = await exchange.isSwappingStopped.call();

        swappingIsStopped.should.be.false;

        // Stop swaps.
        const txResult = await exchange.stopSwaps({from: creator.address});

        // Check the state of swaps after.
        const swappingIsStoppedAfter = await exchange.isSwappingStopped.call();

        swappingIsStoppedAfter.should.be.true;

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapsStopped');
    });

    it('doesn\'t allow to stop swaps when swapping is stopped', async () => {
        try {
            await exchange.stopSwaps({from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping is stopped');
        }
    });

    it('doesn\'t allow to swap WINGS-XFI (swapping is stopped)', async () => {
        try {
            await exchange.swapWINGSForXFI('1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping is stopped');
        }
    });

    it('doesn\'t allow ex-owner to start swaps without owner access role', async () => {
        try {
            await exchange.startSwaps({from: tempOwner.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: sender is not owner');
        }
    });

    it('start swaps', async () => {
        // Check the state of swaps before.
        const swappingIsStopped = await exchange.isSwappingStopped.call();

        swappingIsStopped.should.be.true;

        // Start swaps.
        const txResult = await exchange.startSwaps({from: creator.address});

        // Check the state of swaps after.
        const swappingIsStoppedAfter = await exchange.isSwappingStopped.call();

        swappingIsStoppedAfter.should.be.false;

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapsStarted');
    });

    it('doesn\'t allow to start swaps when swapping is not stopped', async () => {
        try {
            await exchange.startSwaps({from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping is not stopped');
        }
    });

    it('move time after vesting end', async () => {
        const now        = Math.floor(Date.now() / 1000);
        const vestingEnd = await xfiToken.vestingEnd.call();

        await moveTime(vestingEnd - now + 1);
    });

    it('check first user\'s balance', async () => {
        const vestingDuration = Number(await xfiToken.VESTING_DURATION.call()) / ONE_DAY;

        const balance              = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const totalVestedBalance   = toStr(await xfiToken.totalVestedBalanceOf.call(firstUser.address));
        const unspentVestedBalance = toStr(await xfiToken.unspentVestedBalanceOf.call(firstUser.address));
        const spentVestedBalance   = toStr(await xfiToken.spentVestedBalanceOf.call(firstUser.address));

        const expectedBalance              = bigInt(convertAmountUsingReverseRatio(toWei('100'), vestingDuration, 1))
            .plus(convertAmountUsingReverseRatio(toWei('100'), vestingDuration, 2))
            .plus(convertAmountUsingReverseRatio(toWei('100'), vestingDuration, vestingDuration))
            .minus(toWei('2'))
            .toString(10);
        const expectedTotalVestedBalance   = '0';
        const expectedUnspentVestedBalance = '0';
        const expectedSpentVestedBalance   = '0';

        balance.should.be.equal(expectedBalance);
        totalVestedBalance.should.be.equal(expectedTotalVestedBalance);
        unspentVestedBalance.should.be.equal(expectedUnspentVestedBalance);
        spentVestedBalance.should.be.equal(expectedSpentVestedBalance);
    });

    it('check second user\'s balance', async () => {
        const vestingDuration = Number(await xfiToken.VESTING_DURATION.call()) / ONE_DAY;

        const balance              = toStr(await xfiToken.balanceOf.call(secondUser.address));
        const totalVestedBalance   = toStr(await xfiToken.totalVestedBalanceOf.call(secondUser.address));
        const unspentVestedBalance = toStr(await xfiToken.unspentVestedBalanceOf.call(secondUser.address));
        const spentVestedBalance   = toStr(await xfiToken.spentVestedBalanceOf.call(secondUser.address));

        const expectedVestingBalance       = convertAmountUsingReverseRatio(toWei('200'), vestingDuration, 2);
        const expectedVestedBalance        = convertAmountUsingRatio(expectedVestingBalance, vestingDuration, 2);
        const expectedBalance              = bigInt(expectedVestedBalance)
            .add(toWei('2'))
            .toString(10);
        const expectedTotalVestedBalance   = '0';
        const expectedUnspentVestedBalance = '0';
        const expectedSpentVestedBalance   = '0';

        balance.should.be.equal(expectedBalance);
        totalVestedBalance.should.be.equal(expectedTotalVestedBalance);
        unspentVestedBalance.should.be.equal(expectedUnspentVestedBalance);
        spentVestedBalance.should.be.equal(expectedSpentVestedBalance);
    });

    it('doesn\'t allow to swap WINGS afer vesting end', async () => {
        try {
            await exchange.swapWINGSForXFI('1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping has ended');
        }
    });

    it('doesn\'t allow to migrate vesting XFI after the vesting end', async () => {
        const BYTE_ADDRESS = '0x' + '1'.repeat(64);

        try {
            await xfiToken.migrateVestingBalance(BYTE_ADDRESS, {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: vesting has ended');
        }
    });

    it('doesn\'t allow to withdraw WINGS without owner access role', async () => {
        try {
            await exchange.startSwaps({from: maliciousUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: sender is not owner');
        }
    });

    it('doesn\'t allow to withdraw WINGS to the zero address', async () => {
        try {
            await exchange.withdrawWINGS(ZERO_ADDRESS, '1', {from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: withdraw to the zero address');
        }
    });

    it('doesn\'t allow to withdraw more WINGS than the contract possess', async () => {
        try {
            await exchange.withdrawWINGS(creator.address, WINGS_TOTAL_SUPPLY, {from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('ERC20: transfer amount exceeds balance');
        }
    });

    it('withdraw WINGS', async () => {
        // Destination address.
        const to = creator.address;

        // Expected values.
        const expectedExchangeWingsBalanceBefore = toWei('500');
        const expectedExchangeWingsBalanceAfter  = '0';

        // Amount of WINGS to withdraw.
        const amountToWithdraw = expectedExchangeWingsBalanceBefore;

        // Make sure that no tokens were lost during the exchanges.
        const expectedCreatorWingsBalanceAfter = WINGS_TOTAL_SUPPLY.toString(10);

        // Check WINGS balances before the withdrawal.
        const exchangeWingsBalanceBefore = toStr(await wingsToken.balanceOf.call(exchange.address));

        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // Withdraw WINGS.
        const txResult = await exchange.withdrawWINGS(to, amountToWithdraw, {from: creator.address});

        // Check WINGS balances after the withdrawal.
        const exchangeWingsBalanceAfter = toStr(await wingsToken.balanceOf.call(exchange.address));
        const creatorWingsBalanceAfter  = toStr(await wingsToken.balanceOf.call(creator.address));

        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);
        creatorWingsBalanceAfter.should.be.equal(expectedCreatorWingsBalanceAfter);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('WINGSWithdrawal');
        firstLog.args.to.should.be.equal(creator.address);
        toStr(firstLog.args.amount).should.be.equal(amountToWithdraw);
    });

    it('reserve amount is valid', async () => {
        const xfiReserveAmount_ = toStr(await xfiToken.reserveAmount.call());

        xfiReserveAmount_.should.be.equal(xfiReserveAmount);
    });

    it('total supply of XFI is valid', async () => {
        const expectedXfiTotalSupply = await calculateXfiTotalSupply(xfiToken, xfiTotalSupply);

        const xfiTotalSupply_ = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupply_.should.be.equal(expectedXfiTotalSupply);

        // Check the state total supply.

        xfiTotalSupply.persistent.should.be.equal(xfiTotalSupply_);
        xfiTotalSupply.vesting.should.be.equal('0');
        xfiTotalSupply.spentVested.should.be.equal('0');
    });

    after('stop the Test RPC', () => {
        testRpc.stop();
    });
});

/**
 * Calculate XFI total supply on a particular day.
 *
 * @param  {Object} token          XFI token instance.
 * @param  {Object} xfiTotalSupply XFI total supply object.
 * @return {String}                Expected XFI total supply.
 */
async function calculateXfiTotalSupply(token, xfiTotalSupply) {
    const vestingDurationDays   = Number(await token.VESTING_DURATION_DAYS.call());
    const vestingDaysSinceStart = Number(await token.vestingDaysSinceStart.call());

    return bigInt(convertAmountUsingRatio(xfiTotalSupply.vesting, vestingDurationDays, vestingDaysSinceStart))
        .plus(xfiTotalSupply.persistent)
        .minus(xfiTotalSupply.spentVested)
        .toString(10);
}

/**
 * Increase absolute XFI total supply.
 *
 * @param  {String} vestingXfiTotalSupply Absolute XFI total supply.
 * @param  {String} amount                 Original amount before conversion.
 * @return {String}                        New absolute XFI total supply.
 */
async function increaseXfiTotalSupply(token, vestingXfiTotalSupply, amount) {
    const vestingDurationDays   = Number(await token.VESTING_DURATION_DAYS.call());
    const vestingDaysSinceStart = Number(await token.vestingDaysSinceStart.call());

    return bigInt(vestingXfiTotalSupply)
        .plus(convertAmountUsingReverseRatio(amount, vestingDurationDays, vestingDaysSinceStart))
        .toString(10);
}
