# DFI Token | Ethereum DFI Exchange

This repository is a home for the DFIToken contract as well as the Ethereum DFI Exchange which allows Ethereum accounts to convert their WINGS or ETH to DFI and vice versa.

## Contracts

### DFI Token

`DFIToken` is an extended version of ERC20 standard. This extended version adds minting and token transfer management to the functionality described in the original EIP.

### Exchange

`Exchange` is the Ethereum DFI Exchange which allows Ethereum accounts to convert their WINGS or ETH to DFI and vice versa.

## Requirements

- Nodejs ~10.16.2
- Truffle ~5.1.33
- Ganache-cli ~6.9.1

## Deploy

Configure `truffle-config.js` (see [configuration manual](http://truffleframework.com/docs/advanced/configuration)).

Build contracts:

```bash
npm run build
```

Migrate contracts:

```bash
npm run migrate
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
