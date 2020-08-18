'use strict';

const HDWalletProvider = require('truffle-hdwallet-provider');

const MNEMONIC = process.env.MNEMONIC;
const INFURA   = process.env.INFURA || 'https://ropsten.infura.io/v3/f31e8a625c21459ab430f19e3eede240'; // REVIEW Invalidate API key (reason: committed to git).

exports.getProvider = () => {
    if (!MNEMONIC) {
        throw new Error('to use ropsten, provide MNEMONIC via env, e.g. MNEMONIC=...');
    }

    return new HDWalletProvider(MNEMONIC, INFURA);
};
