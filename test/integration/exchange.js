/* global Web3 contract helpers TestRpc */

/**
 * Integration test which covers functionality of Ethereum XFI Exchange.
 *
 * @module test/integration/exchange
 */

'use strict';

const bigInt = require('big-integer');

const TEST_RPC_PORT = +process.env.TEST_RPC_PORT || 9545;

const web3 = new Web3(`http://localhost:${TEST_RPC_PORT}`);

const increaseTime = addSeconds => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: "2.0", 
            method: "evm_increaseTime", 
            params: [addSeconds], id: 0
        }, (err, result) => {
            err? reject(err) : resolve(result);   
        });
    });
}

const {toStr, toWei} = helpers;
const {ZERO_ADDRESS} = helpers;

describe('Ethereum XFI Exchange', () => {
    const WINGS_TOTAL_SUPPLY                 = toWei('100000000'); // 1e26
    const WINGS_PER_ETH                      = 100;
    const XFI_PER_ETH                        = 100;
    const USER_WINGS_START                   = toWei('100');
    const USER_XFI_START                     = '0';
    const XFI_TOTAL_SUPPLY_START             = '0';
    const UNISWAP_LIQUIDITY_POOL_WINGS_START = toWei('100');
    const UNISWAP_LIQUIDITY_POOL_ETH_START   = toWei('100');
    const EXCHANGE_WINGS_START               = '0';

    const creator       = web3.eth.accounts.create();
    const newOwner      = web3.eth.accounts.create();
    const tempOwner     = web3.eth.accounts.create();
    const user          = web3.eth.accounts.create();
    const maliciousUser = web3.eth.accounts.create();

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
                secretKey: user.privateKey
            },
            {
                balance: toWei('10'),
                secretKey: maliciousUser.privateKey
            }
        ],
        locked: false
    });

    const now       = Math.floor(new Date().getTime() / 1000);
    const sixMonths = 15780000;
    const deadline  = (now + sixMonths).toString();

    let wingsToken;
    let xfiToken;
    let uniswapRouter;
    let exchange;

    before('launch the Test RPC', async () => {
        await testRpc.start(TEST_RPC_PORT);
    });

    before('deploy', async () => {
        const web3Provider = new Web3.providers.HttpProvider(`http://localhost:${TEST_RPC_PORT}`);

        // Deploy of the Wings token mock.
        const WingsTokenJson = require('build/contracts/WingsToken.json');
        const WingsToken     = contract({abi: WingsTokenJson.abi, unlinked_binary: WingsTokenJson.bytecode});
        WingsToken.setProvider(web3Provider);

        wingsToken = await WingsToken.new({from: creator.address});

        // Deploy of the XFI token.
        const XfiTokenJson = require('build/contracts/XFIToken.json');
        const XfiToken     = contract({abi: XfiTokenJson.abi, unlinked_binary: XfiTokenJson.bytecode});
        XfiToken.setProvider(web3Provider);

        xfiToken = await XfiToken.new({from: creator.address});

        // Deploy of the Uniswap Router mock.
        const UniswapV2RouterJson = require('build/contracts/UniswapV2Router.json');
        const UniswapV2Router     = contract({abi: UniswapV2RouterJson.abi, unlinked_binary: UniswapV2RouterJson.bytecode});
        UniswapV2Router.setProvider(web3Provider);

        uniswapRouter = await UniswapV2Router.new(wingsToken.address, {from: creator.address});

        // Deploy of the Exchange.
        const ExchangeJson = require('build/contracts/Exchange.json');
        const Exchange     = contract({abi: ExchangeJson.abi, unlinked_binary: ExchangeJson.bytecode});
        Exchange.setProvider(web3Provider);

        exchange = await Exchange.new(wingsToken.address, xfiToken.address, uniswapRouter.address, deadline, {from: creator.address});
    });

    it('total supply of WINGS is valid', async () => {
        const wingsTotalSupply = toStr(await wingsToken.totalSupply.call());

        wingsTotalSupply.should.be.equal(WINGS_TOTAL_SUPPLY);
    });

    it('total supply of XFI is valid', async () => {
        const xfiTotalSupply = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupply.should.be.equal(XFI_TOTAL_SUPPLY_START);
    });

    it('the Exchange has correct addresses of tokens and Uniswap Router', async () => {
        const wingsTokenAddress    = await exchange.wingsToken.call();
        const xfiTokenAddress      = await exchange.xfiToken.call();
        const uniswapRouterAddress = await exchange.uniswapRouter.call();

        wingsTokenAddress.should.be.equal(wingsToken.address);
        xfiTokenAddress.should.be.equal(xfiToken.address);
        uniswapRouterAddress.should.be.equal(uniswapRouter.address);
    });

    it('deadline is valid', async () => {
        const exchangeDeadline = toStr(await exchange.deadline.call());

        exchangeDeadline.should.be.equal(deadline);
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
        const amountToTransfer = USER_WINGS_START;

        // Transfer WINGS tokens.
        await wingsToken.transfer(user.address, amountToTransfer, {from: creator.address});

        // Check user WINGS balance after the operation.
        const userBalance = toStr(await wingsToken.balanceOf.call(user.address));

        userBalance.should.be.equal(USER_WINGS_START);
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
        const expectedXfiOut = toStr(amountIn * WINGS_PER_ETH);

        const ethIn  = toStr(amounts[0]);
        const xfiOut = toStr(amounts[1]);

        ethIn.should.be.equal(expectedEthIn);
        xfiOut.should.be.equal(expectedXfiOut);
    });

    it('swap WINGS-XFI', async () => {
        // Amount of WINGS to swap.
        const amountIn = toWei('100');

        // Expected values before the swap.
        const expectedXfiTotalSupplyBefore       = XFI_TOTAL_SUPPLY_START;
        const expectedUserWingsBalanceBefore     = USER_WINGS_START;
        const expectedUserXfiBalanceBefore       = USER_XFI_START;
        const expectedExchangeWingsBalanceBefore = EXCHANGE_WINGS_START;

        // Expected values after the swap.
        const expectedXfiTotalSupplyAfter        = toWei('100');
        const expectedUserWingsBalanceAfter      = '0';
        const expectedUserXfiBalanceAfter        = toWei('100');
        const expectedExchangeWingsBalanceAfter  = toWei('100');

        // Balances check before the swap.
        const userWingsBalanceBefore     = toStr(await wingsToken.balanceOf.call(user.address));
        const userXfiBalanceBefore       = toStr(await xfiToken.balanceOf.call(user.address));
        const exchangeWingsBalanceBefore = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userXfiBalanceBefore.should.be.equal(expectedUserXfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // XFI total supply check before the swap.
        const xfiTotalSupplyBefore = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyBefore.should.be.equal(expectedXfiTotalSupplyBefore);

        // Approve the Exchange to spend `amountIn` of WINGS tokens before the swap.
        await wingsToken.approve(exchange.address, amountIn, {from: user.address});

        // Swap WINGS for XFI.
        const txResult = await exchange.swapWINGSForXFI(amountIn, {from: user.address});

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

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapWINGSForXFI');
        firstLog.args.sender.should.be.equal(user.address);
        toStr(firstLog.args.amountIn).should.be.equal(amountIn);
        toStr(firstLog.args.amountOut).should.be.equal(amountIn);
    });

    it('swap ETH-XFi', async () => {
        // Amount of ETH to swap.
        const amountIn = toWei('1');

        // Minimum amount of XFI tokens to receive.
        const amountOutMin = bigInt(amountIn)
            .multiply(XFI_PER_ETH)
            .toString(10);

        // Expected values before the swap.
        const expectedXfiTotalSupplyBefore       = toWei('100');
        const expectedUserWingsBalanceBefore     = '0';
        const expectedUserXfiBalanceBefore       = toWei('100');
        const expectedExchangeWingsBalanceBefore = toWei('100');

        // Expected values after the swap.
        const expectedXfiTotalSupplyAfter        = toWei('200');
        const expectedUserWingsBalanceAfter      = '0';
        const expectedUserXfiBalanceAfter        = toWei('200');
        const expectedExchangeWingsBalanceAfter  = toWei('200');

        // Balances check before the swap.
        const userWingsBalanceBefore     = toStr(await wingsToken.balanceOf.call(user.address));
        const userXfiBalanceBefore       = toStr(await xfiToken.balanceOf.call(user.address));
        const exchangeWingsBalanceBefore = toStr(await wingsToken.balanceOf.call(exchange.address));

        userWingsBalanceBefore.should.be.equal(expectedUserWingsBalanceBefore);
        userXfiBalanceBefore.should.be.equal(expectedUserXfiBalanceBefore);
        exchangeWingsBalanceBefore.should.be.equal(expectedExchangeWingsBalanceBefore);

        // XFI total supply check before the swap.
        const xfiTotalSupplyBefore = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupplyBefore.should.be.equal(expectedXfiTotalSupplyBefore);

        // Get user ETH balance before the swap.
        const userEthBalanceBefore = await web3.eth.getBalance(user.address);

        // Swap ETH for XFI.
        const txResult = await exchange.swapETHForXFI(amountOutMin, {from: user.address, value: amountIn});

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
        const userEthBalanceAfter = await web3.eth.getBalance(user.address);

        userEthBalanceAfter.should.be.equal(expectedUserEthBalanceAfter);

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

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('SwapETHForXFI');
        firstLog.args.sender.should.be.equal(user.address);
        toStr(firstLog.args.amountIn).should.be.equal(amountIn);
        toStr(firstLog.args.amountOut).should.be.equal(amountOutMin);
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
            await exchange.swapWINGSForXFI('1', {from: user.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping is stopped');
        }
    });

    it('doesn\'t allow to swap ETH-XFI (swapping is stopped)', async () => {
        try {
            await exchange.swapETHForXFI('1', {from: user.address});

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
        await increaseTime(sixMonths + 100);
    });

    it('shouldn\'t allow to swap WINGS afer deadline', async () => {
        try {
            await exchange.swapWINGSForXFI('1', {from: user.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping has expired');
        }
    });

    it('shouldn\'t allow to swap ETH afer deadline', async () => {
        try {
            await exchange.swapETHForXFI('1', {from: user.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: swapping has expired');
        }
    })

    it('change deadline', async () => {
        const newDeadline = (parseInt(deadline) + sixMonths).toString();

        // Start swaps.
        const txResult = await exchange.changeDeadline(newDeadline, {from: creator.address});

        // Check events emitted during transaction.
        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('DeadlineChanged');

        const exchangeDeadline = toStr(await exchange.deadline.call());
        exchangeDeadline.should.be.equal(newDeadline); 
    });

    it('shouldn\'t allow to change to zero deadline', async() => {
        try {
            await exchange.changeDeadline('0', {from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: deadline must be great than current timestamp');
        }
    });

    it('shouldnt allow to change deadline without owner access role', async () => {
        try {
            await exchange.changeDeadline('0', {from: maliciousUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('Exchange: sender is not owner');
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

    it('fund the Exchange with WINGS to test WINGS withdrawal', async () => {
        const amountToTransfer = toWei('100');

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
        // Destination address.
        const to = creator.address;

        // Amount of WINGS to withdraw.
        const amountToWithdraw = toWei('300');

        // Expected values.
        const expectedExchangeWingsBalanceBefore = toWei('300');
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
        const xfiTotalSupply = toStr(await xfiToken.totalSupply.call());

        xfiTotalSupply.should.be.equal(toWei('200').toString('10'));
    });

    after('stop the Test RPC', () => {
        testRpc.stop();
    });
});
