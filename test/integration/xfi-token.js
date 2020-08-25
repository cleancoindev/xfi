/* global Web3 contract helpers TestRpc moveTime WEB3_PROVIDER_URL TEST_RPC_PORT */

/**
 * Integration test which covers functionality of XFI Token.
 *
 * @module test/integration/xfi-token
 */

'use strict';

const bigInt = require('big-integer');

const web3 = new Web3(WEB3_PROVIDER_URL);

const {toStr, toWei} = helpers;
const {ZERO_ADDRESS} = helpers;

const ONE_DAY = 86400;

describe('XFI Token', () => {
    const creator       = web3.eth.accounts.create();
    const newOwner      = web3.eth.accounts.create();
    const tempOwner     = web3.eth.accounts.create();
    const minter        = web3.eth.accounts.create();
    const firstUser     = web3.eth.accounts.create();
    const secondUser    = web3.eth.accounts.create();
    const tmpUser       = web3.eth.accounts.create();
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
                secretKey: minter.privateKey
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
                secretKey: tmpUser.privateKey
            },
            {
                balance: toWei('10'),
                secretKey: maliciousUser.privateKey
            }
        ],
        locked: false
    });

    let token;

    before('launch the Test RPC', async () => {
        await testRpc.start(TEST_RPC_PORT);
    });

    before('deploy', async () => {
        const vestingStart = Math.floor((Date.now() / 1000) + ONE_DAY).toString();

        const web3Provider = new Web3.providers.HttpProvider(WEB3_PROVIDER_URL);

        const TokenJson = require('build/contracts/XFIToken.json');
        const Token     = contract({abi: TokenJson.abi, unlinked_binary: TokenJson.bytecode});
        Token.setProvider(web3Provider);

        token = await Token.new(vestingStart, {from: creator.address});
    });

    it('doesn\'t allow to change vesting start without owner access role', async () => {
        try {
            await token.changeVestingStart('0', {from: maliciousUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: sender is not owner');
        }
    });

    it('doesn\'t allow to change to zero vesting start', async () => {
        try {
            await token.changeVestingStart('0', {from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: vesting start must be greater than current timestamp');
        }
    });

    it('change vesting start', async () => {
        const newVestingStart = Math.floor((Date.now() / 1000) + ONE_DAY * 2);

        const vestingDuration = Number(await token.VESTING_DURATION.call());
        const freezeDuration  = Number(await token.RESERVE_FREEZE_DURATION.call());

        const expectedVestingEnd         = newVestingStart + vestingDuration;
        const expectedReserveFrozenUntil = newVestingStart + freezeDuration;

        const txResult = await token.changeVestingStart(toStr(newVestingStart), {from: creator.address});

        const vestingStart       = Number(await token.vestingStart.call());
        const vestingEnd         = Number(await token.vestingEnd.call());
        const reserveFrozenUntil = Number(await token.reserveFrozenUntil.call());

        vestingStart.should.be.equal(newVestingStart);
        vestingEnd.should.be.equal(expectedVestingEnd);
        reserveFrozenUntil.should.be.equal(expectedReserveFrozenUntil);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('VestingStartChanged');
        Number(firstLog.args.newVestingStart).should.be.equal(newVestingStart);
        Number(firstLog.args.newVestingEnd).should.be.equal(expectedVestingEnd);
        Number(firstLog.args.newReserveFrozenUntil).should.be.equal(expectedReserveFrozenUntil);
    });

    it('move time to the end of vesting period', async () => {
        const vestingDaysSinceStartBefore = Number(await token.vestingDaysSinceStart.call());
        const vestingDaysLeftBefore       = Number(await token.vestingDaysLeft.call());

        vestingDaysSinceStartBefore.should.be.equal(0);
        vestingDaysLeftBefore.should.be.equal(182);

        const now        = Math.floor(Date.now() / 1000);
        const vestingEnd = Number(await token.vestingEnd.call());

        await moveTime(vestingEnd - now + 1);

        const vestingDaysSinceStartAfter = Number(await token.vestingDaysSinceStart.call());
        const vestingDaysLeftAfter       = Number(await token.vestingDaysLeft.call());

        vestingDaysSinceStartAfter.should.be.equal(182);
        vestingDaysLeftAfter.should.be.equal(0);
    });

    it('correct values of the default constants', async () => {
        const decimals = (await token.decimals.call()).toNumber();
        const name     = await token.name.call();
        const symbol   = await token.symbol.call();

        decimals.should.be.equal(18);
        name.should.be.equal('dfinance');
        symbol.should.be.equal('XFI');
    });

    it('correct maximum total supply', async () => {
        const expectedMaxTotalSupply = toWei('100000000');

        const maxTotalSupply = toStr(await token.MAX_TOTAL_SUPPLY.call());

        maxTotalSupply.should.be.equal(expectedMaxTotalSupply);
    });

    it('correct vesting duration', async () => {
        const expectedVestingDurationDays = toStr(182);
        const expectedVestingDuration     = bigInt(expectedVestingDurationDays)
            .times(ONE_DAY)
            .toString(10);

        const vestingDuration     = toStr(await token.VESTING_DURATION.call());
        const vestingDurationDays = toStr(await token.VESTING_DURATION_DAYS.call());

        vestingDuration.should.be.equal(expectedVestingDuration);
        vestingDurationDays.should.be.equal(expectedVestingDurationDays);
    });

    it('correct freeze duration', async () => {
        const expectedReserveFreezeDurationDays = toStr(730);
        const expectedReserveFreezeDuration     = bigInt(expectedReserveFreezeDurationDays)
            .times(ONE_DAY)
            .toString(10);

        const reserveFreezeDuration     = toStr(await token.RESERVE_FREEZE_DURATION.call());
        const reserveFreezeDurationDays = toStr(await token.RESERVE_FREEZE_DURATION_DAYS.call());

        reserveFreezeDuration.should.be.equal(expectedReserveFreezeDuration);
        reserveFreezeDurationDays.should.be.equal(expectedReserveFreezeDurationDays);
    });

    it('total supply is zero', async () => {
        const totalSupply = (await token.totalSupply.call()).toNumber();

        totalSupply.should.be.equal(0);
    });

    it('creator is owner', async () => {
        const ownerRole = await token.DEFAULT_ADMIN_ROLE.call();

        const roleMemberCount = (await token.getRoleMemberCount.call(ownerRole)).toNumber();
        const creatorIsOwner  = await token.hasRole.call(ownerRole, creator.address);
        const roleMember      = await token.getRoleMember.call(ownerRole, '0');

        roleMemberCount.should.be.equal(1);
        creatorIsOwner.should.be.true;
        roleMember.should.be.equal(creator.address);
    });

    it('doesn\'t allow to add owners before owner role was granted', async () => {
        const ownerRole = await token.DEFAULT_ADMIN_ROLE.call();

        try {
            await token.grantRole(ownerRole, tempOwner.address, {from: newOwner.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('AccessControl: sender must be an admin to grant');
        }
    });

    it('add new owner', async () => {
        const ownerRole = await token.DEFAULT_ADMIN_ROLE.call();

        const txResult = await token.grantRole(ownerRole, newOwner.address, {from: creator.address});

        const roleMemberCount = (await token.getRoleMemberCount.call(ownerRole)).toNumber();
        const newOwnerIsOwner = await token.hasRole.call(ownerRole, newOwner.address);
        const roleMember      = await token.getRoleMember.call(ownerRole, '1');

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
        const ownerRole = await token.DEFAULT_ADMIN_ROLE.call();

        await token.grantRole(ownerRole, tempOwner.address, {from: newOwner.address});

        const roleMemberCount  = (await token.getRoleMemberCount.call(ownerRole)).toNumber();
        const tempOwnerIsOwner = await token.hasRole.call(ownerRole, tempOwner.address);
        const roleMember       = await token.getRoleMember.call(ownerRole, '2');

        roleMemberCount.should.be.equal(3);
        tempOwnerIsOwner.should.be.true;
        roleMember.should.be.equal(tempOwner.address);
    });

    it('new owner can remove temp owner', async () => {
        const ownerRole = await token.DEFAULT_ADMIN_ROLE.call();

        const txResult = await token.revokeRole(ownerRole, tempOwner.address, {from: newOwner.address});

        const roleMemberCount  = (await token.getRoleMemberCount.call(ownerRole)).toNumber();
        const tempOwnerIsOwner = await token.hasRole.call(ownerRole, tempOwner.address);

        roleMemberCount.should.be.equal(2);
        tempOwnerIsOwner.should.be.false;

        try {
            await token.getRoleMember.call(ownerRole, '2');

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
        const ownerRole = await token.DEFAULT_ADMIN_ROLE.call();

        await token.revokeRole(ownerRole, newOwner.address, {from: creator.address});

        const roleMemberCount = (await token.getRoleMemberCount.call(ownerRole)).toNumber();
        const newOwnerIsOwner = await token.hasRole.call(ownerRole, newOwner.address);

        roleMemberCount.should.be.equal(1);
        newOwnerIsOwner.should.be.false;

        try {
            await token.getRoleMember.call(ownerRole, '1');

            throw Error('Should revert');
        } catch (error) {
            error.message.should.be.equal('Returned error: VM Exception while processing transaction: revert EnumerableSet: index out of bounds');
        }
    });

    it('doesn\'t allow to mint tokens before minter role was granted', async () => {
        try {
            await token.mint(minter.address, '1', {from: minter.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: sender is not minter');
        }
    });

    it('add minter', async () => {
        const minterRole = await token.MINTER_ROLE.call();

        await token.grantRole(minterRole, minter.address, {from: creator.address});

        const roleMemberCount = (await token.getRoleMemberCount.call(minterRole)).toNumber();
        const minterIsMinter  = await token.hasRole.call(minterRole, minter.address);
        const roleMember      = await token.getRoleMember.call(minterRole, 0);

        roleMemberCount.should.be.equal(1);
        minterIsMinter.should.be.true;
        roleMember.should.be.equal(minter.address);
    });

    it('doesn\'t allow to mint tokens for zero address', async () => {
        try {
            await token.mint(ZERO_ADDRESS, '1', {from: minter.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: mint to the zero address');
        }
    });

    it('minter mints tokens for first user', async () => {
        const firstUserBalanceBefore = toStr(await token.balanceOf.call(firstUser.address));
        const totalSupplyBefore      = toStr(await token.totalSupply.call());

        firstUserBalanceBefore.should.be.equal('0');
        totalSupplyBefore.should.be.equal('0');

        const amountToMint = toWei('10');

        const txResult = await token.mint(firstUser.address, amountToMint, {from: minter.address});

        const firstUserBalanceAfter = toStr(await token.balanceOf.call(firstUser.address));
        const totalSupplyAfter      = toStr(await token.totalSupply.call());

        firstUserBalanceAfter.should.be.equal(amountToMint);
        totalSupplyAfter.should.be.equal(amountToMint);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('Transfer');
        firstLog.args.from.should.be.equal(ZERO_ADDRESS);
        firstLog.args.to.should.be.equal(firstUser.address);
        toStr(firstLog.args.value).should.be.equal(amountToMint);
    });

    it('minter mints tokens for tmp user and user burns it', async () => {
        // Amount of XFI to mint.
        const amountToMint = toWei('10');

        const totalSupplyBefore = toStr(await token.totalSupply.call());
        const userBalanceBefore = toStr(await token.balanceOf.call(tmpUser.address));

        userBalanceBefore.should.be.equal('0');

        /* ▲ Before mint ▲ */

        await token.mint(tmpUser.address, amountToMint, {from: minter.address});

        /* ▼ After mint ▼ */

        const balanceAfterMint           = toStr(await token.balanceOf.call(tmpUser.address));
        const totalVestedBalanceBefore   = toStr(await token.totalVestedBalanceOf.call(tmpUser.address));
        const unspentVestedBalanceBefore = toStr(await token.unspentVestedBalanceOf.call(tmpUser.address));
        const spentVestedBalanceBefore   = toStr(await token.spentVestedBalanceOf.call(tmpUser.address));

        balanceAfterMint.should.be.equal(amountToMint);
        totalVestedBalanceBefore.should.be.equal(amountToMint);
        unspentVestedBalanceBefore.should.be.equal(amountToMint);
        spentVestedBalanceBefore.should.be.equal('0');

        /* ▲ Before burn ▲ */

        await token.burn(amountToMint, {from: tmpUser.address});

        /* ▼ After burn ▼ */

        const totalSupplyAfter          = toStr(await token.totalSupply.call());
        const balanceAfterBurn          = toStr(await token.balanceOf.call(tmpUser.address));
        const totalVestedBalanceAfter   = toStr(await token.totalVestedBalanceOf.call(tmpUser.address));
        const unspentVestedBalanceAfter = toStr(await token.unspentVestedBalanceOf.call(tmpUser.address));
        const spentVestedBalanceAfter   = toStr(await token.spentVestedBalanceOf.call(tmpUser.address));

        totalSupplyAfter.should.be.equal(totalSupplyBefore);
        balanceAfterBurn.should.be.equal('0');
        totalVestedBalanceAfter.should.be.equal(amountToMint);
        unspentVestedBalanceAfter.should.be.equal('0');
        spentVestedBalanceAfter.should.be.equal(amountToMint);
    });

    it('doesn\'t allow to transfer tokens to zero address', async () => {
        try {
            await token.transfer(ZERO_ADDRESS, '1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transfer to the zero address');
        }
    });

    it('first user can transfer tokens to second user', async () => {
        const amountToTransfer = toWei('5');

        const txResult = await token.transfer(secondUser.address, amountToTransfer, {from: firstUser.address});

        const expectedFirstUserBalance  = toWei('5');
        const expectedSecondUserBalance = toWei('5');
        const expectedTotalSupply       = toWei('10');

        const firstUserBalanceAfter  = toStr(await token.balanceOf.call(firstUser.address));
        const secondUserBalanceAfter = toStr(await token.balanceOf.call(secondUser.address));
        const totalSupplyAfter       = toStr(await token.totalSupply.call());

        firstUserBalanceAfter.should.be.equal(expectedFirstUserBalance);
        secondUserBalanceAfter.should.be.equal(expectedSecondUserBalance);
        totalSupplyAfter.should.be.equal(expectedTotalSupply);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('Transfer');
        firstLog.args.from.should.be.equal(firstUser.address);
        firstLog.args.to.should.be.equal(secondUser.address);
        toStr(firstLog.args.value).should.be.equal(amountToTransfer);
    });

    it('doesn\'t allow to approve spending of tokens to a zero address', async () => {
        try {
            await token.approve(ZERO_ADDRESS, '1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: approve to the zero address');
        }
    });

    it('first user approves second user to use his tokens', async () => {
        const amountToApprove = toWei('5');

        const txResult = await token.approve(secondUser.address, amountToApprove, {from: firstUser.address});

        const expectedSecondUserAllowance = toWei('5');

        const secondUserAllowance = toStr(await token.allowance.call(firstUser.address, secondUser.address));

        secondUserAllowance.should.be.equal(expectedSecondUserAllowance);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('Approval');
        firstLog.args.owner.should.be.equal(firstUser.address);
        firstLog.args.spender.should.be.equal(secondUser.address);
        toStr(firstLog.args.value).should.be.equal(amountToApprove);
    });

    it('doesn\'t allow to decrease allowance of zero address', async () => {
        try {
            await token.decreaseAllowance(ZERO_ADDRESS, '1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: decreased allowance below zero');
        }
    });

    it('first user can descrease allowance', async () => {
        const delta = toWei('1');

        await token.decreaseAllowance(secondUser.address, delta, {from: firstUser.address});

        const expectedSecondUserAllowance = toWei('4');

        const secondUserAllowance = toStr(await token.allowance.call(firstUser.address, secondUser.address));

        secondUserAllowance.should.be.equal(expectedSecondUserAllowance);
    });

    it('doesn\'t allow to increase allowance of zero address', async () => {
        try {
            await token.increaseAllowance(ZERO_ADDRESS, '1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: approve to the zero address');
        }
    });

    it('first user can increase allowance', async () => {
        const delta = toWei('1');

        await token.increaseAllowance(secondUser.address, delta, {from: firstUser.address});

        const expectedSecondUserAllowance = toWei('5');

        const secondUserAllowance = toStr(await token.allowance.call(firstUser.address, secondUser.address));

        secondUserAllowance.should.be.equal(expectedSecondUserAllowance);
    });

    it('doesn\'t allow to transfer from zero address', async () => {
        try {
            await token.transferFrom(ZERO_ADDRESS, secondUser.address, '1', {from: secondUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transfer from the zero address');
        }
    });

    it('doesn\'t allow to transfer to zero address', async () => {
        try {
            await token.transferFrom(firstUser.address, ZERO_ADDRESS, '1', {from: secondUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transfer to the zero address');
        }
    });

    it('second user transfers tokens from first user', async () => {
        const amountToTransfer = toWei('5');

        const txResult = await token.transferFrom(firstUser.address, secondUser.address, amountToTransfer, {from: secondUser.address});

        const expectedFirstUserBalance  = '0';
        const expectedSecondUserBalance = toWei('10');
        const expectedTotalSupply       = toWei('10');

        const firstUserBalanceAfter  = toStr(await token.balanceOf.call(firstUser.address));
        const secondUserBalanceAfter = toStr(await token.balanceOf.call(secondUser.address));
        const totalSupplyAfter       = toStr(await token.totalSupply.call());

        firstUserBalanceAfter.should.be.equal(expectedFirstUserBalance);
        secondUserBalanceAfter.should.be.equal(expectedSecondUserBalance);
        totalSupplyAfter.should.be.equal(expectedTotalSupply);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(2);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('Transfer');
        firstLog.args.from.should.be.equal(firstUser.address);
        firstLog.args.to.should.be.equal(secondUser.address);
        toStr(firstLog.args.value).should.be.equal(amountToTransfer);

        const secondLog = txResult.logs[1];

        secondLog.event.should.be.equal('Approval');
        secondLog.args.owner.should.be.equal(firstUser.address);
        secondLog.args.spender.should.be.equal(secondUser.address);
        toStr(secondLog.args.value).should.be.equal('0');
    });

    it('ex-owner can\'t stop transfers', async () => {
        try {
            await token.stopTransfers({from: tempOwner.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: sender is not owner');
        }
    });

    it('owner can stop transfers', async () => {
        const transferringIsStopped = await token.isTransferringStopped.call();

        transferringIsStopped.should.be.false;

        const txResult = await token.stopTransfers({from: creator.address});

        const transferringIsStoppedAfter = await token.isTransferringStopped.call();

        transferringIsStoppedAfter.should.be.true;

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('TransfersStopped');
    });

    it('doesn\'t allow to stop transfers when transfers are stopped', async () => {
        try {
            await token.stopTransfers({from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transferring is stopped');
        }
    });

    it('doesn\'t allow to transfer when transferring is stopped', async () => {
        try {
            await token.transfer(firstUser.address, '1', {from: secondUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transferring is stopped');
        }
    });

    it('doesn\'t allow to transfer from when transferring is stopped', async () => {
        try {
            await token.transferFrom(firstUser.address, secondUser.address, '1', {from: secondUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transferring is stopped');
        }
    });

    it('doesn\'t allow to mint when transferring is stopped', async () => {
        try {
            await token.mint(firstUser.address, '1', {from: minter.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transferring is stopped');
        }
    });

    it('doesn\'t allow to burn when transferring is stopped', async () => {
        try {
            await token.burn('1', {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transferring is stopped');
        }
    });

    it('doesn\'t allow to burnFrom when transferring is stopped', async () => {
        try {
            await token.burnFrom(firstUser.address, '1', {from: minter.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transferring is stopped');
        }
    });

    it('ex-owner can\'t start transfers', async () => {
        try {
            await token.startTransfers({from: tempOwner.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: sender is not owner');
        }
    });

    it('owner can start transfers', async () => {
        const transferringIsStopped = await token.isTransferringStopped.call();

        transferringIsStopped.should.be.true;

        const txResult = await token.startTransfers({from: creator.address});

        const transferringIsStoppedAfter = await token.isTransferringStopped.call();

        transferringIsStoppedAfter.should.be.false;

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('TransfersStarted');
    });

    it('doesn\'t allow to start transfers when transferring is not stopped', async () => {
        try {
            await token.startTransfers({from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: transferring is not stopped');
        }
    });

    it('doesn\'t allow to burn zero address tokens', async () => {
        try {
            await token.burnFrom(ZERO_ADDRESS, '1', {from: minter.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: burn from the zero address');
        }
    });

    it('minter burns user tokens', async () => {
        const amountToBurn = toWei('10');

        const txResult = await token.burnFrom(secondUser.address, amountToBurn, {from: minter.address});

        const expectedSecondUserBalance = '0';
        const expectedTotalSupply       = '0';

        const secondUserBalanceAfter = toStr(await token.balanceOf.call(secondUser.address));
        const totalSupplyAfter       = toStr(await token.totalSupply.call());

        secondUserBalanceAfter.should.be.equal(expectedSecondUserBalance);
        totalSupplyAfter.should.be.equal(expectedTotalSupply);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('Transfer');
        firstLog.args.from.should.be.equal(secondUser.address);
        firstLog.args.to.should.be.equal(ZERO_ADDRESS);
        toStr(firstLog.args.value).should.be.equal(amountToBurn);
    });

    it('remove (last) minter', async () => {
        const minterRole = await token.MINTER_ROLE.call();

        await token.revokeRole(minterRole, minter.address, {from: creator.address});

        const roleMemberCount = (await token.getRoleMemberCount.call(minterRole)).toNumber();
        const minterIsMinter  = await token.hasRole.call(minterRole, creator.address);

        roleMemberCount.should.be.equal(0);
        minterIsMinter.should.be.false;

        try {
            await token.getRoleMember.call(minterRole, '0');

            throw Error('Should revert');
        } catch (error) {
            error.message.should.be.equal('Returned error: VM Exception while processing transaction: revert EnumerableSet: index out of bounds');
        }
    });

    it('ex-minter is no longer able to mint new tokens', async () => {
        try {
            await token.mint(secondUser.address, '1', {from: minter.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: sender is not minter');
        }
    });

    it('ex-minter is no longer able to burn tokens', async () => {
        try {
            await token.burnFrom(secondUser.address, '1', {from: minter.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: sender is not minter');
        }
    });

    it('doesn\'t allow to withdraw reserve when it\'s frozen', async () => {
        try {
            await token.withdrawReserve(creator.address, {from: creator.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: reserve is frozen');
        }
    });

    it('move time to the moment when reserve is available for withdrawal', async () => {
        const reserveFrozenUntil = Number(await token.reserveFrozenUntil.call());

        const secondsToMove = reserveFrozenUntil - Math.floor(Date.now() / 1000) + 1;

        await moveTime(secondsToMove);
    });

    it('doesn\'t allow to withdraw reserve without the owner access role', async () => {
        try {
            await token.withdrawReserve(firstUser.address, {from: firstUser.address});

            throw Error('Should revert');
        } catch (error) {
            if (!error.reason) { throw error; }

            error.reason.should.be.equal('XFIToken: sender is not owner');
        }
    });

    it('withdraw reserve', async () => {
        const reserveAmountBefore = toStr(await token.reserveAmount.call());

        const txResult = await token.withdrawReserve(creator.address, {from: creator.address});

        const reserveAmountAfter = toStr(await token.reserveAmount.call());

        reserveAmountAfter.should.be.equal('0');

        const creatorBalance = toStr(await token.balanceOf.call(creator.address));

        creatorBalance.should.be.equal(reserveAmountBefore);

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(2);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('Transfer');
        firstLog.args.from.should.be.equal(ZERO_ADDRESS);
        firstLog.args.to.should.be.equal(creator.address);
        toStr(firstLog.args.value).should.be.equal(reserveAmountBefore);

        const secondLog = txResult.logs[1];

        secondLog.event.should.be.equal('ReserveWithdrawal');
        secondLog.args.to.should.be.equal(creator.address);
        toStr(secondLog.args.amount).should.be.equal(reserveAmountBefore);
    });

    it('(last) owner renounces', async () => {
        const ownerRole = await token.DEFAULT_ADMIN_ROLE.call();

        const txResult = await token.renounceRole(ownerRole, creator.address, {from: creator.address});

        const roleMemberCount = (await token.getRoleMemberCount.call(ownerRole)).toNumber();
        const creatorIsOwner  = await token.hasRole.call(ownerRole, creator.address);

        roleMemberCount.should.be.equal(0);
        creatorIsOwner.should.be.false;

        try {
            await token.getRoleMember.call(ownerRole, '0');

            throw Error('Should revert');
        } catch (error) {
            error.message.should.be.equal('Returned error: VM Exception while processing transaction: revert EnumerableSet: index out of bounds');
        }

        // Check events emitted during transaction.

        txResult.logs.length.should.be.equal(1);

        const firstLog = txResult.logs[0];

        firstLog.event.should.be.equal('RoleRevoked');
        firstLog.args.role.should.be.equal(ownerRole);
        firstLog.args.account.should.be.equal(creator.address);
        firstLog.args.sender.should.be.equal(creator.address);
    });

    after('stop the Test RPC', () => {
        testRpc.stop();
    });
});
