# XFI Token | Ethereum XFI Exchange

This repository is a home for the XFI Token contract as well as the Ethereum XFI Exchange which allows Ethereum accounts to convert their WINGS or ETH to XFI.

## Contents

- [XFI Token | Ethereum XFI Exchange](#xfi-token--ethereum-xfi-exchange)
  - [Contents](#contents)
  - [XFI Token](#xfi-token)
    - [XFI Token Methods](#xfi-token-methods)
      - [isTransferringStopped](#istransferringstopped)
      - [isMigratingAllowed](#ismigratingallowed)
      - [VESTING_DURATION](#vesting_duration)
      - [VESTING_DURATION_DAYS](#vesting_duration_days)
      - [RESERVE_FREEZE_DURATION](#reserve_freeze_duration)
      - [RESERVE_FREEZE_DURATION_DAYS](#reserve_freeze_duration_days)
      - [MAX_VESTING_TOTAL_SUPPLY](#max_vesting_total_supply)
      - [vestingStart](#vestingstart)
      - [vestingEnd](#vestingend)
      - [vestingDaysSinceStart](#vestingdayssincestart)
      - [vestingDaysLeft](#vestingdaysleft)
      - [reserveFrozenUntil](#reservefrozenuntil)
      - [reserveAmount](#reserveamount)
      - [convertAmountUsingRatio](#convertamountusingratio)
      - [convertAmountUsingReverseRatio](#convertamountusingreverseratio)
      - [totalVestedBalanceOf](#totalvestedbalanceof)
      - [unspentVestedBalanceOf](#unspentvestedbalanceof)
      - [spentVestedBalanceOf](#spentvestedbalanceof)
  - [Exchange](#exchange)
    - [Exchange Methods](#exchange-methods)
      - [estimateSwapWINGSForXFI](#estimateswapwingsforxfi)
      - [estimateSwapWINGSForXFIPerDay](#estimateswapwingsforxfiperday)
      - [isSwappingStopped](#isswappingstopped)
      - [maxGasPrice](#maxgasprice)
      - [swapWINGSForXFI](#swapwingsforxfi)
  - [Requirements](#requirements)
  - [Compiling](#compiling)
  - [Deploying](#deploying)
  - [Testing](#testing)
  - [License](#license)

## XFI Token

`XFIToken` is an extended version of ERC20 standard. This extended version adds minting, vesting and token transfer management to the functionality described in the original EIP.

### XFI Token Methods

#### isTransferringStopped

Returns whether transfering is stopped.

Output:
- `bool` - whether transferring is stopped.

Example:

```solidity
isTransferringStopped()
```

#### isMigratingAllowed

Returns whether migrating is allowed.

Output:
- `bool` - whether migrating is allowed.

Example:

```solidity
isMigratingAllowed()
```

#### VESTING_DURATION

Returns vesting duration in seconds.

Output:
- `uint256` - vesting duration in seconds.

Example:

```solidity
VESTING_DURATION()
```

#### VESTING_DURATION_DAYS

Returns vesting duration in days.

Output:
- `uint256` - vesting duration in days.

Example:

```solidity
VESTING_DURATION_DAYS()
```

#### RESERVE_FREEZE_DURATION

Returns reserve freeze duration in seconds.

Output:
- `uint256` - reserve freeze duration in seconds.

Example:

```solidity
RESERVE_FREEZE_DURATION()
```

#### RESERVE_FREEZE_DURATION_DAYS

Returns reserve freeze duration in days.

Output:
- `uint256` - reserve freeze duration in days.

Example:

```solidity
RESERVE_FREEZE_DURATION_DAYS()
```

#### MAX_VESTING_TOTAL_SUPPLY

Returns maximum vesting total supply.

Output:
- `uint256` - maximum total supply.

Example:

```solidity
MAX_VESTING_TOTAL_SUPPLY()
```

#### vestingStart

Returns the vesting start.

Output:
- `uint256` - vesting start timestamp.

Example:

```solidity
vestingStart()
```

#### vestingEnd

Returns the vesting end.

Output:
- `uint256` - vesting end timestamp.

Example:

```solidity
vestingEnd()
```

#### vestingDaysSinceStart

Returns days since the vesting start.

Output:
- `uint256` - integer number of days since the vesting start.

Example:

```solidity
vestingDaysSinceStart()
```

#### vestingDaysLeft

Returns vesting days left.

Output:
- `uint256` - integer number of vesting days left.

Example:

```solidity
vestingDaysLeft()
```

#### reserveFrozenUntil

Returns the date when freeze of the reserve XFI amount.

Output:
- `uint256` - reserve frozen until timestamp.

Example:

```solidity
reserveFrozenUntil()
```

#### reserveAmount

Output:
- `uint256` - reserve amount.

Example:

```solidity
reserveAmount()
```

#### convertAmountUsingRatio

Convert input amount to the output amount using the vesting ratio (days since vesting start / vesting duration).

Input:
- `uint256 amount` - amount to convert.

Output:
- `uint256` - converted amount.

Example:

```solidity
convertAmountUsingRatio(amount)
```

#### convertAmountUsingReverseRatio

Convert input amount to the output amount using the vesting reverse ratio (days until vesting end / vesting duration).

Input:
- `uint256 amount` - amount to convert.

Output:
- `uint256` - converted amount.

Example:

```solidity
convertAmountUsingReverseRatio(amount)
```

#### totalVestedBalanceOf

Returns total vested balance of the `account`.

Input:
- `address account` - owner address.

Output:
- `uint256` - amount of vested tokens owned by `account`.

Example:

```solidity
totalVestedBalanceOf(account)
```

#### unspentVestedBalanceOf

Returns unspent vested balance of the `account`.

Input:
- `address account` - owner address.

Output:
- `uint256` - amount of vested tokens unspent by `account`.

Example:

```solidity
unspentVestedBalanceOf(account)
```

#### spentVestedBalanceOf

Returns spent vested balance of the `account`.

Input:
- `address account` - owner address.

Output:
- `uint256` - amount of vested tokens spent by `account`.

Example:

```solidity
spentVestedBalanceOf(account)
```

## Exchange

`Exchange` is the Ethereum XFI Exchange which allows Ethereum accounts to convert their WINGS or ETH to XFI.

### Exchange Methods

#### estimateSwapWINGSForXFI

Returns estimation for swap of WINGS-XFI pair.

Input:
- `uint256 amountIn` - amount of WINGS to swap.

Output:
- `uint256[] amounts` - estimation for swap of WINGS-XFI pair.

Example:

```solidity
estimateSwapWINGSForXFI(amountIn)
```

#### estimateSwapWINGSForXFIPerDay

Returns daily vesting estimation for swap of WINGS-XFI pair.

Input:
- `uint256 amountIn` - amount of WINGS to swap.

Output:
- `uint256 amounts` - estimated amount of XFI that will be vested each day of the vesting period.

Example:

```solidity
estimateSwapWINGSForXFIPerDay(amountIn)
```

#### isSwappingStopped

Returns whether swapping is stopped.

Example:

```solidity
isSwappingStopped()
```

*NOTE: To receive real-time updates on the status of the swaps, consider listening to `SwapsStarted` and `SwapsStopped` events.*

#### maxGasPrice

Returns maximum gas price for swap. If set, any swap transaction that has a gas price exceeding this limit will be reverted.

Example:

```solidity
maxGasPrice()
```

#### swapWINGSForXFI

Executes swap of WINGS-XFI pair.

Emits a `SwapWINGSForXFI` event.

Input:
- `uint256 amountIn` - amount of WINGS to swap.

Output:
- `uint256[] amounts` - result of a swap of WINGS-XFI pair.

Example:

```solidity
swapWINGSForXFI(amountIn)
```

## Requirements

- Nodejs ~10.16.2
- Truffle ~5.1.33
- Ganache-cli ~6.9.1 *(for testing)*

## Compiling

Configure `truffle-config.js` (see [configuration manual](http://truffleframework.com/docs/advanced/configuration)).

Compile contracts:

```bash
npm run compile
```

## Deploying

Copy and configure `.env`:

```bash
cp .env.example .env
```

**Required environment variables:**
- `CREATOR_ADDRESS` - address of the creator account.
- `WINGS_TOKEN_ADDRESS` - address of the WINGS Token.
- `START_DATE` - vesting start date (only XFI Token deploy).
- `XFI_TOKEN_ADDRESS` - XFI token address (only Exchange deploy).

Migrate contracts:

```bash
truffle migrate
```

To run migration for a specific network, make sure that the network is configured in your `truffle-config.js` and specify the `--network` option, like below:

```bash
truffle migrate --network live
```

## Testing

Compile contracts:

```bash
npm run compile
```

Run tests:

```bash
npm test
```

## License

[MIT](./LICENSE)
