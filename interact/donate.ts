import { getEvmWallet, getWallet } from '../deploy/helpers/utils';
import { loadConfig } from '../deploy/helpers/basic';
import { ContractFactory, solidityPacked, toUtf8Bytes } from 'ethers';
import { fromBech32 } from '@cosmjs/encoding';

export const interactDonate = async (
  hre,
  destinationChain: string,
  destinationAddress: string,
  value: string,
) => {
  const Donate = require('#artifacts/contracts/demo/Donate.sol/Donate.sol.json');

  const [tokenName, amount] = value.split(':');

  if (!tokenName || !amount) {
    throw new Error('Invalid value');
  }

  const networkName = hre.network.name;

  const config = loadConfig(networkName);
  const tokenAddress = config.tokens?.[tokenName]?.address;

  if (!tokenAddress) {
    throw new Error('Invalid token');
  }

  const donateAddress = config.contracts?.Donate?.address;

  if (!donateAddress) {
    throw new Error('Donate.sol contract not deployed yet');
  }

  const tokenId = config.tokens[tokenName].tokenId;

  const wallet = getWallet(hre);

  // Set allowance

  const tokenFactory = new ContractFactory(TestERC20.abi, TestERC20.bytecode, wallet);
  const tokenContract = tokenFactory.attach(tokenAddress);

  let transaction = await tokenContract.approve(donateAddress, String(BigInt(amount) * BigInt(10 ** 18)));
  await transaction.wait();

  console.log('Sent allowance transaction', transaction.hash);

  // Do cross chain transfer

  const donateFactory = new ContractFactory(Donate.abi, Donate.bytecode, wallet);
  const donateContract = donateFactory.attach(donateAddress);

  transaction = await donateContract.sendToken(
    destinationChain,
    tokenId,
    destinationAddress.startsWith('0x')
      ? destinationAddress
      : '0x' + Buffer.from(
      destinationAddress.startsWith('erd') ? fromBech32(destinationAddress).data : destinationAddress,
    ).toString('hex'),
    String(BigInt(amount) * BigInt(10 ** 18)),
  );
  await transaction.wait();

  console.log('Sent cross chain transaction', transaction.hash);

  const payload = solidityPacked(
    ['bytes32', 'uint256', 'bytes'],
    [tokenId, BigInt(amount) * BigInt(10 ** 18), toUtf8Bytes(destinationAddress)],
  );

  console.log('Cross chain payload', payload);
};
