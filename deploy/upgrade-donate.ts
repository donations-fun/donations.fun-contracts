import hre from 'hardhat';

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getWallet, upgradeContractEVM } from './helpers/utils';
import { keccak256 } from 'ethers';
import { loadConfig, printError, printInfo, prompt, saveConfig } from './helpers/basic';

const contractArtifactName = 'Donate';

async function verifyDeployment(configInterchainTokenServiceAddress: string, contract) {
  // Verify deployment
  let error = false;

  const interchainTokenService = await contract.interchainTokenService();

  printInfo(`Existing Interchain Token Service Address`, interchainTokenService);

  if (configInterchainTokenServiceAddress !== interchainTokenService) {
    printError(`ERROR: Retrieved Interchain Token Address is different:`);
    printError(`   Actual:   ${interchainTokenService}`);
    printError(`   Expected: ${configInterchainTokenServiceAddress}`);
    error = true;
  }

  return error;
}

const main = async (hre: HardhatRuntimeEnvironment) => {
  const Donate = require('#artifacts/contracts/donate/Donate.sol/Donate.json');

  const networkName = hre.network.name;

  const config = loadConfig(networkName);

  if (config.contracts[contractArtifactName] === undefined) {
    config.contracts[contractArtifactName] = {};
  }

  const wallet = getWallet(hre);

  const contractConfig = config.contracts[contractArtifactName];

  const interchainTokenService = config.contracts?.InterchainTokenService?.address;

  if (!interchainTokenService) {
    throw new Error('Interchain token service contract not deployed yet');
  }

  const proxyAddress = contractConfig?.address;

  if (!proxyAddress) {
    throw new Error('Contract proxy not yet deployed');
  }

  const reinitializeArgs = [];

  printInfo('Donate.sol proxy contract address', proxyAddress);

  /// Deploying contract

  if (prompt(`Do you want to proceed with upgrade? (double check everything first!)`)) {
    return;
  }

  printInfo('Upgrading Donate.sol contract...');

  const contract = await upgradeContractEVM(
    hre,
    contractArtifactName,
    proxyAddress,
    Donate,
    null, // require('./abis/OldDonate.json'), // TODO: Change this if needed
    reinitializeArgs,
    {
      wallet,
    },
  );

  const contractAddress = await contract.getAddress();

  printInfo('Donate.sol Address', contractAddress);

  const deployedCode = await contract.getDeployedCode();
  const codehash = Buffer.from(keccak256(deployedCode)).toString('hex');
  printInfo('Codehash', codehash);

  let error = await verifyDeployment(interchainTokenService, contract);

  if (error) {
    printError('Deployment status', 'FAILED');
    return;
  }

  contractConfig.address = contractAddress;
  contractConfig.deploymentMethod = 'create2';

  printInfo('Deployment status', 'SUCCESS');

  saveConfig(config, networkName);
}

main(hre).catch(console.error);
