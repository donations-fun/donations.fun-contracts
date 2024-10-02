import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deployContractEVM, getEvmCreate2Address, getWallet } from './helpers/utils';
import { BaseContract, keccak256, ContractFactory } from 'ethers';
import { loadConfig, printError, printInfo, prompt, saveConfig } from './helpers/basic';

const contractArtifactName = 'SimpleBridge';

async function verifyDeployment(configGatewayAddress: string, contract) {
  // Verify deployment
  let error = false;

  const gatewayAddress = await contract.gateway();

  printInfo(`Existing Gateway Address`, gatewayAddress);

  if (configGatewayAddress !== gatewayAddress) {
    printError(`ERROR: Retrieved Gateway address is different:`);
    printError(`   Actual:   ${gatewayAddress}`);
    printError(`   Expected: ${configGatewayAddress}`);
    error = true;
  }

  return error;
}

export default async function (hre: HardhatRuntimeEnvironment) {
  const SimpleBridge = require('#artifacts/contracts/demo/Donate.sol.sol/Donate.sol.json');

  const networkName = hre.network.name;

  const config = loadConfig(networkName);

  if (config.contracts[contractArtifactName] === undefined) {
    config.contracts[contractArtifactName] = {};
  }

  const wallet = getWallet(hre);

  const contractConfig = config.contracts[contractArtifactName];

  const salt = 'SimpleBridge';
  printInfo('Contract deploy salt', salt);

  contractConfig.deployer = wallet.address;

  const gatewayAddress = config.contracts?.AxelarAmplifierGateway?.address;

  if (!gatewayAddress) {
    throw new Error('Gateway contract not deployed yet');
  }

  const initializeArgs = [gatewayAddress, wallet.address];

  let simpleBridgeFactory = new ContractFactory(SimpleBridge.abi, SimpleBridge.bytecode, wallet);

  printInfo(`Deploy contract on EVM chain ${hre.network.name}`);

  const deployerAddress = config.contracts?.ConstAddressDeployer?.address;

  if (!gatewayAddress) {
    throw new Error('Deployer contract not deployed yet');
  }

  let contractAddress = await getEvmCreate2Address(deployerAddress, wallet, SimpleBridge, salt, []);

  printInfo('Donate.sol contract address', contractAddress);

  /// Deploying contract

  let contract: BaseContract;
  if (contractConfig.address) {
    printInfo('Donate.sol contract already exists in config, not redeploying...');

    contract = simpleBridgeFactory.attach(contractConfig.address);
  } else {
    if (prompt(`Do you want to proceed with deployment? (double check everything first!)`)) {
      return;
    }

    printInfo('Deploying Donate.sol contract...');

    contract = await deployContractEVM(
      hre,
      contractArtifactName,
      salt,
      SimpleBridge,
      config.contracts.ConstAddressDeployer.address,
      initializeArgs,
      {
        wallet,
        proxy: true,
      },
    );
  }

  contractAddress = await contract.getAddress();

  printInfo('Donate.sol Address', contractAddress);

  const deployedCode = await contract.getDeployedCode();
  const codehash = Buffer.from(keccak256(deployedCode)).toString('hex');
  printInfo('Codehash', codehash);

  let error = await verifyDeployment(gatewayAddress, contract);

  if (error) {
    printError('Deployment status', 'FAILED');
    return;
  }

  contractConfig.address = contractAddress;
  contractConfig.deploymentMethod = 'create2';
  contractConfig.salt = salt;

  printInfo('Deployment status', 'SUCCESS');

  if (contractConfig?.knownChains) {
    for (const chainName in contractConfig.knownChains) {
      const chainAddress = contractConfig.knownChains[chainName];

      printInfo(`Adding known chain ${chainName}`, chainAddress);

      const transaction = await contract.addKnownChain(chainName, chainAddress);
      await transaction.wait();

      console.log('Sent transaction', transaction.hash);
    }
  }

  saveConfig(config, networkName);
}
