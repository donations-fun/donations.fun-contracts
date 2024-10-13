import { Contract, ContractFactory, ethers, Interface, Wallet, Provider, getCreate2Address, keccak256 } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getSaltFromKey } from './basic';

export const isString = (arg) => {
  return typeof arg === 'string';
};

export const isNumber = (arg) => {
  return Number.isInteger(arg);
};

export const isStringArray = (arr) => Array.isArray(arr) && arr.every(isString);

export function isKeccak256Hash(input) {
  // Ensure it's a string of 66 characters length and starts with '0x'
  if (typeof input !== 'string' || input.length !== 66 || input.slice(0, 2) !== '0x') {
    return false;
  }

  // Ensure all characters after the '0x' prefix are hexadecimal (0-9, a-f, A-F)
  const hexPattern = /^[a-fA-F0-9]{64}$/;

  return hexPattern.test(input.slice(2));
}

export const getProvider = (hre) => {
  const rpcUrl = hre.network.config.url;
  if (!rpcUrl) {
    throw `⛔️ RPC URL wasn't found in "${hre.network.name}"! Please add a "url" field to the network config in hardhat.config.ts`;
  }

  return ethers.getDefaultProvider(rpcUrl);
};

export const getWallet = (hre, privateKey?: string) => {
  if (!privateKey) {
    // Get wallet private key from .env file
    if (!process.env.WALLET_PRIVATE_KEY) throw '⛔️ Wallet private key wasn\'t found in .env file!';
  }

  const provider = getProvider(hre);

  return new Wallet(privateKey ?? process.env.WALLET_PRIVATE_KEY!, provider);
};

export const verifyEnoughBalance = async (wallet: Wallet, amount: bigint) => {
  // Check if the wallet has enough balance
  const balance = await wallet.getBalance();
  if (balance < amount)
    throw `⛔️ Wallet balance is too low! Required ${ethers.formatEther(amount)} ETH, but current ${wallet.address} balance is ${ethers.formatEther(
      balance,
    )} ETH`;
};

/**
 * @param {string} data.contract The contract's path and name. E.g., "contracts/Greeter.sol:Greeter"
 */
export const verifyContract = async (
  hre,
  data: {
    address: string;
    contract: string;
    constructorArguments: string;
    bytecode: string;
  },
) => {
  const verificationRequestId: number = await hre.run('verify:verify', {
    ...data,
    noCompile: true,
  });
  return verificationRequestId;
};

const IDeployer = new Interface([
  'function deploy(bytes bytecode, bytes32 salt) external payable returns (address deployedAddress_)',
  'function deployAndInit(bytes bytecode, bytes32 salt, bytes init) external payable returns (address deployedAddress_)',
  'function deployedAddress(bytes bytecode, address sender, bytes32 salt) external view returns (address deployedAddress_)',
  'event Deployed(address indexed deployedAddress, address indexed sender, bytes32 indexed salt, bytes32 bytecodeHash)',
]);

type DeployContractOptions = {
  /**
   * If true, the deployment process will not print any logs
   */
  silent?: boolean;
  /**
   * If specified, the contract will be deployed using this wallet
   */
  wallet?: Wallet;
};

export const deployContractEVM = async (
  hre: HardhatRuntimeEnvironment,
  contractArtifactName: string,
  saltKey: string,
  contractJson: any,
  initializeArgs?: any[],
  options?: DeployContractOptions,
) => {
  const log = (message: string) => {
    if (!options?.silent) console.log(message);
  };

  log(`\nStarting deployment process on EVM of "${contractArtifactName}"...`);

  const wallet = options?.wallet ?? getWallet(hre);

  const salt = getSaltFromKey(saltKey);
  const factory = new ContractFactory(contractJson.abi, contractJson.bytecode, wallet);

  let contract = await hre.upgrades.deployProxy(factory, initializeArgs, {
    initializer: 'initialize',
    salt: getSaltFromKey(salt),
  });
  await contract.waitForDeployment();

  log(`\n"${contractArtifactName}" was successfully deployed:`);

  return contract;
};

export const upgradeContractEVM = async (
  hre: HardhatRuntimeEnvironment,
  contractArtifactName: string,
  proxyAddress: string,
  contractJson: any,
  oldContractJson: any | null,
  reinitializeArguments?: any[],
  options?: DeployContractOptions,
) => {
  const log = (message: string) => {
    if (!options?.silent) console.log(message);
  };

  log(`\nStarting upgrade process on EVM of "${contractArtifactName}"...`);

  const wallet = options?.wallet ?? getWallet(hre);

  if (oldContractJson) {
    const oldFactory = new ContractFactory(oldContractJson.abi, oldContractJson.bytecode, wallet);
    await hre.upgrades.forceImport(proxyAddress, oldFactory);
  }

  const factory = new ContractFactory(contractJson.abi, contractJson.bytecode, wallet);
  let contract = await hre.upgrades.upgradeProxy(proxyAddress, factory, {
    call: {
      fn: 'reinitialize',
      args: reinitializeArguments,
    },
  });
  await contract.waitForDeployment();

  log(`\n"${contractArtifactName}" was successfully upgraded:`);

  return contract;
};
