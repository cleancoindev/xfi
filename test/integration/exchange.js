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
    const START_DATE                         = Math.floor((Date.now() / 1000) + 3600).toString();
    const WINGS_TOTAL_SUPPLY                 = toWei('100000000'); // 1e26
    const WINGS_PER_ETH                      = 100;
    const XFI_PER_ETH                        = 100;
    const UNISWAP_LIQUIDITY_POOL_WINGS_START = toWei('100');
    const UNISWAP_LIQUIDITY_POOL_ETH_START   = toWei('100');
    const EXCHANGE_WINGS_START               = '0';

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

    let wingsToken;
    let xfiToken;
    let uniswapRouter;
    let exchange;
    let absoluteXfiTotalSupply = '0';

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

        // Deploy of the Uniswap Router mock.
        const UniswapV2RouterJson = require('build/contracts/UniswapV2Router.json');
        const UniswapV2Router     = contract({abi: UniswapV2RouterJson.abi, unlinked_binary: UniswapV2RouterJson.bytecode});
        UniswapV2Router.setProvider(web3Provider);

        uniswapRouter = await UniswapV2Router.new(wingsToken.address, {from: creator.address});

        // Deploy of the Exchange.
        const ExchangeJson = require('build/contracts/Exchange.json');
        const Exchange     = contract({abi: ExchangeJson.abi, unlinked_binary: ExchangeJson.bytecode});
        Exchange.setProvider(web3Provider);

        exchange = await Exchange.new(wingsToken.address, xfiToken.address, uniswapRouter.address, {from: creator.address});
    });

    it('total supply of WINGS is valid', async () => {
        const wingsTotalSupply = toStr(await wingsToken.totalSupply.call());

        wingsTotalSupply.should.be.equal(WINGS_TOTAL_SUPPLY);
    });

    it('total supply of XFI is valid', async () => {
        const expectedXfiTotalSupply = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);

        const xfiTotalSupply = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupply.should.be.equal(expectedXfiTotalSupply);
    });

    it('the Exchange has correct addresses of tokens and Uniswap Router', async () => {
        const wingsTokenAddress    = await exchange.wingsToken.call();
        const xfiTokenAddress      = await exchange.xfiToken.call();
        const uniswapRouterAddress = await exchange.uniswapRouter.call();

        wingsTokenAddress.should.be.equal(wingsToken.address);
        xfiTokenAddress.should.be.equal(xfiToken.address);
        uniswapRouterAddress.should.be.equal(uniswapRouter.address);
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
        const amountToTransfer = toWei('200');

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

    it('fund the Uniswap Router with ETH and WINGS (required for imitation of a liquidity pool)', async () => {
        // Amounts to transfer to Uniswap for ETH-WINGS liquidity pool.
        const wingsAmountToTransfer = UNISWAP_LIQUIDITY_POOL_WINGS_START;
        const ethAmountToTransfer   = UNISWAP_LIQUIDITY_POOL_ETH_START;

        // Transfer WINGS tokens.
        await wingsToken.transfer(uniswapRouter.address, wingsAmountToTransfer, {from: creator.address});

        // Transfer ETH.
        await web3.eth.sendTransaction({
            from:  creator.address,
            to:    uniswapRouter.address,
            value: ethAmountToTransfer
        });

        // Check balances after the operations.
        const uniswapRouterWingsBalance = toStr(await wingsToken.balanceOf.call(uniswapRouter.address));
        const uniswapRouterEthBalance   = await web3.eth.getBalance(uniswapRouter.address);

        uniswapRouterWingsBalance.should.be.equal(wingsAmountToTransfer);
        uniswapRouterEthBalance.should.be.equal(uniswapRouterEthBalance);
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

    it('estimate amounts of swap ETH-XFI', async () => {
        const amountIn = toWei('1');

        const amounts = await exchange.estimateSwapETHForXFI.call(amountIn);

        const expectedEthIn  = amountIn;
        const expectedXfiOut = bigInt(amountIn)
            .times(WINGS_PER_ETH)
            .toString(10);

        const ethIn  = toStr(amounts[0]);
        const xfiOut = toStr(amounts[1]);

        ethIn.should.be.equal(expectedEthIn);
        xfiOut.should.be.equal(expectedXfiOut);
    });

    it('estimate amounts of swap WINGS-XFI per day', async () => {
        const vestingDurationDays = Number(await xfiToken.VESTING_DURATION_DAYS.call());
        const daysLeft            = Number(await xfiToken.daysLeft.call());

        const amountIn = toWei('100');

        const expectedAmountOutPerDay = bigInt(amountIn)
            .times(daysLeft)
            .divide(vestingDurationDays)
            .divide(vestingDurationDays)
            .toString(10);

        const amountPerDay = toStr(await exchange.estimateSwapWINGSForXFIPerDay.call(amountIn));

        amountPerDay.should.be.equal(expectedAmountOutPerDay);
    });

    it('estimate amounts of swap ETH-XFI per day', async () => {
        const vestingDurationDays = toStr(await xfiToken.VESTING_DURATION_DAYS.call());
        const daysLeft            = Number(await xfiToken.daysLeft.call());

        const amountIn = toWei('1');

        const expectedAmountOutPerDay = bigInt(amountIn)
            .times(WINGS_PER_ETH)
            .times(daysLeft)
            .divide(vestingDurationDays)
            .divide(vestingDurationDays)
            .toString(10);

        const amountPerDay = toStr(await exchange.estimateSwapETHForXFIPerDay.call(amountIn));

        amountPerDay.should.be.equal(expectedAmountOutPerDay);
    });

    it('doesn\'t allow to swap before the start date', async () => {
        try {
            await exchange.swapWINGSForXFI('1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping has not started');
        }
    });

    it('move time after start date', async () => {
        const now       = Math.floor(Date.now() / 1000);
        const startDate = await xfiToken.startDate.call();

        await moveTime(startDate - now + 1);

        const daysSinceStart = Number(await xfiToken.daysSinceStart.call());
        const daysLeft       = Number(await xfiToken.daysLeft.call());

        daysSinceStart.should.be.equal(0);
        daysLeft.should.be.equal(182);
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
        const daysSinceStart  = Number(await xfiToken.daysSinceStart.call());

        daysSinceStart.should.be.equal(0);

        // Amount of WINGS to swap.
        const amountIn = toWei('100');

        // Expected values before the swap.
        const expectedXfiTotalSupplyBefore       = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);
        const expectedUserWingsBalanceBefore     = toWei('200');
        const expectedUserXfiBalanceBefore       = '0';
        const expectedExchangeWingsBalanceBefore = EXCHANGE_WINGS_START;

        // Update the absolute XFI total supply.
        absoluteXfiTotalSupply = await increaseXfiTotalSupply(xfiToken, absoluteXfiTotalSupply, amountIn);

        // Expected values after the swap.
        const expectedXfiTotalSupplyAfter        = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);
        const expectedUserWingsBalanceAfter      = toWei('100');
        const expectedUserXfiBalanceAfter        = '0';
        const expectedExchangeWingsBalanceAfter  = toWei('100'); // 1e20

        // Balances check before the swap.
        const userWingsBalanceBefore     = toStr(await wingsToken.balanceOf.call(firstUser.address));
        const userXfiBalanceBefore       = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const exchangeWingsBalanceBefore = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userXfiBalanceBefore.should.be.equal(expectedUserXfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // XFI total supply check before the swap.
        const xfiTotalSupplyBefore = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyBefore.should.be.equal(expectedXfiTotalSupplyBefore);

        // Approve the Exchange to spend `amountIn` of WINGS tokens before the swap.
        await wingsToken.approve(exchange.address, amountIn, {from: firstUser.address});

        /* ▲ Before swap ▲ */

        // Swap WINGS for XFI.
        const txResult = await exchange.swapWINGSForXFI(amountIn, {from: firstUser.address});

        /* ▼ After swap ▼ */

        // XFI total supply check after the swap.
        const xfiTotalSupplyAfter = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyAfter.should.be.equal(expectedXfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = toStr(await wingsToken.balanceOf.call(firstUser.address));
        const userXfiBalanceAfter       = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const exchangeWingsBalanceAfter = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userXfiBalanceAfter.should.be.equal(expectedUserXfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapWINGSForXFI');
        firstLog.args.sender.should.be.equal(firstUser.address);
        toStr(firstLog.args.amountIn).should.be.equal(amountIn);
        toStr(firstLog.args.amountOut).should.be.equal(amountIn);
    });

    it('doesn\'t allow to swap for less than 182 XFI Wei', async () => {
        try {
            await exchange.swapETHForXFI('181', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: minimum XFI swap output amount is 182 * 10 ** -18');
        }
    });

    it('swap ETH-XFi (first user, first day)', async () => {
        const daysSinceStart  = Number(await xfiToken.daysSinceStart.call());

        daysSinceStart.should.be.equal(0);

        // Amount of ETH to swap.
        const amountIn = toWei('1');

        // Minimum amount of XFI tokens to receive.
        const amountOutMin = bigInt(amountIn)
            .multiply(XFI_PER_ETH)
            .toString(10);

        // Expected values before the swap.
        const expectedXfiTotalSupplyBefore       = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);
        const expectedUserWingsBalanceBefore     = toWei('100');
        const expectedUserXfiBalanceBefore       = '0';
        const expectedExchangeWingsBalanceBefore = toWei('100');

        // Update the absolute XFI total supply.
        absoluteXfiTotalSupply = await increaseXfiTotalSupply(xfiToken, absoluteXfiTotalSupply, amountOutMin);

        // Expected values after the swap.
        const expectedXfiTotalSupplyAfter        = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);
        const expectedUserWingsBalanceAfter      = toWei('100');
        const expectedUserXfiBalanceAfter        = '0';
        const expectedExchangeWingsBalanceAfter  = toWei('200');

        // Balances check before the swap.
        const userWingsBalanceBefore     = toStr(await wingsToken.balanceOf.call(firstUser.address));
        const userXfiBalanceBefore       = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const exchangeWingsBalanceBefore = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userXfiBalanceBefore.should.be.equal(expectedUserXfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // XFI total supply check before the swap.
        const xfiTotalSupplyBefore = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyBefore.should.be.equal(expectedXfiTotalSupplyBefore);

        // Get user ETH balance before the swap.
        const userEthBalanceBefore = await web3.eth.getBalance(firstUser.address);

        /* ▲ Before swap ▲ */

        // Swap ETH for XFI.
        const txResult = await exchange.swapETHForXFI(amountOutMin, {from: firstUser.address, value: amountIn});

        /* ▼ After swap ▼ */

        // Calculate transaction cost.
        const gasPrice = await web3.eth.getGasPrice();

        const txCost = bigInt(gasPrice)
            .multiply(txResult.receipt.gasUsed)
            .toString(10);

        // Expected user ETH balance after the swap.
        const expectedUserEthBalanceAfter = bigInt(userEthBalanceBefore)
            .minus(amountIn)
            .minus(txCost)
            .toString(10);

        // Check user ETH balance after the swap.
        const userEthBalanceAfter = await web3.eth.getBalance(firstUser.address);

        userEthBalanceAfter.should.be.equal(expectedUserEthBalanceAfter);

        // XFI total supply check after the swap.
        const xfiTotalSupplyAfter = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyAfter.should.be.equal(expectedXfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = toStr(await wingsToken.balanceOf.call(firstUser.address));
        const userXfiBalanceAfter       = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const exchangeWingsBalanceAfter = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userXfiBalanceAfter.should.be.equal(expectedUserXfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapETHForXFI');
        firstLog.args.sender.should.be.equal(firstUser.address);
        toStr(firstLog.args.amountIn).should.be.equal(amountIn);
        toStr(firstLog.args.amountOut).should.be.equal(amountOutMin);
    });

    it('move time one day in the future', async () => {
        await moveTime(ONE_DAY);
    });

    it('check vested balance of the user that swapped on the first day', async () => {
        const expectedBalance              = toStr(await xfiToken.convertAmountUsingRatio.call(toWei('200')));
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
        const vestingDurationDays = Number(await xfiToken.VESTING_DURATION_DAYS.call());
        const daysSinceStart      = Number(await xfiToken.daysSinceStart.call());

        daysSinceStart.should.be.equal(1);

        // Amount of WINGS to swap.
        const amountIn = toWei('100');

        // Expected XFI amount to receive after the vesting end.
        const expectedAmountOut = convertAmountUsingReverseRatio(amountIn, vestingDurationDays, daysSinceStart);

        // Expected values before the swap.
        const expectedXfiTotalSupplyBefore       = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);
        const expectedUserWingsBalanceBefore     = toWei('100');
        const expectedUserXfiBalanceBefore       = convertAmountUsingRatio(toWei('200'), vestingDurationDays, daysSinceStart);
        const expectedExchangeWingsBalanceBefore = toWei('200');

        // Update the absolute XFI total supply.
        absoluteXfiTotalSupply = await increaseXfiTotalSupply(xfiToken, absoluteXfiTotalSupply, amountIn);

        // Expected values after the swap.
        const expectedXfiTotalSupplyAfter        = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);
        const expectedUserWingsBalanceAfter      = '0';
        const expectedUserXfiBalanceAfter        = bigInt(expectedUserXfiBalanceBefore)
            .plus(convertAmountUsingRatio(expectedAmountOut, vestingDurationDays, daysSinceStart))
            .toString(10);
        const expectedExchangeWingsBalanceAfter  = toWei('300');

        // Balances check before the swap.
        const userWingsBalanceBefore     = toStr(await wingsToken.balanceOf.call(firstUser.address));
        const userXfiBalanceBefore       = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const exchangeWingsBalanceBefore = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userXfiBalanceBefore.should.be.equal(expectedUserXfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // XFI total supply check before the swap.
        const xfiTotalSupplyBefore = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyBefore.should.be.equal(expectedXfiTotalSupplyBefore);

        // Approve the Exchange to spend `amountIn` of WINGS tokens before the swap.
        await wingsToken.approve(exchange.address, amountIn, {from: firstUser.address});

        /* ▲ Before swap ▲ */

        // Swap WINGS for XFI.
        const txResult = await exchange.swapWINGSForXFI(amountIn, {from: firstUser.address});

        /* ▼ After swap ▼ */

        // XFI total supply check after the swap.
        const xfiTotalSupplyAfter = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyAfter.should.be.equal(expectedXfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = toStr(await wingsToken.balanceOf.call(firstUser.address));
        const userXfiBalanceAfter       = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const exchangeWingsBalanceAfter = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userXfiBalanceAfter.should.be.equal(expectedUserXfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapWINGSForXFI');
        firstLog.args.sender.should.be.equal(firstUser.address);
        toStr(firstLog.args.amountIn).should.be.equal(amountIn);
        toStr(firstLog.args.amountOut).should.be.equal(expectedAmountOut);
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

        const amount = toWei('1');

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

        // Update absolute XFI total supply.
        absoluteXfiTotalSupply = bigInt(absoluteXfiTotalSupply)
            .minus(amountToBurn)
            .toString(10);
    });

    it('swap WINGS-XFI (second user, second day)', async () => {
        const vestingDuration = Number(await xfiToken.VESTING_DURATION.call()) / ONE_DAY;
        const daysSinceStart  = Number(await xfiToken.daysSinceStart.call());

        daysSinceStart.should.be.equal(1);

        // Amount of WINGS to swap.
        const amountIn = toWei('200');

        // Expected XFI amount to receive after the vesting end.
        const expectedAmountOut = convertAmountUsingReverseRatio(amountIn, vestingDuration, daysSinceStart);

        // Expected values before the swap.
        const expectedXfiTotalSupplyBefore       = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);
        const expectedUserWingsBalanceBefore     = toWei('200');
        const expectedUserXfiBalanceBefore       = '0';
        const expectedExchangeWingsBalanceBefore = toWei('300');

        // Update the absolute XFI total supply.
        absoluteXfiTotalSupply = await increaseXfiTotalSupply(xfiToken, absoluteXfiTotalSupply, amountIn);

        // Expected values after the swap.
        const expectedXfiTotalSupplyAfter        = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);
        const expectedUserWingsBalanceAfter      = '0';
        const expectedUserXfiBalanceAfter        = bigInt(expectedUserXfiBalanceBefore)
            .plus(convertAmountUsingRatio(expectedAmountOut, vestingDuration, daysSinceStart))
            .toString(10);
        const expectedExchangeWingsBalanceAfter  = toWei('500');

        // Balances check before the swap.
        const userWingsBalanceBefore     = toStr(await wingsToken.balanceOf.call(secondUser.address));
        const userXfiBalanceBefore       = toStr(await xfiToken.balanceOf.call(secondUser.address));
        const exchangeWingsBalanceBefore = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userXfiBalanceBefore.should.be.equal(expectedUserXfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // XFI total supply check before the swap.
        const xfiTotalSupplyBefore = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyBefore.should.be.equal(expectedXfiTotalSupplyBefore);

        // Approve the Exchange to spend `amountIn` of WINGS tokens before the swap.
        await wingsToken.approve(exchange.address, amountIn, {from: secondUser.address});

        /* ▲ Before swap ▲ */

        // Swap WINGS for XFI.
        const txResult = await exchange.swapWINGSForXFI(amountIn, {from: secondUser.address});

        /* ▼ After swap ▼ */

        // XFI total supply check after the swap.
        const xfiTotalSupplyAfter = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyAfter.should.be.equal(expectedXfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = toStr(await wingsToken.balanceOf.call(secondUser.address));
        const userXfiBalanceAfter       = toStr(await xfiToken.balanceOf.call(secondUser.address));
        const exchangeWingsBalanceAfter = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userXfiBalanceAfter.should.be.equal(expectedUserXfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapWINGSForXFI');
        firstLog.args.sender.should.be.equal(secondUser.address);
        toStr(firstLog.args.amountIn).should.be.equal(amountIn);
        toStr(firstLog.args.amountOut).should.be.equal(expectedAmountOut);
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

    it('doesn\'t allow to swap ETH-XFI (swapping is stopped)', async () => {
        try {
            await exchange.swapETHForXFI('1', {from: firstUser.address});

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

    it('move time after deadline', async () => {
        const now             = Math.floor(Date.now() / 1000);
        const vestingDeadline = await xfiToken.vestingDeadline.call();

        await moveTime(vestingDeadline - now + 1);
    });

    it('check first user\'s balance', async () => {
        const vestingDuration = Number(await xfiToken.VESTING_DURATION.call()) / ONE_DAY;

        const firstUserBalance              = toStr(await xfiToken.balanceOf.call(firstUser.address));
        const firstUserTotalVestedBalance   = toStr(await xfiToken.totalVestedBalanceOf.call(firstUser.address));
        const firstUserUnspentVestedBalance = toStr(await xfiToken.unspentVestedBalanceOf.call(firstUser.address));
        const firstUserSpentVestedBalance   = toStr(await xfiToken.spentVestedBalanceOf.call(firstUser.address));

        const expectedFirstUserBalance              = bigInt(convertAmountUsingReverseRatio(toWei('200'), vestingDuration, 0))
            .plus(convertAmountUsingReverseRatio(toWei('100'), vestingDuration, 1))
            .minus(toWei('1'))
            .toString(10);
        const expectedFirstUserTotalVestedBalance   = bigInt(convertAmountUsingReverseRatio(toWei('200'), vestingDuration, 0))
            .plus(convertAmountUsingReverseRatio(toWei('100'), vestingDuration, 1))
            .toString(10);
        const expectedFirstUserUnspentVestedBalance = bigInt(convertAmountUsingReverseRatio(toWei('200'), vestingDuration, 0))
            .plus(convertAmountUsingReverseRatio(toWei('100'), vestingDuration, 1))
            .minus(toWei('1'))
            .toString(10);
        const expectedFirstUserSpentVestedBalance   = toWei('1');

        firstUserBalance.should.be.equal(expectedFirstUserBalance);
        firstUserTotalVestedBalance.should.be.equal(expectedFirstUserTotalVestedBalance);
        firstUserUnspentVestedBalance.should.be.equal(expectedFirstUserUnspentVestedBalance);
        firstUserSpentVestedBalance.should.be.equal(expectedFirstUserSpentVestedBalance);
    });

    it('check second user\'s balance', async () => {
        const vestingDuration = Number(await xfiToken.VESTING_DURATION.call()) / ONE_DAY;

        const secondUserBalance              = toStr(await xfiToken.balanceOf.call(secondUser.address));
        const secondUserTotalVestedBalance   = toStr(await xfiToken.totalVestedBalanceOf.call(secondUser.address));
        const secondUserUnspentVestedBalance = toStr(await xfiToken.unspentVestedBalanceOf.call(secondUser.address));
        const secondUserSpentVestedBalance   = toStr(await xfiToken.spentVestedBalanceOf.call(secondUser.address));

        const expectedSecondUserBalance              = bigInt(convertAmountUsingReverseRatio(toWei('200'), vestingDuration, 1))
            .toString(10);
        const expectedSecondUserTotalVestedBalance   = bigInt(convertAmountUsingReverseRatio(toWei('200'), vestingDuration, 1))
            .toString(10);
        const expectedSecondUserUnspentVestedBalance = bigInt(convertAmountUsingReverseRatio(toWei('200'), vestingDuration, 1))
            .toString(10);
        const expectedSecondUserSpentVestedBalance   = '0';

        secondUserBalance.should.be.equal(expectedSecondUserBalance);
        secondUserTotalVestedBalance.should.be.equal(expectedSecondUserTotalVestedBalance);
        secondUserUnspentVestedBalance.should.be.equal(expectedSecondUserUnspentVestedBalance);
        secondUserSpentVestedBalance.should.be.equal(expectedSecondUserSpentVestedBalance);
    });

    it('doesn\'t allow to swap WINGS afer deadline', async () => {
        try {
            await exchange.swapWINGSForXFI('1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping has ended');
        }
    });

    it('doesn\'t allow to swap ETH afer deadline', async () => {
        try {
            await exchange.swapETHForXFI('1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping has ended');
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

        // Amount of WINGS to withdraw.
        const amountToWithdraw = toWei('500');

        // Expected values.
        const expectedExchangeWingsBalanceBefore = toWei('500');
        const expectedExchangeWingsBalanceAfter  = '0';

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

    it('total supply of XFI is valid', async () => {
        const expectedXfiTotalSupply = await calculateXfiTotalSupply(xfiToken, absoluteXfiTotalSupply);

        const xfiTotalSupply = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupply.should.be.equal(expectedXfiTotalSupply);

        /**
         * NOTE
         *
         * Summary
         *
         * We made 5 swaps with total amount of around 500 XFI.
         *
         * The result is 498.351648351648351647 XFI.
         * The difference is 1.648351648351648353 XFI (0.33%).
         *
         * P.S. The difference is 0.33% not because of the remainder, but
         * because 2 swaps were made on the second day, resulting in less amount
         * of tokens vested by the end of the vesting period.
         */
    });

    after('stop the Test RPC', () => {
        testRpc.stop();
    });
});

/**
 * Calculate XFI total supply on a particular day.
 *
 * @param  {Object} token                  XFI token instance.
 * @param  {String} absoluteXfiTotalSupply Absolute XFI total supply.
 * @return {String}                        Expected XFI total supply.
 */
async function calculateXfiTotalSupply(token, absoluteXfiTotalSupply) {
    const vestingDurationDays = Number(await token.VESTING_DURATION_DAYS.call());
    const daysSinceStart      = Number(await token.daysSinceStart.call());

    return convertAmountUsingRatio(absoluteXfiTotalSupply, vestingDurationDays, daysSinceStart);
}

/**
 * Increase absolute XFI total supply.
 *
 * @param  {String} absoluteXfiTotalSupply Absolute XFI total supply.
 * @param  {String} amount                 Original amount before conversion.
 * @return {String}                        New absolute XFI total supply.
 */
async function increaseXfiTotalSupply(token, absoluteXfiTotalSupply, amount) {
    const vestingDurationDays = Number(await token.VESTING_DURATION_DAYS.call());
    const daysSinceStart      = Number(await token.daysSinceStart.call());

    return bigInt(absoluteXfiTotalSupply)
        .plus(convertAmountUsingReverseRatio(amount, vestingDurationDays, daysSinceStart))
        .toString(10);
}
