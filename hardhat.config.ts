import { HardhatUserConfig, task } from 'hardhat/config';

import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-chai-matchers';
// @ts-ignore
import dotenv from 'dotenv';
import { interactDonate } from './interact/donate';

// Load env file
dotenv.config();

task('interact', 'Interacts with contracts')
  .addParam('contract')
  .addParam('destinationChain')
  .addParam('destinationAddress')
  .addParam('value')
  .setAction(async function(taskArguments, hre) {
    const contract = taskArguments.contract;

    switch (contract) {
      case 'Donate.sol': {
        await interactDonate(
          hre,
          taskArguments.destinationChain,
          taskArguments.destinationAddress,
          taskArguments.value,
        );

        return;
      }
    }

    throw new Error('Unsupported contract');
  });

const config: HardhatUserConfig = {
  defaultNetwork: 'avalancheFujiTestnet',
  networks: {
    hardhat: {},
    avalancheFujiTestnet: {
      url: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
      accounts: [process.env.WALLET_PRIVATE_KEY],
    },
    optimismSepolia: {
      url: 'https://optimism-sepolia-rpc.publicnode.com',
      accounts: [process.env.WALLET_PRIVATE_KEY],
    }
  },
  solidity: {
    version: '0.8.17',
  },
};

export default config;
