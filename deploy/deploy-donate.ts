import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deployContractEVM, getEvmCreate2Address, getWallet } from './helpers/utils';
import { BaseContract, keccak256, ContractFactory } from 'ethers';
import { loadConfig, printError, printInfo, prompt, saveConfig } from './helpers/basic';

const contractArtifactName = 'Donate';

async function verifyDeployment(configItsAddress: string, contract) {
  // Verify deployment
  let error = false;

  const itsAddress = await contract.interchainTokenService();

  printInfo(`Existing Gateway Address`, itsAddress);

  if (configItsAddress !== itsAddress) {
    printError(`ERROR: Retrieved ITS address is different:`);
    printError(`   Actual:   ${itsAddress}`);
    printError(`   Expected: ${configItsAddress}`);
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

  const salt = 'Donate';
  printInfo('Contract deploy salt', salt);

  contractConfig.deployer = wallet.address;

  const itsAddress = config.contracts?.InterchainTokenService?.address;

  if (!itsAddress) {
    throw new Error('ITS contract not deployed yet');
  }

  const initializeArgs = [wallet.address, itsAddress];

  let donateFactory = new ContractFactory(Donate.abi, Donate.bytecode, wallet);

  printInfo(`Deploy contract on EVM chain ${hre.network.name}`);

  /// Deploying contract

  let contract: BaseContract;
  if (contractConfig.address) {
    printInfo('Donate.sol contract already exists in config, not redeploying...');

    contract = donateFactory.attach(contractConfig.address);
  } else {
    if (prompt(`Do you want to proceed with deployment? (double check everything first!)`)) {
      return;
    }

    printInfo('Deploying Donate.sol contract...');

    contract = await deployContractEVM(
      hre,
      contractArtifactName,
      salt,
      Donate,
      initializeArgs,
      {
        wallet,
      },
    );
  }

  const contractAddress = await contract.getAddress();

  printInfo('Donate.sol Address', contractAddress);

  const deployedCode = await contract.getDeployedCode();
  const codehash = Buffer.from(keccak256(deployedCode)).toString('hex');
  printInfo('Codehash', codehash);

  let error = await verifyDeployment(itsAddress, contract);

  if (error) {
    printError('Deployment status', 'FAILED');
    return;
  }

  contractConfig.address = contractAddress;
  contractConfig.deploymentMethod = 'create2';
  contractConfig.salt = salt;

  printInfo('Deployment status', 'SUCCESS');

  saveConfig(config, networkName);
}

main(hre).catch(console.error);
