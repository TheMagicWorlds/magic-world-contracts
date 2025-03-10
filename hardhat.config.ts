import "@nomicfoundation/hardhat-toolbox"
import { HardhatUserConfig } from "hardhat/config"
import "hardhat-deploy"
import "@nomiclabs/hardhat-solhint"
import "solidity-coverage"
import "dotenv/config"
import '@typechain/hardhat'



// Environment variable setup
const RSK_MAINNET_RPC_URL = process.env.RSK_MAINNET_RPC_URL
const RSK_TESTNET_RPC_URL = process.env.RSK_TESTNET_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "0x"

const GANACHE_ACCOUNT_PRIVATE_KEY = "0x8a2ad2e6cac368f838fe2dcbd45e076bf96d9c938a2bd708d7ae662a33b6ea53"

console.log("ETHERSCAN_API_KEY", ETHERSCAN_API_KEY)
if (ETHERSCAN_API_KEY === "0x") {
	throw new Error("ETHERSCAN_API_KEY is not configured.")
}

// Ensure environment variables are configured
if (!RSK_MAINNET_RPC_URL) {
	throw new Error("The RPC URL for the mainnet is not configured.")
}

if (!RSK_TESTNET_RPC_URL) {
	// Fixed duplicate check for RSK_MAINNET_RPC_URL
	throw new Error("The RPC URL for the testnet is not configured.")
}

if (!PRIVATE_KEY) {
	throw new Error("Private key is not configured.")
}

// Hardhat configuration
const config: HardhatUserConfig = {
	defaultNetwork: "hardhat",

	networks: {
		hardhat: {
			// If you want to do some forking, uncomment this
			// forking: {
			//   url: MAINNET_RPC_URL
			// }
		},
		localhost: {
			url: "http://127.0.0.1:8545",
			accounts: [GANACHE_ACCOUNT_PRIVATE_KEY],
		},
		rskMainnet: {
			url: RSK_MAINNET_RPC_URL,
			chainId: 30,
			gasPrice: 60000000,
			accounts: [PRIVATE_KEY],
		},
		rskTestnet: {
			url: RSK_TESTNET_RPC_URL,
			chainId: 31,
			gasPrice: 60000000,
			accounts: [PRIVATE_KEY],
		},

		bscTestnet: {
			url: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
			chainId: 97,
			gasPrice: 20000000000,
			accounts: [PRIVATE_KEY]
		},
	},
	sourcify: {
		enabled: true
	},
	
	etherscan: {
		apiKey: {
			// Is not required by blockscout. Can be any non-empty string
			rsktestnet: "your API key",
			rskmainnet: "your API key",
			bscTestnet: ETHERSCAN_API_KEY,
		},
		customChains: [
			{
				network: "rsktestnet",
				chainId: 31,
				urls: {
					apiURL: "https://rootstock-testnet.blockscout.com/api/",
					browserURL: "https://rootstock-testnet.blockscout.com/",
				},
			},
			{
				network: "rskmainnet",
				chainId: 30,
				urls: {
					apiURL: "https://rootstock.blockscout.com/api/",
					browserURL: "https://rootstock.blockscout.com/",
				},
			},
		],
	},
	namedAccounts: {
		deployer: {
			default: 0, // Default is the first account
			mainnet: 0,
		},
		owner: {
			default: 0,
		},
	},
	solidity: {
		compilers: [
			{
				version: "0.8.24",
			},
		],
		
			settings: {
			  optimizer: {
				enabled: true,
				runs: 200
			}
		}
	},
}

export default config
