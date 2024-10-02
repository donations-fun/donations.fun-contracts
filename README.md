# ZkSync instructions

Since zkSync EVM does not properly support `create2` and `create3` functions, we need to use `create` to deploy the contracts instead.
https://docs.zksync.io/build/developer-reference/ethereum-differences/evm-instructions#create-create2

Because of this, we do not know the addresses of the deployed contracts beforehand, hence for the Axelar Amplifier Gateway we need to know
the `domainSeparator` value in advance, since the CosmWasm contract deployment needs to have this Solidity contract deployed first.

# Deploy contracts

Make sure to create a `.env` file from the `.env.example` file and update it with the correct parameters.

Also compile the contracts before using `npm run compile`

Also check the appropriate `json` config file under the `config` folder (eg: `config/zkSyncSepoliaTestnet.json`) if it exists
and if the appropriate values are set in it (for verification) or if the addresses are not set (for deploying the contracts).

1. **Deploy Axelar Amplifier Gateway contract**:

`npm run deploy:initial-gateway` - deploys the initial Gateway contracts, from which only the proxy will be used afterwards;
this is because ZkSync Create2 is different from EVM and takes into account also the arguments, so we need to first deploy this in order to have the
proper Gateway (proxy) contract address to pass when deploying the CosmWasm contracts

2. **Deploy CosmWasm contracts**:

`npm run deploy:cosmwasm` - make sure to first update the appropriate `config` file with the proper values under the `axelar` key (check `config/zkStackMemento.json` for reference)

3. `npm run deploy:full-gateway` - will deploy a new Gateway (implementation) contract and upgrade it;
needs to be run after the CosmWasm contracts are deployed since it will query them for correct WeightedSigners

# Interacting

## Hello World

`npm run deploy:hello-world`

`npm run interact:hello-world` - will send a cross chain HelloWorld message to fantom and print out the current values in our contract

## Simple Bridge

`npm run deploy:simple-bridge` - deploys the contract on the default ZkStack chain

`npm run deploy:simple-bridge -- --network avalancheFujiTestnet` - deploys the contract on the Avalanche Fuji Testnet

`npm run deploy:multiversx:simple-bridge` - deploys the SimpleBridge contract on MultiversX

`npm run deploy:stellar:simple-bridge` - deploys the SimpleBridge contract on Stellar

### Upgrade

`npm run upgrade:simple-bridge -- --network avalancheFujiTestnet`

## Tokens

`npm run deploy:tokens` - deploys the TestERC20 tokens defined in the config

`npm run deploy:tokens -- --network avalancheFujiTestnet` - deploy for other chain

`npm run deploy:multiversx:tokens` - deploys the needed test ESDTs on MultiversX

`npm run deploy:stellar:tokens` - deploys the needed test Assets on Stellar

### Sending tokens cross chain

`npm run interact:bridge:to-avalanche -- --value TestMemento:1` - send 1 TestMemento from Memento to Avalanche
`npm run interact:bridge:to-multiversx -- --value TestMemento:1` - send 1 TestMemento from Memento to MultiversX

`npm run interact:bridge:to-memento -- --value TestFantom:1` - send 1 TestFantom from Avalanche Fuji to Memento
`npm run interact:bridge:multiversx:to-memento -- EGLD:0.01` - send 0.01 EGLD from MultiversX to Memento

`npm run interact:bridge:to-stellar -- --value TestMemento:1` - send 1 TestMemento from Memento to Stellar
`npm run interact:bridge:stellar:to-memento -- TestStellar:1000000000000000` - send 0.01 TestStellar from Stellar to Memento

### Burning tokens cross chain

`npm run interact:burn -- --value 0xF12372616f9c986355414BA06b3Ca954c0a7b0dC:1` - burn 1 NativeBurnableMemento on Memento and Avalanche for the respective address
