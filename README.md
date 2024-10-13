# Deploy contracts

Make sure to create a `.env` file from the `.env.example` file and update it with the correct parameters.

Also compile the contracts before using `npm run compile`

Also check the appropriate `json` config file under the `config` folder (eg: `config/avalancheFujiTestnet.json`) if it exists
and if the appropriate values are set in it (for verification) or if the addresses are not set (for deploying the contracts).

## Donate

`npm run deploy:donate` - deploys the contract on the default Avalanche Fuji Testnet

`npm run deploy:donate -- --network optimismSepolia` - deploys the contract on the Optimism Sepolia Testnet

`npm run deploy:multiversx:donate` - deploys the Donate contract on MultiversX

### Upgrade

`npm run upgrade:donate`

`npm run upgrade:donate -- --network optimismSepolia`

### Management functions

`npm run deploy:donate:add-known-charities-interchain`

`npm run deploy:donate:add-known-charities-interchain -- --network optimismSepolia`

### Sending tokens cross chain

`npm run interact:donate:to-optimism -- --value TestMemento:1` - send 1 TestMemento from Avalanche to Optimism Sepolia
`npm run interact:donate:to-multiversx -- --value TestMemento:1` - send 1 TestMemento from Avalanche to MultiversX

`npm run interact:donate:to-avalanche -- --value TestFantom:1` - send 1 TestFantom from Optimism Sepolia to Avalanche Fuji
`npm run interact:donate:multiversx:to-avalanche -- EGLD:0.01` - send 0.01 EGLD from MultiversX to Avalanche
