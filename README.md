# XFI Token | Ethereum XFI Exchange

This repository is a home for the XFI Token contract as well as the Ethereum XFI Exchange which allows Ethereum accounts to convert their WINGS or ETH to XFI.

## Contents

- [XFI Token | Ethereum XFI Exchange](#xfi-token--ethereum-xfi-exchange)
  - [Contents](#contents)
  - [XFI Token](#xfi-token)
  - [Exchange](#exchange)
    - [Methods](#methods)
      - [estimateSwapWINGSForXFI](#estimateswapwingsforxfi)
      - [estimateSwapETHForXFI](#estimateswapethforxfi)
      - [estimateSwapWINGSForXFIPerDay](#estimateswapwingsforxfiperday)
      - [estimateSwapETHForXFIPerDay](#estimateswapethforxfiperday)
      - [isSwappingStopped](#isswappingstopped)
      - [maxGasPrice](#maxgasprice)
      - [swapWINGSForXFI](#swapwingsforxfi)
      - [swapETHForXFI](#swapethforxfi)
  - [Requirements](#requirements)
  - [Compiling](#compiling)
  - [Deploying](#deploying)
  - [Testing](#testing)
  - [License](#license)

## XFI Token

`XFIToken` is an extended version of ERC20 standard. This extended version adds minting and token transfer management to the functionality described in the original EIP.

## Exchange

`Exchange` is the Ethereum XFI Exchange which allows Ethereum accounts to convert their WINGS or ETH to XFI and vice versa.

### Methods

#### estimateSwapWINGSForXFI

Returns estimation for swap of WINGS-XFI pair.

Input:
- `amountIn` (`uint256`) - amount of WINGS to swap.

Output:
- `amounts` (`uint256[]`) - estimation for swap of WINGS-XFI pair.

Example:

```solidity
estimateSwapWINGSForXFI(amountIn)
```

#### estimateSwapETHForXFI

Returns estimation for swap of ETH-XFI pair.

Input:
- `amountIn` (`uint256`) - amount of ETH to swap.

Output:
- `amounts` (`uint256[]`) - estimation for swap of ETH-XFI pair.

Example:

```solidity
estimateSwapETHForXFI(amountIn)
```

#### estimateSwapWINGSForXFIPerDay

Returns daily vesting estimation for swap of WINGS-XFI pair.

Input:
- `amountIn` (`uint256`) - amount of WINGS to swap.

Output:
- `amounts` (`uint256`) - estimated amount of XFI that will be vested each day of the vesting period.

Example:

```solidity
estimateSwapWINGSForXFIPerDay(amountIn)
```

#### estimateSwapETHForXFIPerDay

Returns daily vesting estimation for swap of ETH-XFI pair.

Input:
- `amountIn` (`uint256`) - amount of ETH to swap.

Output:
- `amounts` (`uint256[]`) - estimated amount of XFI that will be vested each day of the vesting period.

Example:

```solidity
estimateSwapETHForXFIPerDay(amountIn)
```

#### isSwappingStopped

Returns whether swapping is stopped.

*NOTE: To receive real-time updates on the status of the swaps, consider listening to `SwapsStarted` and `SwapsStopped` events.*

Example:

```solidity
isSwappingStopped()
```

#### maxGasPrice

Returns maximum gas price for swap. If set, any transaction that has a gas price exceeding this limit will be reverted.

Example:

```solidity
maxGasPrice()
```

#### swapWINGSForXFI

Executes swap of WINGS-XFI pair.

Emits a `SwapWINGSForXFI` event.

Input:
- `amountIn` (`uint256`) - amount of WINGS to swap.

Output:
- `amounts` (`uint256[]`) - result of a swap of WINGS-XFI pair.

Example:

```solidity
swapWINGSForXFI(amountIn)
```

#### swapETHForXFI

Executes swap of ETH-XFI pair.

Emits a `SwapETHForXFI` event.

Input:
- `amountOutMin` (`uint256`) - minimum amount of XFI to receive.

Output:
- `amounts` (`uint256[]`) - result of a swap of ETH-XFI pair.

Example:

```solidity
swapETHForXFI(amountOutMin)
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
- `UNISWAP_V2_ROUTER_ADDRESS` - address of the Uniswap V2 Router.

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
