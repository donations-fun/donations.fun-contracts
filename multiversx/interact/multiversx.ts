import { Command } from 'commander';
import { e, envChain, World } from 'xsuite';
import { Contract } from 'xsuite/dist/world/world';
import { loadConfig, printInfo, prompt, saveConfig } from '../../deploy/helpers/basic';

const config = loadConfig('multiversx');

const world = World.new({
  chainId: envChain.id(),
});

const loadWallet = () => world.newWalletFromFile('./multiversx/wallet.json');

const program = new Command();

program.command('deploy-donate').action(async () => {
  const gatewayAddress = config.contracts?.AxelarAmplifierGateway?.address;

  if (!gatewayAddress) {
    throw new Error('No Gateway contract');
  }

  const contractConfig = config.contracts.Donate;

  const wallet = await loadWallet();

  contractConfig.deployer = wallet.toString();

  let contract: Contract;
  if (contractConfig.address) {
    printInfo('Donate.sol contract already exists in config, not redeploying...');

    contract = world.newContract(contractConfig.address);
  } else {
    if (prompt(`Do you want to proceed with deployment? (double check everything first!)`)) {
      return;
    }

    printInfo('Deploying Donate.sol contract...');

    const result = await wallet.deployContract({
      code: 'file:./multiversx/output/donate.wasm',
      codeMetadata: ['upgradeable'],
      gasLimit: 100_000_000,
      codeArgs: [
        e.Addr(gatewayAddress),
      ],
    });
    console.log('Transaction:', result.explorerUrl);
    console.log('Contract:', result.contract.explorerUrl);

    contract = world.newContract(result.contract.toString());
  }

  printInfo('Donate.sol Address', contract.toString());

  contractConfig.address = contract.toString();

  printInfo('Deployment status', 'SUCCESS');

  if (contractConfig?.knownChains) {
    for (const chainName in contractConfig.knownChains) {
      const chainAddress = contractConfig.knownChains[chainName];

      printInfo(`Adding known chain ${chainName}`, chainAddress);

      const transaction = await wallet.callContract({
        callee: contract,
        funcName: 'addKnownChain',
        gasLimit: 10_000_000,
        funcArgs: [
          e.Str(chainName),
          e.Str(chainAddress),
        ],
      });

      console.log('Sent transaction', transaction.hash);
    }
  }

  saveConfig(config, 'multiversx');
});

program.command('upgrade-donate').action(async () => {
  const donateAddress = config.contracts?.Donate?.address;

  if (!donateAddress) {
    throw new Error('Donate contract not deployed yet');
  }

  const wallet = await loadWallet();

  const result = await wallet.upgradeContract({
    callee: e.Addr(donateAddress),
    code: 'file:./multiversx/output/donate.wasm',
    codeMetadata: ['upgradeable'],
    gasLimit: 100_000_000,
  });
  console.log('Transaction:', result.explorerUrl);
});

program.parse(process.argv);
