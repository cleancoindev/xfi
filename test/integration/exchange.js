/* global Web3 contract */

/**
 * Integration test which covers functionality of Ethereum DFI Exchange.
 *
 * @module test/integration/exchange
 */

'use strict';

const bigInt  = require('big-integer');
const TestRpc = require('test/helpers/test-rpc');

const TEST_RPC_PORT = +process.env.TEST_RPC_PORT || 9545;
const ZERO_ADDRESS  = '0x' + '0'.repeat(40);

const web3 = new Web3(`http://localhost:${TEST_RPC_PORT}`);

const {toWei} = web3.utils;

describe('Ethereum DFI Exchange', () => {
    let wingsToken;
    let dfiToken;
    let uniswapRouter;
    let exchange;

    const creator       = web3.eth.accounts.create();
    const newOwner      = web3.eth.accounts.create();
    const tempOwner     = web3.eth.accounts.create();
    const user          = web3.eth.accounts.create();
    const maliciousUser = web3.eth.accounts.create();

    const testRpc = TestRpc({
        accounts: [
            {
                balance: '1000000000000000000000000', // 1 million ETH
                secretKey: creator.privateKey
            },
            {
                balance: '10000000000000000000', // 10 ETH
                secretKey: newOwner.privateKey
            },
            {
                balance: '10000000000000000000', // 10 ETH
                secretKey: tempOwner.privateKey
            },
            {
                balance: '10000000000000000000', // 10 ETH
                secretKey: user.privateKey
            },
            {
                balance: '10000000000000000000', // 10 ETH
                secretKey: maliciousUser.privateKey
            }
        ],
        locked: false
    });

    const WINGS_TOTAL_SUPPLY = toWei('100000000', 'ether').toString(10); // 1e26
    const WINGS_PER_ETH      = 100;
    const DFI_PER_ETH        = 100;

    const USER_WINGS                   = toWei('100', 'ether').toString(10);
    const UNISWAP_LIQUIDITY_POOL_WINGS = toWei('100', 'ether').toString(10);
    const UNISWAP_LIQUIDITY_POOL_ETH   = toWei('100', 'ether').toString(10);

    before('launch test RPC', async () => {
        await testRpc.start(TEST_RPC_PORT);
    });

    before('deploy', async () => {
        const web3Provider = new Web3.providers.HttpProvider(`http://localhost:${TEST_RPC_PORT}`);

        // Deploy of the Wings token mock.
        const WingsTokenJson = require('build/contracts/WingsToken.json');
        const WingsToken     = contract({abi: WingsTokenJson.abi, unlinked_binary: WingsTokenJson.bytecode});
        WingsToken.setProvider(web3Provider);

        wingsToken = await WingsToken.new({from: creator.address});

        // Deploy of the DFI token.
        const DfiTokenJson = require('build/contracts/DFIToken.json');
        const DfiToken     = contract({abi: DfiTokenJson.abi, unlinked_binary: DfiTokenJson.bytecode});
        DfiToken.setProvider(web3Provider);

        dfiToken = await DfiToken.new({from: creator.address});

        // Deploy of the Uniswap Router mock.
        const UniswapV2RouterJson = require('build/contracts/UniswapV2Router.json');
        const UniswapV2Router     = contract({abi: UniswapV2RouterJson.abi, unlinked_binary: UniswapV2RouterJson.bytecode});
        UniswapV2Router.setProvider(web3Provider);

        uniswapRouter = await UniswapV2Router.new(wingsToken.address, {from: creator.address});

        // Deploy of the Exchange.
        const ExchangeJson = require('build/contracts/Exchange.json');
        const Exchange     = contract({abi: ExchangeJson.abi, unlinked_binary: ExchangeJson.bytecode});
        Exchange.setProvider(web3Provider);

        exchange = await Exchange.new(wingsToken.address, dfiToken.address, uniswapRouter.address, {from: creator.address});
    });

    it('total supply of WINGS is valid', async () => {
        const wingsTotalSupply = (await wingsToken.totalSupply.call()).toString(10);

        wingsTotalSupply.should.be.equal(WINGS_TOTAL_SUPPLY);
    });

    it('total supply of DFI is zero', async () => {
        const dfiTotalSupply = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupply.should.be.equal('0');
    });

    it('the Exchange has correct addresses of tokens and Uniswap Router', async () => {
        const wingsTokenAddress    = await exchange.wingsToken.call();
        const dfiTokenAddress      = await exchange.dfiToken.call();
        const uniswapRouterAddress = await exchange.uniswapRouter.call();

        wingsTokenAddress.should.be.equal(wingsToken.address);
        dfiTokenAddress.should.be.equal(dfiToken.address);
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
        const minterRole = await dfiToken.MINTER_ROLE.call();

        await dfiToken.grantRole(minterRole, exchange.address, {from: creator.address});

        const roleMemberCount = (await dfiToken.getRoleMemberCount.call(minterRole)).toNumber();
        const minterIsMinter  = await dfiToken.hasRole.call(minterRole, exchange.address);
        const roleMember      = await dfiToken.getRoleMember.call(minterRole, 0);

        roleMemberCount.should.be.equal(1);
        minterIsMinter.should.be.true;
        roleMember.should.be.equal(exchange.address);
    });

    it('transfer first user some WINGS tokens', async () => {
        const amountToTransfer = USER_WINGS;

        await wingsToken.transfer(user.address, amountToTransfer, {from: creator.address});

        const userBalance = (await wingsToken.balanceOf.call(user.address)).toString(10);

        userBalance.should.be.equal(amountToTransfer);
    });

    it('fund the Uniswap Router with ETH and WINGS (required for imitation of a liquidity pool)', async () => {
        const wingsAmountToTransfer = UNISWAP_LIQUIDITY_POOL_WINGS;
        const ethAmountToTransfer   = UNISWAP_LIQUIDITY_POOL_ETH;

        await wingsToken.transfer(uniswapRouter.address, wingsAmountToTransfer, {from: creator.address});

        await web3.eth.sendTransaction({
            from:  creator.address,
            to:    uniswapRouter.address,
            value: ethAmountToTransfer
        });

        const uniswapRouterWingsBalance = (await wingsToken.balanceOf.call(uniswapRouter.address)).toString(10);
        const uniswapRouterEthBalance   = await web3.eth.getBalance(uniswapRouter.address);

        uniswapRouterWingsBalance.should.be.equal(wingsAmountToTransfer);
        uniswapRouterEthBalance.should.be.equal(uniswapRouterEthBalance);
    });

    it('estimate amounts of swap WINGS-DFI', async () => {
        const amountIn = toWei('100', 'ether').toString(10);

        const amounts = await exchange.estimateSwapWINGSForDFI.call(amountIn);

        const expectedWingsIn = amountIn;
        const expectedDfiOut  = amountIn;

        const wingsIn = amounts[0].toString(10);
        const dfiOut  = amounts[1].toString(10);

        wingsIn.should.be.equal(expectedWingsIn);
        dfiOut.should.be.equal(expectedDfiOut);
    });

    it('estimate amounts of swap ETH-DFI', async () => {
        const amountIn = toWei('1', 'ether').toString(10);

        const amounts = await exchange.estimateSwapETHForDFI.call(amountIn);

        const expectedEthIn  = amountIn;
        const expectedDfiOut = (amountIn * WINGS_PER_ETH).toString(10);

        const ethIn  = amounts[0].toString(10);
        const dfiOut = amounts[1].toString(10);

        ethIn.should.be.equal(expectedEthIn);
        dfiOut.should.be.equal(expectedDfiOut);
    });

    it('estimate amounts of swap DFI-WINGS', async () => {
        const amountIn = toWei('100', 'ether').toString(10);

        const amounts = await exchange.estimateSwapDFIForWINGS.call(amountIn);

        const expectedDfiIn    = amountIn;
        const expectedWingsOut = amountIn;

        const dfiIn    = amounts[0].toString(10);
        const wingsOut = amounts[1].toString(10);

        dfiIn.should.be.equal(expectedDfiIn);
        wingsOut.should.be.equal(expectedWingsOut);
    });

    it('estimate amounts of swap DFI-ETH', async () => {
        const amountIn = toWei('100', 'ether').toString(10);

        const amounts = await exchange.estimateSwapDFIForETH.call(amountIn);

        const expectedDfiIn  = amountIn;
        const expectedEthOut = (amountIn / WINGS_PER_ETH).toString(10);

        const dfiIn  = amounts[0].toString(10);
        const ethOut = amounts[1].toString(10);

        dfiIn.should.be.equal(expectedDfiIn);
        ethOut.should.be.equal(expectedEthOut);
    });

    it('swap WINGS-DFI', async () => {
        // Amount of WINGS to swap.
        const amountIn = toWei('100', 'ether').toString(10);

        // Expected values before the swap.
        const expectedDfiTotalSupplyBefore       = '0';
        const expectedUserWingsBalanceBefore     = toWei('100', 'ether').toString(10);
        const expectedUserDfiBalanceBefore       = '0';
        const expectedExchangeWingsBalanceBefore = '0';

        // Expected values after the swap.
        const expectedDfiTotalSupplyAfter        = toWei('100', 'ether').toString(10);
        const expectedUserWingsBalanceAfter      = '0';
        const expectedUserDfiBalanceAfter        = toWei('100', 'ether').toString(10);
        const expectedExchangeWingsBalanceAfter  = toWei('100', 'ether').toString(10);

        // Balances check before the swap.
        const userWingsBalanceBefore     = (await wingsToken.balanceOf.call(user.address)).toString(10);
        const userDfiBalanceBefore       = (await dfiToken.balanceOf.call(user.address)).toString(10);
        const exchangeWingsBalanceBefore = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userDfiBalanceBefore.should.be.equal(expectedUserDfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // DFI total supply check before the swap.
        const dfiTotalSupplyBefore = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupplyBefore.should.be.equal(expectedDfiTotalSupplyBefore);

        // Approve the Exchange to spend `amountIn` of WINGS tokens before the swap.
        await wingsToken.approve(exchange.address, amountIn, {from: user.address});

        // Swap WINGS for DFI.
        await exchange.swapWINGSForDFI(amountIn, {from: user.address});

        // DFI total supply check after the swap.
        const dfiTotalSupplyAfter = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupplyAfter.should.be.equal(expectedDfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = (await wingsToken.balanceOf.call(user.address)).toString(10);
        const userDfiBalanceAfter       = (await dfiToken.balanceOf.call(user.address)).toString(10);
        const exchangeWingsBalanceAfter = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userDfiBalanceAfter.should.be.equal(expectedUserDfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);
    });

    it('swap ETH-DFI', async () => {
        // Amount of ETH to swap.
        const amountIn = toWei('1', 'ether').toString(10);

        // Minimum amount of DFI tokens to receive.
        const amountOutMin = (amountIn * DFI_PER_ETH).toString(10);

        // Expected values before the swap.
        const expectedDfiTotalSupplyBefore       = toWei('100', 'ether').toString(10);
        const expectedUserWingsBalanceBefore     = '0';
        const expectedUserDfiBalanceBefore       = toWei('100', 'ether').toString(10);
        const expectedExchangeWingsBalanceBefore = toWei('100', 'ether').toString(10);

        // Expected values after the swap.
        const expectedDfiTotalSupplyAfter        = toWei('200', 'ether').toString(10);
        const expectedUserWingsBalanceAfter      = '0';
        const expectedUserDfiBalanceAfter        = toWei('200', 'ether').toString(10);
        const expectedExchangeWingsBalanceAfter  = toWei('200', 'ether').toString(10);

        // Balances check before the swap.
        const userWingsBalanceBefore     = (await wingsToken.balanceOf.call(user.address)).toString(10);
        const userDfiBalanceBefore       = (await dfiToken.balanceOf.call(user.address)).toString(10);
        const exchangeWingsBalanceBefore = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userDfiBalanceBefore.should.be.equal(expectedUserDfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // DFI total supply check before the swap.
        const dfiTotalSupplyBefore = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupplyBefore.should.be.equal(expectedDfiTotalSupplyBefore);

        // Swap ETH for DFI.
        await exchange.swapETHForDFI(amountOutMin, {from: user.address, value: amountIn});

        // DFI total supply check after the swap.
        const dfiTotalSupplyAfter = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupplyAfter.should.be.equal(expectedDfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = (await wingsToken.balanceOf.call(user.address)).toString(10);
        const userDfiBalanceAfter       = (await dfiToken.balanceOf.call(user.address)).toString(10);
        const exchangeWingsBalanceAfter = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userDfiBalanceAfter.should.be.equal(expectedUserDfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);
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
        const swappingIsStopped = await exchange.isSwappingStopped.call();

        swappingIsStopped.should.be.false;

        const txResult = await exchange.stopSwaps({from: creator.address});

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

    it('doesn\'t allow to swap WINGS-DFI (swapping is stopped)', async () => {
        try {
            await exchange.swapWINGSForDFI('1', {from: user.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping is stopped');
        }
    });

    it('doesn\'t allow to swap ETH-DFI (swapping is stopped)', async () => {
        try {
            await exchange.swapETHForDFI('1', {from: user.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping is stopped');
        }
    });

    it('doesn\'t allow to swap DFI-WINGS (swapping is stopped)', async () => {
        try {
            await exchange.swapDFIForWINGS('1', {from: user.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping is stopped');
        }
    });

    it('doesn\'t allow to swap DFI-ETH (swapping is stopped)', async () => {
        try {
            await exchange.swapDFIForETH('1', '1', {from: user.address});

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
        const swappingIsStopped = await exchange.isSwappingStopped.call();

        swappingIsStopped.should.be.true;

        const txResult = await exchange.startSwaps({from: creator.address});

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

    it('swap DFI-WINGS', async () => {
        // Amount of DFI to swap.
        const amountIn = toWei('100', 'ether').toString(10);

        // Expected values before the swap.
        const expectedDfiTotalSupplyBefore       = toWei('200', 'ether').toString(10);
        const expectedUserWingsBalanceBefore     = '0';
        const expectedUserDfiBalanceBefore       = toWei('200', 'ether').toString(10);
        const expectedExchangeWingsBalanceBefore = toWei('200', 'ether').toString(10);

        // Expected values after the swap.
        const expectedDfiTotalSupplyAfter        = toWei('100', 'ether').toString(10);
        const expectedUserWingsBalanceAfter      = toWei('100', 'ether').toString(10);
        const expectedUserDfiBalanceAfter        = toWei('100', 'ether').toString(10);
        const expectedExchangeWingsBalanceAfter  = toWei('100', 'ether').toString(10);

        // DFI total supply check before the swap.
        const dfiTotalSupplyBefore = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupplyBefore.should.be.equal(expectedDfiTotalSupplyBefore);

        // Balances check before the swap.
        const userWingsBalanceBefore     = (await wingsToken.balanceOf.call(user.address)).toString(10);
        const userDfiBalanceBefore       = (await dfiToken.balanceOf.call(user.address)).toString(10);
        const exchangeWingsBalanceBefore = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userDfiBalanceBefore.should.be.equal(expectedUserDfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // Approve the Exchange to spend `amountIn` of DFI tokens before the swap.
        await dfiToken.approve(exchange.address, amountIn, {from: user.address});

        // Swap DFI for WINGS.
        await exchange.swapDFIForWINGS(amountIn, {from: user.address});

        // DFI total supply check after the swap.
        const dfiTotalSupplyAfter = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupplyAfter.should.be.equal(expectedDfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = (await wingsToken.balanceOf.call(user.address)).toString(10);
        const userDfiBalanceAfter       = (await dfiToken.balanceOf.call(user.address)).toString(10);
        const exchangeWingsBalanceAfter = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userDfiBalanceAfter.should.be.equal(expectedUserDfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);
    });

    it('swap DFI-ETH', async () => {
        // Amount of ETH to swap.
        const amountIn = bigInt(100).multiply(1e18).toString(10);

        // Minimum amount of DFI tokens to receive.
        const amountOutMin = bigInt(100 * DFI_PER_ETH).multiply(1e18).toString(10);

        // Expected values before the swap.
        const expectedDfiTotalSupplyBefore       = toWei('100', 'ether').toString(10);
        const expectedUserWingsBalanceBefore     = toWei('100', 'ether').toString(10);
        const expectedUserDfiBalanceBefore       = toWei('100', 'ether').toString(10);
        const expectedExchangeWingsBalanceBefore = toWei('100', 'ether').toString(10);

        // Expected values after the swap.
        const expectedDfiTotalSupplyAfter        = '0';
        const expectedUserWingsBalanceAfter      = toWei('100', 'ether').toString(10);
        const expectedUserDfiBalanceAfter        = '0';
        const expectedExchangeWingsBalanceAfter  = '0';

        // DFI total supply check before the swap.
        const dfiTotalSupplyBefore = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupplyBefore.should.be.equal(expectedDfiTotalSupplyBefore);

        // Balances check before the swap.
        const userWingsBalanceBefore     = (await wingsToken.balanceOf.call(user.address)).toString(10);
        const userDfiBalanceBefore       = (await dfiToken.balanceOf.call(user.address)).toString(10);
        const exchangeWingsBalanceBefore = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userDfiBalanceBefore.should.be.equal(expectedUserDfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // Approve the Exchange to spend `amountIn` of DFI tokens before the swap.
        await dfiToken.approve(exchange.address, amountIn, {from: user.address});

        // Swap DFI for ETH.
        await exchange.swapDFIForETH(amountIn, amountOutMin, {from: user.address});

        // DFI total supply check after the swap.
        const dfiTotalSupplyAfter = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupplyAfter.should.be.equal(expectedDfiTotalSupplyAfter);

        // Balances check after the swap.
        const userWingsBalanceAfter     = (await wingsToken.balanceOf.call(user.address)).toString(10);
        const userDfiBalanceAfter       = (await dfiToken.balanceOf.call(user.address)).toString(10);
        const exchangeWingsBalanceAfter = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        userWingsBalanceAfter.should.be.equal(expectedUserWingsBalanceAfter);
        userDfiBalanceAfter.should.be.equal(expectedUserDfiBalanceAfter);
        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);
    });

    it('doesn\'t allow ex-owner to withdraw WINGS without owner access role', async () => {
        try {
            await exchange.startSwaps({from: tempOwner.address});

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

    it('fund the Exchange with WINGS to test WINGS withdrawal', async () => {
        const amountToTransfer = toWei('100', 'ether');

        await wingsToken.transfer(exchange.address, amountToTransfer, {from: creator.address});
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
        const amountToWithdraw = toWei('100', 'ether');

        const expectedExchangeWingsBalanceBefore = toWei('100', 'ether').toString(10);
        const expectedExchangeWingsBalanceAfter  = '0';

        // Make sure that no tokens were lost during the exchanges.
        const expectedCreatorWingsBalanceAfter = bigInt(WINGS_TOTAL_SUPPLY)
            .minus(UNISWAP_LIQUIDITY_POOL_WINGS)
            .minus(USER_WINGS)
            .toString(10);

        const exchangeWingsBalanceBefore = (await wingsToken.balanceOf.call(exchange.address)).toString(10);

        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        await exchange.withdrawWINGS(creator.address, amountToWithdraw, {from: creator.address});

        const exchangeWingsBalanceAfter = (await wingsToken.balanceOf.call(exchange.address)).toString(10);
        const creatorWingsBalanceAfter  = (await wingsToken.balanceOf.call(creator.address)).toString(10);

        exchangeWingsBalanceAfter.should.be.equal(expectedExchangeWingsBalanceAfter);
        creatorWingsBalanceAfter.should.be.equal(expectedCreatorWingsBalanceAfter);
    });

    it('total supply of DFI is zero (all tokens were burn)', async () => {
        const dfiTotalSupply = (await dfiToken.totalSupply.call()).toString(10);

        dfiTotalSupply.should.be.equal('0');
    });

    after('stop test RPC', () => {
        testRpc.stop();
    });
});
