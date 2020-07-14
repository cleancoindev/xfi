# DFI Token | Ethereum DFI Exchange

This repository is a home for the DFI Token contract as well as the Ethereum DFI Exchange which allows Ethereum accounts to convert their WINGS or ETH to DFI and vice versa.

## Contents

- [DFI Token](#dfi-token)
- [Exchange](#exchange)
  - [estimateSwapWINGSForDFI](#estimateSwapWINGSForDFI)
  - [estimateSwapETHForDFI](#estimateSwapETHForDFI)
  - [estimateSwapDFIForWINGS](#estimateSwapDFIForWINGS)
  - [estimateSwapDFIForETH](#estimateSwapDFIForETH)
  - [isSwappingStopped](#isSwappingStopped)
  - [swapWINGSForDFI](#swapWINGSForDFI)
  - [swapETHForDFI](#swapETHForDFI)
  - [swapDFIForWINGS](#swapDFIForWINGS)
  - [swapDFIForETH](#swapDFIForETH)
- [Requirements](#requirements)
- [Compiling](#compiling)
- [Deploying](#deploying)
- [Testing](#testing)
- [License](#license)

## DFI Token

`DFIToken` is an extended version of ERC20 standard. This extended version adds minting and token transfer management to the functionality described in the original EIP.

## Exchange

`Exchange` is the Ethereum DFI Exchange which allows Ethereum accounts to convert their WINGS or ETH to DFI and vice versa.

### Methods

#### estimateSwapWINGSForDFI

Returns estimation for swap of WINGS-DFI pair.

Input:
- `amountIn` (`uint256`) - amount of WINGS to swap.

Output:
- `amounts` (`uint256[]`) - estimation for swap of WINGS-DFI pair.

#### estimateSwapETHForDFI

Returns estimation for swap of ETH-DFI pair.

Input:
- `amountIn` (`uint256`) - amount of ETH to swap.

Output:
- `amounts` (`uint256[]`) - estimation for swap of ETH-DFI pair.

#### estimateSwapDFIForWINGS

Returns estimation for swap of DFI-WINGS pair.

Input:
- `amountIn` (`uint256`) - amount of DFI to swap.

Output:
- `amounts` (`uint256[]`) - estimation for swap of DFI-WINGS pair.

#### estimateSwapDFIForETH

Returns estimation for swap of DFI-ETH pair.

Input:
- `amountIn` (`uint256`) - amount of DFI to swap.

Output:
- `amounts` (`uint256[]`) - estimation for swap of DFI-ETH pair.

#### isSwappingStopped

Returns whether swapping is stopped.

*NOTE: To receive real-time updates on the status of the swaps, consider listening to `SwapsStarted` and `SwapsStopped` events.*

#### swapWINGSForDFI

Executes swap of WINGS-DFI pair.

Emits a `SwapWINGSForDFI` event.

Input:
- `amountIn` (`uint256`) - amount of WINGS to swap.

Output:
- `amounts` (`uint256[]`) - result of a swap of WINGS-DFI pair.

#### swapETHForDFI

Executes swap of ETH-DFI pair.

Emits a `SwapETHForDFI` event.

Input:
- `amountOutMin` (`uint256`) - minimum amount of DFI to receive.

Output:
- `amounts` (`uint256[]`) - result of a swap of ETH-DFI pair.

#### swapDFIForWINGS

Executes swap of DFI-WINGS pair.

Emits a `SwapDFIForWINGS` event.

Input:
- `amountIn` (`uint256`) - amount of DFI to swap.

Output:
- `amounts` (`uint256[]`) - result of a swap of DFI-WINGS pair.

#### swapDFIForETH

Executes swap of DFI-ETH pair.

Emits a `SwapDFIForETH` event.

Input:
- `amountIn` (`uint256`) - amount of DFI to swap.
- `amountOutMin` (`uint256`) - minimum amount of ETH to receive.

Output:
- `amounts` (`uint256[]`) - result of a swap of DFI-ETH pair.

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

Build contracts:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## License

[MIT](./LICENSE)
