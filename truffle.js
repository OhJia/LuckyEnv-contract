// Allows us to use ES6 in our migrations and tests.
require('babel-register');
require('dotenv').config();
var HDWalletProvider = require("truffle-hdwallet-provider");

module.exports = {
	networks: {
		// development: {
		// 	host: 'localhost',
		// 	port: 8545,
		// 	network_id: '*', // Match any network id
		// 	gas: 4000000
		// },
		ropsten: {
		  provider: function() {
		    return new HDWalletProvider(process.env.MNEMONIC, "https://ropsten.infura.io/" + process.env.INFURA_ACCESS_TOKEN)
		  },
		  network_id: 3,
		  gas: 3600000,
		  gasPrice: 20000000000
		},
		mainnet: {
		  provider: function() {
		    return new HDWalletProvider(process.env.MNEMONIC, "https://mainnet.infura.io/" + process.env.INFURA_ACCESS_TOKEN)
		  },
		  network_id: 1,
		  gas: 3600000,
		  gasPrice: 20000000000
		}   
	}
}
