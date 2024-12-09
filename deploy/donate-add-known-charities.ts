import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { loadConfig, printInfo } from './helpers/basic';
import { ContractFactory } from 'ethers';
import { getWallet } from './helpers/utils';

const main = async (hre: HardhatRuntimeEnvironment) => {
  const Donate = require('#artifacts/contracts/donate/Donate.sol/Donate.json');

  const networkName = hre.network.name;

  const config = loadConfig(networkName);

  const contractConfig = config.contracts?.Donate;

  if (!contractConfig?.address) {
    throw new Error('Donate contract not deployed yet');
  }

  const wallet = getWallet(hre);

  let donateFactory = new ContractFactory(Donate.abi, Donate.bytecode, wallet);
  const contract = donateFactory.attach(contractConfig?.address);

  if (contractConfig?.knownCharities) {
    for (const charityName in contractConfig.knownCharities) {
      const chainAddress = contractConfig.knownCharities[charityName];

      printInfo(`Adding known charity ${charityName}`, chainAddress);

      const transaction = await contract.addKnownCharity(charityName, chainAddress);
      await transaction.wait();

      console.log('Sent transaction', transaction.hash);
    }
  }
};

main(hre).catch(console.error);